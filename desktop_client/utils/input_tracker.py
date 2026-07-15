import threading
from pynput import keyboard, mouse
from utils.win_utils import get_active_window_title

_keyboard_active = False
_mouse_active = False
_win_r_count = 0

def on_press(key):
    global _keyboard_active, _win_r_count
    _keyboard_active = True
    
    # Check for Win + R
    try:
        if hasattr(key, 'char') and key.char and key.char.lower() == 'r':
            # Not easy to reliably detect modifier state with standard pynput on press without state machine,
            # but we can try to guess or use a simpler approach.
            pass
    except Exception:
        pass

# We will use a state machine for Win+R
_win_pressed = False

def on_key_press(key):
    global _keyboard_active, _win_r_count, _win_pressed
    _keyboard_active = True
    
    if key == keyboard.Key.cmd or key == keyboard.Key.cmd_l or key == keyboard.Key.cmd_r:
        _win_pressed = True
    elif _win_pressed and hasattr(key, 'char') and key.char and key.char.lower() == 'r':
        _win_r_count += 1

def on_key_release(key):
    global _win_pressed
    if key == keyboard.Key.cmd or key == keyboard.Key.cmd_l or key == keyboard.Key.cmd_r:
        _win_pressed = False

def on_move(x, y):
    global _mouse_active
    _mouse_active = True

def on_click(x, y, button, pressed):
    global _mouse_active
    _mouse_active = True

def on_scroll(x, y, dx, dy):
    global _mouse_active
    _mouse_active = True

def start_tracking():
    kb_listener = keyboard.Listener(on_press=on_key_press, on_release=on_key_release)
    m_listener = mouse.Listener(on_move=on_move, on_click=on_click, on_scroll=on_scroll)
    
    kb_listener.daemon = True
    m_listener.daemon = True
    
    kb_listener.start()
    m_listener.start()

def get_and_reset_input_status():
    global _keyboard_active, _mouse_active, _win_r_count
    status = {
        "keyboard_active": _keyboard_active,
        "mouse_active": _mouse_active,
        "win_r_count": _win_r_count
    }
    # Reset
    _keyboard_active = False
    _mouse_active = False
    _win_r_count = 0
    return status
