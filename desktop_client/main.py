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
from utils.uploader import is_online, upload_screenshot, upload_event, ping_online, get_employee_token, authenticate_employee
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

SCREENSHOT_INTERVAL = 15  # 15 seconds
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
            path = capture_screenshot(window_title=title)

            if path is None:
                time.sleep(SCREENSHOT_INTERVAL)
                continue

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

def show_login_dialog() -> bool:
    """Shows a 1-time login setup window if employee is not logged in."""
    if get_employee_token():
        return True

    import tkinter as tk
    from tkinter import messagebox

    root = tk.Tk()
    root.title("Sentinel Employee Tracker Setup")
    root.geometry("380x260")
    root.resizable(False, False)
    root.configure(bg="#1e293b")

    # Center window
    root.eval('tk::PlaceWindow . center')

    tk.Label(root, text="Employee Monitoring Client Setup", font=("Segoe UI", 11, "bold"), bg="#1e293b", fg="#f8fafc").pack(pady=(15, 2))
    tk.Label(root, text="Enter your employee credentials to activate tracking:", font=("Segoe UI", 8), bg="#1e293b", fg="#94a3b8").pack(pady=(0, 15))

    frame = tk.Frame(root, bg="#1e293b")
    frame.pack(padx=20)

    tk.Label(frame, text="Email:", bg="#1e293b", fg="#cbd5e1", font=("Segoe UI", 9)).grid(row=0, column=0, sticky="w", pady=6)
    email_entry = tk.Entry(frame, width=28, font=("Segoe UI", 10))
    email_entry.grid(row=0, column=1, pady=6)
    email_entry.focus()

    tk.Label(frame, text="Password:", bg="#1e293b", fg="#cbd5e1", font=("Segoe UI", 9)).grid(row=1, column=0, sticky="w", pady=6)
    pass_entry = tk.Entry(frame, width=28, show="•", font=("Segoe UI", 10))
    pass_entry.grid(row=1, column=1, pady=6)

    status_label = tk.Label(root, text="", bg="#1e293b", fg="#ef4444", font=("Segoe UI", 8))
    status_label.pack(pady=4)

    success = [False]

    def on_submit():
        email = email_entry.get().strip()
        password = pass_entry.get().strip()
        if not email or not password:
            status_label.config(text="Please enter email and password.", fg="#ef4444")
            return

        status_label.config(text="Connecting to server...", fg="#38bdf8")
        root.update()

        ok, msg = authenticate_employee(email, password)
        if ok:
            success[0] = True
            messagebox.showinfo("Success", "Employee Tracker connected successfully!\nApp will run silently in background.")
            root.destroy()
        else:
            status_label.config(text=msg, fg="#ef4444")

    submit_btn = tk.Button(root, text="Connect & Start Tracking", command=on_submit, bg="#10b981", fg="#ffffff", font=("Segoe UI", 10, "bold"), activebackground="#059669", activeforeground="#ffffff", relief="flat", padx=10, pady=4)
    submit_btn.pack(pady=8)

    root.mainloop()
    return success[0]

def start_watchdog():
    """Spawns watchdog process."""
    main_pid = os.getpid()
    main_exe_path = os.path.abspath(sys.argv[0])
    
    is_from_watchdog = "--from-watchdog" in sys.argv
    if is_from_watchdog:
        return

    try:
        if main_exe_path.endswith('.py'):
            watchdog_path = os.path.join(os.path.dirname(main_exe_path), 'watchdog.py')
            subprocess.Popen([sys.executable, watchdog_path, str(main_pid), main_exe_path],
                             creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS)
        else:
            watchdog_path = os.path.join(os.path.dirname(main_exe_path), 'watchdog.exe')
            if os.path.exists(watchdog_path):
                subprocess.Popen([watchdog_path, str(main_pid), main_exe_path],
                                 creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS)
    except Exception as e:
        print(f"Failed to spawn watchdog: {e}")

import subprocess

def main():
    if not _acquire_singleton():
        sys.exit(0)

    from utils.uploader import auto_authenticate
    auto_authenticate()

    init_db()
    start_tracking()
    start_watchdog()

    threading.Thread(target=screenshot_loop, daemon=True).start()
    threading.Thread(target=sync_loop, daemon=True).start()
    threading.Thread(target=command_loop, daemon=True).start()

    import pystray
    from PIL import Image, ImageDraw

    def make_icon():
        img = Image.new("RGB", (64, 64), color=(30, 30, 30))
        d = ImageDraw.Draw(img)
        d.ellipse([16, 16, 48, 48], fill=(0, 200, 100))
        return img

    icon = pystray.Icon(
        "Tracker",
        make_icon(),
        "Employee Tracker (Active)"
    )
    icon.run()

if __name__ == "__main__":
    main()
