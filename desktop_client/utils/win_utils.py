import ctypes
import getpass
import os
import re

import psutil


def is_current_session_active() -> bool:
    """True only for the interactive console session currently shown to the user."""
    try:
        current_session = ctypes.c_uint()
        ctypes.windll.kernel32.ProcessIdToSessionId(os.getpid(), ctypes.byref(current_session))
        active_session = ctypes.windll.kernel32.WTSGetActiveConsoleSessionId()
        return current_session.value == active_session
    except Exception:
        return True


def is_screen_locked() -> bool:
    if not is_current_session_active():
        return True
    try:
        return ctypes.windll.user32.GetForegroundWindow() == 0
    except Exception:
        return False


def get_idle_seconds() -> float:
    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_ulong)]

    try:
        info = LASTINPUTINFO()
        info.cbSize = ctypes.sizeof(LASTINPUTINFO)
        if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info)):
            return 0.0
        uptime_ms = ctypes.windll.kernel32.GetTickCount64()
        return max(0.0, (uptime_ms - info.dwTime) / 1000.0)
    except Exception:
        return 0.0


def is_system_idle(idle_threshold_secs: int = 300) -> bool:
    return get_idle_seconds() >= idle_threshold_secs


def _foreground_process():
    try:
        import win32process

        hwnd = ctypes.windll.user32.GetForegroundWindow()
        if not hwnd:
            return None
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        return psutil.Process(pid)
    except Exception:
        return None


def get_active_window_title() -> str:
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        buffer = ctypes.create_unicode_buffer(length + 1)
        ctypes.windll.user32.GetWindowTextW(hwnd, buffer, length + 1)
        return buffer.value
    except Exception:
        return ""


def get_active_app_name() -> str:
    process = _foreground_process()
    if process is None:
        return "Unknown"
    try:
        name = process.name()
        return os.path.splitext(name)[0][:255]
    except Exception:
        return "Unknown"


def get_windows_identity() -> dict:
    username = getpass.getuser().strip().lower()
    hostname = os.environ.get("COMPUTERNAME", "unknown").strip().lower()
    sid = None
    try:
        import win32security

        sid_object, _, _ = win32security.LookupAccountName(None, username)
        sid = win32security.ConvertSidToStringSid(sid_object)
    except Exception:
        pass
    return {"username": username, "hostname": hostname, "windows_sid": sid}


VOIP_NATIVE_PROCESSES = {
    "teams": "Microsoft Teams",
    "ms-teams": "Microsoft Teams",
    "zoom": "Zoom",
    "webex": "Webex",
    "ciscocollabhost": "Webex",
    "slack": "Slack Huddle",
}
VOIP_TITLE_PATTERNS = {
    "google meet": "Google Meet",
    "meet.google.com": "Google Meet",
    "meet - ": "Google Meet",
    "microsoft teams": "Microsoft Teams",
    "meeting | microsoft teams": "Microsoft Teams",
    "zoom meeting": "Zoom",
    "webex": "Webex",
    "slack huddle": "Slack Huddle",
}


def detect_voip_call(window_title: str = "") -> str | None:
    """Detects call metadata without recording microphone or speaker audio."""
    title = window_title.lower()
    title_provider = next(
        (provider for pattern, provider in VOIP_TITLE_PATTERNS.items() if pattern in title),
        None,
    )
    try:
        from pycaw.pycaw import AudioUtilities

        active_audio_processes = set()
        for session in AudioUtilities.GetAllSessions():
            if session.Process and getattr(session, "State", 0) == 1:
                active_audio_processes.add(
                    os.path.splitext(session.Process.name())[0].lower()
                )
        for process_name, provider in VOIP_NATIVE_PROCESSES.items():
            if process_name in active_audio_processes:
                return provider
        browser_audio = active_audio_processes.intersection({"chrome", "msedge", "firefox"})
        if browser_audio and title_provider:
            return title_provider
    except Exception:
        pass

    call_words = re.search(r"\b(call|meeting|huddle)\b", title)
    return title_provider if title_provider and call_words else None
