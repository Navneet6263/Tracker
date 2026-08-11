import ctypes
import os
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, time as clock_time, timezone
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

_mutex_handle = None
_latest_state = "offline"
_latest_app = None
_watchdog_pid = None


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
        inputs = get_and_reset_input_status()
        if not is_within_assigned_shift():
            accumulator.flush()
            _latest_state, _latest_app = "off_shift", None
            time.sleep(SAMPLE_INTERVAL_SECS)
            continue

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
            if response.get("command") == "stop_client":
                STOP_FILE.parent.mkdir(parents=True, exist_ok=True)
                STOP_FILE.write_text(datetime.now(timezone.utc).isoformat(), encoding="utf-8")
                save_event("client_stopped", {"reason": "authorized_remote_command"})
                os._exit(0)

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


def main():
    if not _acquire_singleton():
        return
    if STOP_FILE.exists() and "--resume-tracking" not in sys.argv:
        return
    if "--resume-tracking" in sys.argv:
        STOP_FILE.unlink(missing_ok=True)
    init_db()
    if not auto_authenticate():
        return
    start_tracking()
    save_event("client_started", {"session_id": SESSION_ID})
    start_watchdog()
    threading.Thread(target=watchdog_guard_loop, daemon=True).start()
    threading.Thread(target=activity_loop, daemon=True).start()
    threading.Thread(target=sync_loop, daemon=True).start()

    import pystray
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (64, 64), color=(30, 41, 59))
    draw = ImageDraw.Draw(image)
    draw.ellipse([16, 16, 48, 48], fill=(16, 185, 129))
    pystray.Icon(
        "SentinelTracker",
        image,
        "Sentinel Tracker - activity metadata only",
    ).run()


if __name__ == "__main__":
    main()
