import ctypes

def is_screen_locked() -> bool:
    """Returns True if the Windows session is locked."""
    try:
        user32 = ctypes.windll.user32
        # LockWorkStation state check via GetForegroundWindow
        hwnd = user32.GetForegroundWindow()
        return hwnd == 0
    except Exception:
        return False

def is_system_idle(idle_threshold_secs: int = 300) -> bool:
    """Returns True if user has been idle longer than threshold."""
    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_ulong)]

    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
    ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii))
    
    # Use built-in Windows kernel32 GetTickCount64 (No external win32api DLL required)
    uptime_ms = ctypes.windll.kernel32.GetTickCount64()
    millis_idle = uptime_ms - lii.dwTime
    return millis_idle > idle_threshold_secs * 1000

def get_active_window_title() -> str:
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        length = user32.GetWindowTextLengthW(hwnd)
        buff = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buff, length + 1)
        return buff.value
    except Exception:
        return ""
