import requests
import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

CONFIG_DIR = os.path.join(os.getenv("APPDATA", os.path.expanduser("~")), "EmployeeTracker")
os.makedirs(CONFIG_DIR, exist_ok=True)
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")

SERVER_URL = os.getenv("TRACKER_SERVER", "https://tracker.greencall.online/api")

def get_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_config(data: dict):
    config = get_config()
    config.update(data)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f)

def get_employee_token():
    env_token = os.getenv("TRACKER_TOKEN")
    if env_token:
        return env_token
    return get_config().get("token", "")

def get_headers():
    token = get_employee_token()
    return {"Authorization": f"Bearer {token}"} if token else {}

def authenticate_employee(email: str, password: str) -> tuple:
    """Authenticates employee credentials against the server and saves token."""
    try:
        url = f"{SERVER_URL}/auth/login"
        resp = requests.post(url, data={"username": email, "password": password}, timeout=10)
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            save_config({"token": token, "email": email})
            return True, "Login Successful!"
        else:
            return False, "Invalid Email or Password"
    except Exception as e:
        return False, f"Server Connection Error: {str(e)}"

def is_online() -> bool:
    try:
        requests.get(f"{SERVER_URL}/health", timeout=3)
        return True
    except Exception:
        return False

def upload_screenshot(filepath: str, timestamp: str, window_title: str, keyboard_active: bool = False, mouse_active: bool = False, win_r_count: int = 0) -> bool:
    headers = get_headers()
    if not headers:
        return False
    try:
        with open(filepath, "rb") as f:
            r = requests.post(
                f"{SERVER_URL}/screenshots/upload",
                headers=headers,
                files={"file": f},
                data={
                    "timestamp": timestamp, 
                    "window_title": window_title,
                    "keyboard_active": str(keyboard_active).lower(),
                    "mouse_active": str(mouse_active).lower(),
                    "win_r_count": win_r_count
                },
                timeout=15,
            )
        return r.status_code == 200
    except Exception:
        return False

def upload_event(event_type: str, payload: dict, timestamp: str) -> bool:
    headers = get_headers()
    if not headers:
        return False
    try:
        r = requests.post(
            f"{SERVER_URL}/events",
            headers=headers,
            json={"event_type": event_type, "payload": payload, "timestamp": timestamp},
            timeout=10,
        )
        return r.status_code == 200
    except Exception:
        return False

def ping_online() -> str:
    headers = get_headers()
    if not headers:
        return None
    try:
        r = requests.post(f"{SERVER_URL}/events/ping", headers=headers, timeout=5)
        if r.status_code == 200:
            return r.json().get("command")
    except Exception:
        pass
    return None
