import time
import threading
import sys
import os
import socket
from utils.local_db import (
    init_db, save_screenshot, save_event,
    get_pending_screenshots, get_pending_events,
    mark_screenshot_uploaded, mark_event_uploaded
)
from utils.uploader import is_online, upload_screenshot, upload_event, ping_online
from utils.screenshot import capture_screenshot
from utils.win_utils import is_screen_locked, is_system_idle, get_active_window_title
from utils.input_tracker import start_tracking, get_and_reset_input_status

# ── Singleton lock: only ONE instance allowed ────────────────────────────────
_LOCK_PORT = 47291
_lock_socket = None

def _acquire_singleton():
    """Returns True if this is the only running instance."""
    global _lock_socket
    try:
        _lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        _lock_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        _lock_socket.bind(("127.0.0.1", _LOCK_PORT))
        _lock_socket.listen(1)
        return True
    except OSError:
        print("[Tracker] Another instance is already running. Exiting.")
        return False

SCREENSHOT_INTERVAL = 15  # 15 seconds for testing
SYNC_INTERVAL = 10
IDLE_THRESHOLD = 1800  # 30 mins

_was_locked = False
_was_offline = False

def screenshot_loop():
    global _was_locked
    while True:
        locked = is_screen_locked()
        if locked:
            if not _was_locked:
                save_event("screen_locked", {})
                _was_locked = True
            time.sleep(10)
            continue

        if _was_locked:
            save_event("screen_unlocked", {})
            _was_locked = False

        if not is_system_idle(IDLE_THRESHOLD):
            title = get_active_window_title()
            path = capture_screenshot(window_title=title)  # Blocked apps return None

            if path is None:
                # Window was blocked (banking/gallery etc.) - skip saving
                time.sleep(SCREENSHOT_INTERVAL)
                continue

            # Fetch input status
            inputs = get_and_reset_input_status()

            save_screenshot(
                path, title,
                inputs["keyboard_active"],
                inputs["mouse_active"],
                inputs["win_r_count"]
            )

        time.sleep(SCREENSHOT_INTERVAL)

def sync_loop():
    global _was_offline
    while True:
        if is_online():
            if _was_offline:
                ping_online()
                save_event("came_online", {})
                _was_offline = False

            for row in get_pending_screenshots():
                # Extract all 7 columns now
                rid, fp, ts, wt, k_act, m_act, wr_c = row
                if upload_screenshot(fp, ts, wt, bool(k_act), bool(m_act), wr_c):
                    mark_screenshot_uploaded(rid)

            for row in get_pending_events():
                rid, etype, payload, ts = row
                if upload_event(etype, eval(payload), ts):
                    mark_event_uploaded(rid)
        else:
            if not _was_offline:
                save_event("went_offline", {})
                _was_offline = True

        time.sleep(SYNC_INTERVAL)

def command_loop():
    while True:
        if is_online():
            cmd = ping_online()
            if cmd == "take_screenshot":
                from datetime import datetime, timezone
                title = get_active_window_title()
                path = capture_screenshot(window_title=title)
                if path:
                    inputs = get_and_reset_input_status()
                    ts = datetime.now(timezone.utc).isoformat()
                    success = upload_screenshot(path, ts, title, inputs["keyboard_active"], inputs["mouse_active"], inputs["win_r_count"])
                    if not success:
                        save_screenshot(path, title, inputs["keyboard_active"], inputs["mouse_active"], inputs["win_r_count"])
        time.sleep(3)

import sys
import subprocess
import os
import psutil

# ... (rest of imports are at top)

def start_watchdog():
    """Spawns the watchdog process to protect this tracker."""
    main_pid = os.getpid()
    main_exe_path = os.path.abspath(sys.argv[0])
    
    # Check if we were launched BY the watchdog
    is_from_watchdog = "--from-watchdog" in sys.argv
    if is_from_watchdog:
        print("Started by watchdog. Not spawning a new one yet.")
        # Optionally, we could monitor the watchdog here, but if the watchdog dies, 
        # it's usually because the user killed it. We can just spawn a new one.
        pass

    try:
        # Determine if we are running as an exe or script
        if main_exe_path.endswith('.py'):
            watchdog_path = os.path.join(os.path.dirname(main_exe_path), 'watchdog.py')
            subprocess.Popen([sys.executable, watchdog_path, str(main_pid), main_exe_path],
                             creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS)
        else:
            # When compiled, we should probably compile watchdog as a separate exe, 
            # or use multiprocessing to spawn a separate process. For simplicity, 
            # we assume watchdog.exe is in the same directory.
            watchdog_path = os.path.join(os.path.dirname(main_exe_path), 'watchdog.exe')
            if os.path.exists(watchdog_path):
                subprocess.Popen([watchdog_path, str(main_pid), main_exe_path],
                                 creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS)
        print("Watchdog spawned successfully.")
    except Exception as e:
        print(f"Failed to spawn watchdog: {e}")

def main():
    # Enforce single instance
    if not _acquire_singleton():
        sys.exit(0)

    init_db()
    start_tracking()
    
    # Spawn the watchdog to protect this process
    start_watchdog()

    threading.Thread(target=screenshot_loop, daemon=True).start()
    threading.Thread(target=sync_loop, daemon=True).start()
    threading.Thread(target=command_loop, daemon=True).start()

    # System tray
    import pystray
    from PIL import Image, ImageDraw

    def make_icon():
        img = Image.new("RGB", (64, 64), color=(30, 30, 30))
        d = ImageDraw.Draw(img)
        d.ellipse([16, 16, 48, 48], fill=(0, 200, 100))
        return img

    # Create the icon WITHOUT a menu, so they can't quit!
    icon = pystray.Icon(
        "Tracker",
        make_icon(),
        "Employee Tracker (Active)"
    )
    icon.run()

if __name__ == "__main__":
    main()
