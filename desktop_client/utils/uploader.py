import requests
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
SERVER_URL = os.getenv("TRACKER_SERVER", "http://localhost:8000")
EMPLOYEE_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyYWh1bEBjb21wYW55LmNvbSIsInJvbGUiOiJlbXBsb3llZSIsImlkIjoyLCJleHAiOjE3ODQyMTE3MTJ9.duS2dHWWnF3YH5g4r_HDdF3i9TwoOkNKid_jYD_K3Nc"

HEADERS = {"Authorization": f"Bearer {EMPLOYEE_TOKEN}"}

def is_online() -> bool:
    try:
        requests.get(f"{SERVER_URL}/health", timeout=3)
        return True
    except Exception:
        return False

def upload_screenshot(filepath: str, timestamp: str, window_title: str, keyboard_active: bool = False, mouse_active: bool = False, win_r_count: int = 0) -> bool:
    try:
        with open(filepath, "rb") as f:
            r = requests.post(
                f"{SERVER_URL}/screenshots/upload",
                headers=HEADERS,
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
    try:
        r = requests.post(
            f"{SERVER_URL}/events",
            headers=HEADERS,
            json={"event_type": event_type, "payload": payload, "timestamp": timestamp},
            timeout=10,
        )
        return r.status_code == 200
    except Exception:
        return False

def ping_online() -> str:
    try:
        r = requests.post(f"{SERVER_URL}/events/ping", headers=HEADERS, timeout=5)
        if r.status_code == 200:
            return r.json().get("command")
    except Exception:
        pass
    return None
