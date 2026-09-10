"""Sentinel v3 shared-PC agent. Uses browser-based work identity, never Windows
username as employee identity. No input/app metadata is recorded before sign-in.
"""
import json
import logging
import os
from pathlib import Path
import secrets
import sys
import threading
import time
import tkinter as tk
from tkinter import messagebox, simpledialog
import uuid
import webbrowser
from datetime import datetime, timezone

import requests
from main import (_acquire_singleton, configure_logging, IDENTITY, STOP_FILE,
                  ActivityAccumulator, start_watchdog, watchdog_guard_loop)
from utils.input_tracker import get_and_reset_input_status, start_tracking
from utils.win_utils import (get_active_app_name, get_active_window_title, get_idle_seconds,
                             is_current_session_active, is_screen_locked, detect_voip_call)
from utils.work_queue import WorkQueue

LOGGER = logging.getLogger("sentinel.shared")


def utc():
    return datetime.now(timezone.utc)


def parse(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


WORK_NOTICE = (
    "OK karne par app/window titles aur keyboard/mouse activity counts company admin "
    "ke liye record honge. Kaam khatam hone par End work dabayein."
)


class WorkIdentityDialog(simpledialog.Dialog):
    def __init__(self, parent, name, initial_reason=""):
        self.employee_name, self.initial_reason = name, initial_reason
        super().__init__(parent, "Admin Request")

    def body(self, master):
        tk.Label(master, text=f"Aap {self.employee_name} hain?", font=("Segoe UI", 15), wraplength=460).pack(pady=12)
        tk.Label(master, text=WORK_NOTICE, wraplength=460, justify="left").pack(padx=12, pady=8)
        tk.Label(master, text="Start nahi karna? Reason likhein (sirf admin ko bhejne ke liye).\n"
                             "Account, PC, time aur reason admin ko dikhenge.\n"
                             "Maximum 1000 characters. Password ya personal secrets na likhein.",
                 wraplength=460, justify="left").pack(padx=12, pady=8)
        self.reason_box = tk.Text(master, width=55, height=4, wrap="word")
        self.reason_box.insert("1.0", self.initial_reason)
        self.reason_box.pack(padx=12, pady=8)
        return self.reason_box

    def buttonbox(self):
        buttons = tk.Frame(self)
        for label, action in (("OK, start work", "start"), ("Account badlo", "change"),
                              ("Reason admin ko bhejo", "decline")):
            tk.Button(buttons, text=label, command=lambda a=action: self.choose(a)).pack(side="left", padx=5, pady=12)
        buttons.pack()
        self.bind("<Escape>", self.cancel)

    def choose(self, action):
        reason = self.reason_box.get("1.0", "end").strip() if action == "decline" else ""
        if action == "decline" and not 1 <= len(reason) <= 1000:
            messagebox.showwarning("Reason chahiye", "1 se 1000 characters mein reason likhein.", parent=self)
            return
        self.result = {"action": action, "reason": reason}
        self.cancel()


def confirm_work_identity(parent, name, initial_reason=""):
    """Closing or escaping never counts as agreement or sends a reason."""
    parent.deiconify()
    parent.lift()
    return WorkIdentityDialog(parent, name, initial_reason).result


class SharedAccumulator(ActivityAccumulator):
    def __init__(self, owner):
        self.owner = owner
        super().__init__()

    def flush(self, cutoff=None):
        if self.state is None or self.started_at is None:
            return
        session = self.owner.active
        if session:
            ended = min(cutoff or utc(), parse(session["expires_at"]))
            duration = int((ended - self.started_at).total_seconds())
            if duration > 0:
                payload = {"event_id": str(uuid.uuid4()), "session_id": session["session_id"],
                           "device_name": session["device_name"], "windows_user": IDENTITY["username"],
                           "state": self.state, "app_name": self.app_name, "domain": self.context_title,
                           "started_at": self.started_at.isoformat(), "ended_at": ended.isoformat(),
                           "keyboard_events": self.keyboard_events, "mouse_events": self.mouse_events,
                           "keyboard_active_secs": min(duration, self.keyboard_active_secs),
                           "mouse_active_secs": min(duration, self.mouse_active_secs)}
                self.owner.queue.put(session["session_id"], "activity", {"samples": [payload]})
                self.owner.queue.set_state("last_observed", ended.isoformat())
        self.reset()


class SharedAgent:
    def __init__(self, queue, base_url):
        self.queue, self.base_url = queue, base_url.rstrip("/")
        self.lock = threading.RLock()
        self.active = None
        self.state, self.app = "offline", None
        self.status = "Sign in to start work."
        self.accumulator = SharedAccumulator(self)
        self.stopped = False
        self.ready = False
        self.last_sample = None
        previous = queue.get_state("active_session")
        if previous:
            # Process restart never silently resumes a previous person's identity.
            end = parse(queue.get_state("last_observed") or previous["started_at"])
            end = max(parse(previous["started_at"]), min(end, parse(previous["expires_at"])))
            queue.put(previous["session_id"], "end", {"ended_at": end.isoformat()})
            queue.set_state("active_session", None)

    def headers(self):
        device = self.queue.get_state("device")
        return {"Authorization": "Device " + device["id"] + "." + device["key"]}

    def request(self, method, path, body=None):
        return requests.request(method, self.base_url + "/work" + path, json=body,
                                headers=self.headers(), timeout=15)

    def enroll(self, enrollment_key):
        device = self.queue.get_state("device")
        if not device:
            device = {"id": str(uuid.uuid4()), "key": secrets.token_urlsafe(48)}
            self.queue.set_state("device", device)
        response = requests.post(self.base_url + "/work/devices", json={
            "device_id": device["id"], "device_key": device["key"],
            "enrollment_key": enrollment_key, "name": IDENTITY["hostname"]}, timeout=15)
        response.raise_for_status()
        self.queue.set_state("enrolled", True)

    def activate(self, session):
        with self.lock:
            self.end_work()
            self.active = session
            self.last_sample = utc()
            self.queue.set_state("active_session", session)
            self.queue.set_state("last_observed", session["started_at"])
            get_and_reset_input_status()
            self.status = "Tracking: " + session["name"]

    def end_work(self, reason="Work ended. Sign in for the next employee.", cutoff=None):
        with self.lock:
            if self.active:
                self.accumulator.flush(cutoff)
                end = min(cutoff or utc(), parse(self.active["expires_at"]))
                self.queue.put(self.active["session_id"], "end", {"ended_at": end.isoformat()})
                self.queue.set_state("active_session", None)
            self.active = None
            self.last_sample = None
            self.state, self.app = "offline", None
            self.status = reason

    def collect_loop(self):
        while not self.stopped:
            try:
                with self.lock:
                    inputs = get_and_reset_input_status()
                    if self.active:
                        sample_time = utc()
                        if self.last_sample and (sample_time - self.last_sample).total_seconds() > 15:
                            self.end_work("Computer resumed or sampling was interrupted. Sign in again.", self.last_sample)
                        elif sample_time >= parse(self.active["expires_at"]):
                            self.end_work("Shift session expired. Sign in again.")
                        elif is_screen_locked() or not is_current_session_active():
                            self.end_work("Windows locked/switched. Sign in again to resume.")
                        elif get_idle_seconds() >= 600:
                            self.end_work("Paused after 10 minutes without input. Sign in to resume.")
                        else:
                            title = get_active_window_title()
                            app = get_active_app_name()
                            if (app or "").lower() == "lockapp" or title.strip().casefold() == "windows default lock screen":
                                self.end_work("Windows locked. Sign in again to resume.")
                                continue
                            provider = detect_voip_call(title)
                            state = "meeting" if provider else (
                                "active" if inputs["keyboard_active"] or inputs["mouse_active"] else
                                "idle" if get_idle_seconds() >= 300 else "passive")
                            self.state, self.app = state, provider or app
                            self.accumulator.add(state, self.app, " ".join(title.split())[:255] or None, inputs)
                            self.last_sample = sample_time
            except Exception:
                LOGGER.exception("Shared activity collection failed")
                self.end_work("Tracking paused after an error. Sign in again.")
            time.sleep(1)

    def sync_loop(self):
        while not self.stopped:
            try:
                if not self.ready:
                    time.sleep(2)
                    continue
                for row_id, session_id, kind, payload in self.queue.pending():
                    response = self.request("POST", f"/sessions/{session_id}/{kind}", payload)
                    if response.ok:
                        if response.json().get("rejected_event_ids"):
                            self.queue.quarantine(row_id, "Outside original work session")
                        else:
                            self.queue.remove(row_id)
                    elif response.status_code in (403, 409, 422):
                        self.queue.quarantine(row_id, "Upload rejected: " + str(response.status_code))
                    else:
                        break
                with self.lock:
                    session = dict(self.active) if self.active else None
                    state, app = self.state, self.app
                if session:
                    response = self.request("POST", "/sessions/" + session["session_id"] + "/ping",
                                            {"state": state, "app_name": app})
                    with self.lock:
                        if self.active and self.active["session_id"] == session["session_id"]:
                            if response.status_code in (401, 403, 409):
                                self.end_work("Session ended or moved to another PC. Sign in to resume.")
                            elif response.ok:
                                if response.json().get("command") == "stop_client":
                                    self.end_work("Stopped by administrator.")
                                    STOP_FILE.write_text(utc().isoformat(), encoding="utf-8")
                                    self.stopped = True
                                else:
                                    self.status = "Tracking: " + session["name"]
                            else:
                                self.status = "Offline: saving records for " + session["name"]
            except requests.RequestException:
                self.status = "Server unavailable. Existing session records remain queued."
            except Exception:
                LOGGER.exception("Shared upload failed")
            time.sleep(15)


def main():
    configure_logging()
    if not _acquire_singleton():
        return
    if STOP_FILE.exists():
        if "--resume-tracking" not in sys.argv:
            return
        STOP_FILE.unlink()
    from urllib.parse import urlparse
    base = os.getenv("TRACKER_SERVER", "https://tracker.greencall.online/api")
    parsed_base = urlparse(base)
    if parsed_base.scheme != "https" or not parsed_base.hostname or parsed_base.username or parsed_base.query or parsed_base.fragment:
        raise RuntimeError("Shared Tracker requires an HTTPS API")
    queue = WorkQueue(Path(os.getenv("APPDATA")) / "SentinelTracker" / "shared.db")
    agent = SharedAgent(queue, base)
    root = tk.Tk()
    root.title("Sentinel - Shared PC")
    root.geometry("460x290")
    tk.Label(root, text="Start your work session", font=("Segoe UI", 16)).pack(pady=15)
    tk.Label(root, text="Sign in with your own work account.\nApp usage and activity counts are recorded during your session.", wraplength=430).pack()
    status = tk.StringVar(value=agent.status)
    tk.Label(root, textvariable=status, wraplength=430).pack(pady=15)
    provider_buttons = []
    jobs = __import__("queue").Queue()
    busy = False

    def background(task, success, failure=None):
        def run():
            try:
                result = task()
                jobs.put(lambda: success(result))
            except Exception as exc:
                LOGGER.warning("Work sign-in/setup failed (%s)", type(exc).__name__)
                jobs.put(lambda: (failure or finish_error)())
        threading.Thread(target=run, daemon=True).start()

    def finish_error():
        nonlocal busy
        busy = False
        agent.status = "Could not complete sign-in/setup. Check connection or contact your administrator."

    def start_login(provider):
        nonlocal busy
        if busy:
            return
        busy = True
        agent.end_work("Opening work sign-in...")
        def task():
            response = agent.request("POST", "/login", {"provider": provider, "windows_user": IDENTITY["username"]})
            response.raise_for_status()
            data = response.json()
            webbrowser.open(data["authorization_url"])
            for _ in range(120):
                time.sleep(3)
                response = agent.request("GET", "/login/" + data["login_id"])
                response.raise_for_status()
                if response.json()["ready"]:
                    return data["login_id"], response.json()["name"]
            raise RuntimeError("Sign-in timed out")
        def verified(result, initial_reason=""):
            nonlocal busy
            login_id, name = result
            decision = confirm_work_identity(root, name, initial_reason)
            if not decision:
                busy = False
                agent.status = "Tracking shuru nahi hui. Start work dabakar apna Microsoft account choose karein."
                return
            if decision["action"] == "change":
                busy = False
                root.after(100, lambda: start_login(provider))
                return
            if decision["action"] == "decline":
                def submit_reason():
                    response = agent.request("POST", "/login/" + login_id + "/decline", {"reason": decision["reason"]})
                    response.raise_for_status()
                    return response.json()
                def submitted(_):
                    nonlocal busy
                    busy = False
                    agent.status = "Reason admin ko bhej diya. Tracking shuru nahi hui."
                def retry_reason():
                    agent.status = "Reason submit nahi hua. Tracking band hai."
                    messagebox.showwarning("Reason nahi bheja gaya", "Connection check karke retry karein. "
                                           "Sign-in expire hua ho to Account badlo se dobara login karein.", parent=root)
                    root.after(100, lambda: verified(result, decision["reason"]))
                background(submit_reason, submitted, retry_reason)
                return
            def confirm():
                response = agent.request("POST", "/login/" + login_id + "/confirm")
                response.raise_for_status()
                return response.json()
            def started(session):
                nonlocal busy
                busy = False
                agent.activate(session)
                root.iconify()
            background(confirm, started)
        background(task, verified)

    def setup():
        nonlocal busy
        if busy:
            return
        key = None
        if not queue.get_state("enrolled"):
            key = simpledialog.askstring("Device setup", "Administrator: enter device enrollment key (one-time).", show="*")
            if not key:
                return
        busy = True
        def task():
            if key:
                agent.enroll(key)
            response = agent.request("GET", "/providers")
            response.raise_for_status()
            return response.json()["providers"]
        def configured(providers):
            nonlocal busy
            busy = False
            agent.ready = True
            for button in provider_buttons:
                button.destroy()
            provider_buttons.clear()
            for provider in providers:
                label = "Microsoft / Teams" if provider == "microsoft" else "Keka"
                button = tk.Button(root, text="Start work with " + label, command=lambda p=provider: start_login(p))
                button.pack(pady=3)
                provider_buttons.append(button)
            agent.status = "Choose your work account." if providers else "Work login needs company configuration. Contact your administrator."
        background(task, configured)

    tk.Button(root, text="End work / Change employee", command=lambda: agent.end_work()).pack()
    tk.Button(root, text="Setup / Reconnect", command=setup).pack(pady=4)
    def close_window():
        agent.end_work()
        root.iconify()
    root.protocol("WM_DELETE_WINDOW", close_window)
    def tick():
        while not jobs.empty():
            jobs.get_nowait()()
        status.set(agent.status)
        if agent.stopped:
            root.destroy()
            return
        root.after(300, tick)
    start_tracking()
    start_watchdog()
    threading.Thread(target=watchdog_guard_loop, daemon=True).start()
    threading.Thread(target=agent.collect_loop, daemon=True).start()
    threading.Thread(target=agent.sync_loop, daemon=True).start()
    root.after(500, setup)
    tick()
    root.mainloop()


def self_test(report_path):
    """Packaged smoke test: no enrollment, tracking hooks, watchdog or uploads."""
    import tempfile
    with tempfile.TemporaryDirectory(prefix="sentinel-shared-test-") as directory:
        queue = WorkQueue(Path(directory) / "shared.db")
        queue.put("test-session", "end", {"ended_at": utc().isoformat()})
        assert queue.pending()[0][1] == "test-session"
        window = tk.Tk()
        window.withdraw()
        window.update_idletasks()
        window.destroy()
    Path(report_path).write_text(json.dumps({"status": "ok", "tkinter": True, "queue": True,
                                           "tracking_started": False, "network_used": False}), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--self-test":
        self_test(sys.argv[2])
    else:
        main()
