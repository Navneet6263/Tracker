"""Privacy-safe input activity counters.

Only event counts are retained. Key values, typed text, mouse coordinates and click
targets are never stored or uploaded.
"""

import threading

from pynput import keyboard, mouse


_lock = threading.Lock()
_keyboard_events = 0
_mouse_events = 0


def on_key_press(key):
    global _keyboard_events
    with _lock:
        _keyboard_events += 1


def on_key_release(key):
    return None


def _record_mouse_event(*_args):
    global _mouse_events
    with _lock:
        _mouse_events += 1


def start_tracking():
    keyboard_listener = keyboard.Listener(on_press=on_key_press, on_release=on_key_release)
    mouse_listener = mouse.Listener(
        on_move=_record_mouse_event,
        on_click=_record_mouse_event,
        on_scroll=_record_mouse_event,
    )
    keyboard_listener.daemon = True
    mouse_listener.daemon = True
    keyboard_listener.start()
    mouse_listener.start()


def get_and_reset_input_status():
    global _keyboard_events, _mouse_events
    with _lock:
        status = {
            "keyboard_active": _keyboard_events > 0,
            "mouse_active": _mouse_events > 0,
            "keyboard_events": _keyboard_events,
            "mouse_events": _mouse_events,
        }
        _keyboard_events = 0
        _mouse_events = 0
    return status
