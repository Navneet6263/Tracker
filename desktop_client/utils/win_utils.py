import ctypes
import win32api
import win32con
import win32gui

def is_screen_locked() -> bool:
    """Returns True if the Windows session is locked."""
    try:
        hwnd = win32gui.FindWindow("Shell_TrayWnd", None)
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
    millis_idle = win32api.GetTickCount() - lii.dwTime
    return millis_idle > idle_threshold_secs * 1000

def get_active_window_title() -> str:
    try:
        hwnd = win32gui.GetForegroundWindow()
        return win32gui.GetWindowText(hwnd)
    except Exception:
        return ""
