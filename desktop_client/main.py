import ctypes
import logging
import os
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, time as clock_time, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from zoneinfo import ZoneInfo

from utils.input_tracker import get_and_reset_input_status, start_tracking
from utils.local_db import (
    delete_activity,
    delete_events,
    get_pending_activity,
    get_pending_events,
    init_db,
    save_activity,
    save_event,
)
from utils.uploader import (
    auto_authenticate,
    get_user_config,
    ping_online,
    save_user_config,
    upload_activity,
    upload_event,
)
from utils.win_utils import (
    detect_voip_call,
    get_active_app_name,
    get_active_window_title,
    get_idle_seconds,
    get_windows_identity,
    is_current_session_active,
    is_screen_locked,
)


SAMPLE_INTERVAL_SECS = 1
FLUSH_INTERVAL_SECS = 30
SYNC_INTERVAL_SECS = 15
HEARTBEAT_INTERVAL_SECS = 30
IDLE_THRESHOLD_SECS = int(os.getenv("TRACKER_IDLE_SECONDS", "300"))
SESSION_ID = uuid.uuid4().hex
IDENTITY = get_windows_identity()
STOP_FILE = Path(os.getenv("APPDATA") or os.path.expanduser("~")) / "SentinelTracker" / "stop.requested"
LOG_FILE = STOP_FILE.parent / "tracker.log"
LOGGER = logging.getLogger("sentinel")

_mutex_handle = None
_latest_state = "offline"
_latest_app = None
_watchdog_pid = None
_is_session_active = False
_active_email = None
_active_name = None
_shift_end_prompted_date = None
_shift_dialog_open = False
_current_tray_icon = None
_session_started_at = None


def trigger_checkout():
    """Programmatically ends the current tracking session and unblocks tray icon."""
    global _is_session_active, _current_tray_icon
    LOGGER.info("Triggering checkout / end shift...")
    _is_session_active = False
    if _current_tray_icon:
        try:
            _current_tray_icon.stop()
        except Exception as exc:
            LOGGER.warning("Error stopping tray icon: %s", exc)


# =========================================================================
# AUTHENTICATION MODE CONFIGURATION:
# "POPUP": Shows interactive Check-In dialog asking agent for official email.
# "AUTO" : Automatically detects active user from Teams, Keka, and Chrome.
# =========================================================================
AUTH_MODE = "POPUP"


def configure_logging():
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=1_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    if not root_logger.handlers:
        root_logger.addHandler(handler)


def _acquire_singleton() -> bool:
    global _mutex_handle
    identity_key = (IDENTITY.get("windows_sid") or IDENTITY["username"]).replace("\\", "_")
    mutex_name = f"Local\\SentinelTracker_{identity_key}"
    _mutex_handle = ctypes.windll.kernel32.CreateMutexW(None, False, mutex_name)
    return bool(_mutex_handle) and ctypes.windll.kernel32.GetLastError() != 183


def _parse_hhmm(value: str) -> clock_time:
    hour, minute = value.split(":", 1)
    return clock_time(int(hour), int(minute))


def is_within_assigned_shift() -> bool:
    shift = get_user_config().get("shift")
    if not shift:
        return True
    try:
        local_now = datetime.now(ZoneInfo(shift.get("timezone", "Asia/Kolkata"))).time()
        start = _parse_hhmm(shift["start"])
        end = _parse_hhmm(shift["end"])
        if start <= end:
            return start <= local_now <= end
        return local_now >= start or local_now <= end
    except Exception:
        return True


def check_shift_end_and_notify():
    """
    Checks if the employee's shift has completed.
    Instead of automatically cutting off tracking, prompts the employee with an interactive
    dialog asking if they want to end their shift & check out, or continue working (overtime).
    """
    global _shift_end_prompted_date, _shift_dialog_open
    if not _is_session_active or _shift_dialog_open:
        return

    shift = get_user_config().get("shift")
    tz_name = shift.get("timezone", "Asia/Kolkata") if shift else "Asia/Kolkata"
    shift_name = shift.get("name", "Day Shift (9-6)") if shift else "Day Shift (9-6)"
    start_str = shift.get("start", "09:00") if shift else "09:00"
    end_str = shift.get("end", "18:00") if shift else "18:00"

    try:
        now_dt = datetime.now(ZoneInfo(tz_name))
        today_str = now_dt.strftime("%Y-%m-%d")
        if _shift_end_prompted_date == today_str:
            return

        start_time = _parse_hhmm(start_str)
        end_time = _parse_hhmm(end_str)
        if start_time <= end_time:
            shift_ended = now_dt.time() >= end_time
        else:
            # Cross-midnight overnight shift (e.g. 20:00 to 06:00)
            # Shift ends in the morning between 06:00 and start_time (20:00)
            shift_ended = end_time <= now_dt.time() < start_time

        if shift_ended:
            _shift_end_prompted_date = today_str

            def _prompt_in_thread():
                global _shift_dialog_open
                _shift_dialog_open = True
                try:
                    from utils.login_dialog import prompt_shift_end_dialog

                    agent_label = _active_name or (_active_email.split("@")[0].title() if _active_email else "Agent")
                    should_end = prompt_shift_end_dialog(
                        employee_name=agent_label,
                        shift_name=shift_name,
                        shift_start=start_str,
                        shift_end=end_str,
                    )
                    if should_end:
                        LOGGER.info("Agent clicked 'End Shift & Check Out' in shift end dialog.")
                        trigger_checkout()
                    else:
                        LOGGER.info("Agent clicked 'Continue Working (Overtime)'. Tracking continues.")
                except Exception as exc:
                    LOGGER.error("Failed to show shift end dialog: %s", exc)
                finally:
                    _shift_dialog_open = False

            threading.Thread(target=_prompt_in_thread, daemon=True).start()
    except Exception as exc:
        LOGGER.debug("Error checking shift end: %s", exc)



class ActivityAccumulator:
    def __init__(self):
        self.reset()

    def reset(self):
        self.state = None
        self.app_name = None
        self.context_title = None
        self.started_at = None
        self.started_monotonic = None
        self.keyboard_events = 0
        self.mouse_events = 0
        self.keyboard_active_secs = 0
        self.mouse_active_secs = 0

    def add(self, state: str, app_name: str | None, context_title: str | None, inputs: dict):
        now_monotonic = time.monotonic()
        if self.state is not None and (
            self.state != state
            or self.app_name != app_name
            or self.context_title != context_title
        ):
            self.flush()
        if self.state is None:
            self.state = state
            self.app_name = app_name
            self.context_title = context_title
            self.started_at = datetime.now(timezone.utc)
            self.started_monotonic = now_monotonic
        self.keyboard_events += inputs["keyboard_events"]
        self.mouse_events += inputs["mouse_events"]
        if inputs["keyboard_active"]:
            self.keyboard_active_secs += SAMPLE_INTERVAL_SECS
        if inputs["mouse_active"]:
            self.mouse_active_secs += SAMPLE_INTERVAL_SECS
        if now_monotonic - self.started_monotonic >= FLUSH_INTERVAL_SECS:
            self.flush()

    def flush(self):
        if self.state is None or self.started_at is None:
            return
        ended_at = datetime.now(timezone.utc)
        duration = int((ended_at - self.started_at).total_seconds())
        if duration > 0:
            save_activity(
                {
                    "event_id": str(uuid.uuid4()),
                    "session_id": SESSION_ID,
                    "device_name": IDENTITY["hostname"],
                    "windows_user": IDENTITY["username"],
                    "state": self.state,
                    "app_name": self.app_name,
                    "domain": self.context_title,
                    "started_at": self.started_at.isoformat(),
                    "ended_at": ended_at.isoformat(),
                    "keyboard_events": self.keyboard_events,
                    "mouse_events": self.mouse_events,
                    "keyboard_active_secs": min(duration, self.keyboard_active_secs),
                    "mouse_active_secs": min(duration, self.mouse_active_secs),
                }
            )
        self.reset()


def activity_loop():
    global _latest_app, _latest_state
    accumulator = ActivityAccumulator()
    was_locked = False
    voip_provider = None
    voip_until = 0.0

    while True:
        if not _is_session_active:
            accumulator.flush()
            _latest_state, _latest_app = "offline", None
            time.sleep(SAMPLE_INTERVAL_SECS)
            continue

        inputs = get_and_reset_input_status()
        # Automatic tracking stop is disabled to support continuous overtime and client calls.
        # Employees are prompted with an interactive dialog when their shift ends instead of hard-pausing.


        locked = is_screen_locked() or not is_current_session_active()
        if locked:
            state, app_name, context_title = "locked", None, None
            if not was_locked:
                save_event("screen_locked", {"session_id": SESSION_ID})
            was_locked = True
        else:
            if was_locked:
                save_event("screen_unlocked", {"session_id": SESSION_ID})
            was_locked = False
            title = get_active_window_title()
            context_title = " ".join(title.split())[:255] if title else None
            app_name = get_active_app_name()
            detected_provider = detect_voip_call(title)
            if detected_provider:
                voip_provider = detected_provider
                voip_until = time.monotonic() + 60
            if voip_provider and time.monotonic() <= voip_until:
                state, app_name = "meeting", voip_provider
            elif inputs["keyboard_active"] or inputs["mouse_active"]:
                state = "active"
            elif get_idle_seconds() < IDLE_THRESHOLD_SECS:
                state = "passive"
            else:
                state = "idle"

        _latest_state, _latest_app = state, app_name
        accumulator.add(state, app_name, context_title, inputs)
        time.sleep(SAMPLE_INTERVAL_SECS)


def sync_loop():
    was_offline = False
    last_heartbeat = 0.0
    while True:
        activity_rows = get_pending_activity()
        activity_ids = [row_id for row_id, _ in activity_rows]
        activity_payload = [payload for _, payload in activity_rows]
        activity_ok = not activity_payload or upload_activity(activity_payload)
        if activity_ok:
            delete_activity(activity_ids)

        event_rows = get_pending_events()
        uploaded_event_ids = []
        for row_id, event_type, payload, timestamp in event_rows:
            if upload_event(event_type, payload, timestamp):
                uploaded_event_ids.append(row_id)
            else:
                break
        delete_events(uploaded_event_ids)

        online = activity_ok and len(uploaded_event_ids) == len(event_rows)
        if online and was_offline:
            save_event("came_online", {"session_id": SESSION_ID})
            was_offline = False
        elif not online and not was_offline:
            save_event("went_offline", {"session_id": SESSION_ID})
            was_offline = True

        if online and time.monotonic() - last_heartbeat >= HEARTBEAT_INTERVAL_SECS:
            response = ping_online(_latest_state, _latest_app)
            last_heartbeat = time.monotonic()
            if "shift" in response and response["shift"] != get_user_config().get("shift"):
                save_user_config({"shift": response["shift"]})
            if response.get("command") == "stop_client":
                STOP_FILE.parent.mkdir(parents=True, exist_ok=True)
                STOP_FILE.write_text(datetime.now(timezone.utc).isoformat(), encoding="utf-8")
                save_event("client_stopped", {"reason": "authorized_remote_command"})
                os._exit(0)

        check_shift_end_and_notify()
        time.sleep(SYNC_INTERVAL_SECS)



def start_watchdog(force: bool = False):
    global _watchdog_pid
    if "--from-watchdog" in sys.argv and not force:
        try:
            pid_index = sys.argv.index("--watchdog-pid") + 1
            _watchdog_pid = int(sys.argv[pid_index])
        except (ValueError, IndexError):
            _watchdog_pid = None
        return
    executable_path = os.path.abspath(sys.argv[0])
    try:
        if executable_path.lower().endswith(".py"):
            watchdog_path = os.path.join(os.path.dirname(executable_path), "watchdog.py")
            command = [
                sys.executable,
                watchdog_path,
                str(os.getpid()),
                executable_path,
                str(STOP_FILE),
            ]
        else:
            watchdog_path = os.path.join(os.path.dirname(executable_path), "TrackerWatchdog.exe")
            if not os.path.exists(watchdog_path):
                return
            command = [watchdog_path, str(os.getpid()), executable_path, str(STOP_FILE)]
        process = subprocess.Popen(
            command,
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS,
        )
        _watchdog_pid = process.pid
    except Exception as exc:
        print(f"[Watchdog] Failed to start: {exc}")


def watchdog_guard_loop():
    """Restarts the watchdog if it is stopped while the tracker is still authorized."""
    global _watchdog_pid
    import psutil

    while not STOP_FILE.exists():
        running = False
        if _watchdog_pid:
            try:
                running = psutil.Process(_watchdog_pid).is_running()
            except psutil.Error:
                running = False
        if not running:
            start_watchdog(force=True)
        time.sleep(5)


def _handle_identity_switch(new_email: str, new_name: str):
    global SESSION_ID
    LOGGER.info("Dynamic user switch detected: %s (%s)", new_email, new_name)
    save_event("session_ended", {"reason": "user_identity_switch", "session_id": SESSION_ID})

    if auto_authenticate(force=True, detected_email=new_email, detected_name=new_name):
        SESSION_ID = uuid.uuid4().hex
        save_event("session_started", {"session_id": SESSION_ID, "switched_to": new_email})
        LOGGER.info("Tracking session successfully switched to %s <%s>", new_name, new_email)


def create_tray_icon(email: str, name: str, on_end_shift):
    import pystray
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (64, 64), color=(30, 41, 59))
    draw = ImageDraw.Draw(image)
    draw.ellipse([16, 16, 48, 48], fill=(16, 185, 129))

    display_name = name or (email.split("@")[0].title() if "@" in email else email)
    menu = pystray.Menu(
        pystray.MenuItem(f"Agent: {display_name}", None, enabled=False),
        pystray.MenuItem(f"Email: {email}", None, enabled=False),
        pystray.MenuItem("Status: Active / Tracking", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("⏹ End Shift / Check-Out", on_end_shift),
    )

    icon = pystray.Icon(
        "SentinelTracker",
        image,
        f"Sentinel Tracker - {display_name} ({email})",
        menu=menu,
    )
    return icon


def make_end_shift_handler():
    def on_end_shift(icon, item):
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        confirmed = messagebox.askyesno(
            "End Shift / Check-Out",
            "Are you sure you want to end your shift?\n\nTracking will pause until the next check-in.",
            parent=root,
        )
        root.destroy()
        if confirmed:
            LOGGER.info("Agent confirmed shift end / check-out")
            global _is_session_active
            _is_session_active = False
            icon.stop()
    return on_end_shift


def main():
    global SESSION_ID, _is_session_active, _active_email, _active_name
    configure_logging()
    if not _acquire_singleton():
        LOGGER.info("Tracker is already running for this Windows profile")
        return
    if STOP_FILE.exists() and "--resume-tracking" not in sys.argv:
        return
    if "--resume-tracking" in sys.argv:
        STOP_FILE.unlink(missing_ok=True)
    init_db()
    start_tracking()
    start_watchdog()
    threading.Thread(target=watchdog_guard_loop, daemon=True).start()
    threading.Thread(target=activity_loop, daemon=True).start()
    threading.Thread(target=sync_loop, daemon=True).start()

    # =========================================================================
    # PREVIOUS AUTOMATIC IDENTITY DETECTION (TEAMS / KEKA / CHROME)
    # Preserved in comments as requested. To switch back to auto-detection,
    # change AUTH_MODE = "AUTO" at top of file and uncomment the block below:
    # =========================================================================
    # if AUTH_MODE == "AUTO":
    #     from utils.identity_detector import detect_current_identity, IdentityWatcher
    #     initial_id = detect_current_identity(get_active_window_title())
    #     initial_email = initial_id.get("email") if initial_id else None
    #     initial_name = initial_id.get("name") if initial_id else None
    #     while not auto_authenticate(detected_email=initial_email, detected_name=initial_name):
    #         LOGGER.info("Waiting 30 seconds before retrying profile fetch")
    #         time.sleep(30)
    #     _is_session_active = True
    #     save_event("client_started", {"session_id": SESSION_ID})
    #     identity_watcher = IdentityWatcher(callback=_handle_identity_switch, check_interval_secs=15)
    #     identity_watcher.start()
    #     icon = create_tray_icon(initial_email or "Auto", initial_name or "Agent", make_end_shift_handler())
    #     icon.run()
    #     return
    # =========================================================================

    from utils.login_dialog import prompt_user_checkin

    # Interactive check-in loop for shared workstations & shifts
    while True:
        email, name = prompt_user_checkin()
        if not email:
            LOGGER.warning("Check-in dialog closed or cancelled. Re-prompting in 10s...")
            time.sleep(10)
            continue

        LOGGER.info("Agent checked in: %s <%s>", name, email)
        while not auto_authenticate(force=True, detected_email=email, detected_name=name):
            LOGGER.info("Waiting 10 seconds before retrying profile fetch")
            time.sleep(10)

        _active_email = email
        _active_name = name
        SESSION_ID = uuid.uuid4().hex
        _is_session_active = True
        _shift_end_prompted_date = None
        _session_started_at = datetime.now()
        save_event("session_started", {"session_id": SESSION_ID, "email": email, "name": name})

        # Run system tray icon (blocks until agent clicks "End Shift / Check-Out")
        icon = create_tray_icon(email, name, make_end_shift_handler())
        _current_tray_icon = icon
        icon.run()
        _current_tray_icon = None

        # When icon.run() stops (agent clicked End Shift):
        _is_session_active = False
        save_event("session_ended", {"session_id": SESSION_ID, "reason": "manual_checkout", "email": email})
        LOGGER.info("Shift ended for %s <%s>. Opening Check-In popup for next agent...", name, email)



if __name__ == "__main__":
    main()
