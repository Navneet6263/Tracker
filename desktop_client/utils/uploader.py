import json
import logging
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

from utils.win_utils import get_windows_identity


load_dotenv()
USER_CONFIG_DIR = Path(os.getenv("APPDATA") or os.path.expanduser("~")) / "SentinelTracker"
USER_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
USER_CONFIG_FILE = USER_CONFIG_DIR / "config.json"
HTTP = requests.Session()
LOGGER = logging.getLogger("sentinel.uploader")


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def get_user_config() -> dict:
    return _read_json(USER_CONFIG_FILE)


def save_user_config(data: dict):
    config = get_user_config()
    config.update(data)
    temporary = USER_CONFIG_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(config), encoding="utf-8")
    temporary.replace(USER_CONFIG_FILE)


def get_server_url() -> str:
    return (
        os.getenv("TRACKER_SERVER")
        or "https://tracker.greencall.online/api"
    ).rstrip("/")


def get_employee_token() -> str:
    return os.getenv("TRACKER_TOKEN") or get_user_config().get("token", "")


def clear_employee_token():
    save_user_config({"token": ""})


def get_headers() -> dict:
    token = get_employee_token()
    return {"Authorization": f"Bearer {token}"} if token else {}


def auto_authenticate(force: bool = False) -> bool:
    if get_employee_token() and not force:
        return True
    identity = get_windows_identity()
    try:
        response = HTTP.post(
            f"{get_server_url()}/auth/device-login",
            json=identity,
            timeout=10,
        )
        if response.status_code != 200:
            detail = ""
            try:
                detail = response.json().get("detail", "")
            except (ValueError, AttributeError):
                pass
            LOGGER.warning(
                "Profile fetch rejected: status=%s detail=%s identity=%s\\%s",
                response.status_code,
                detail,
                identity["hostname"],
                identity["username"],
            )
            return False
        data = response.json()
        save_user_config(
            {
                "token": data["access_token"],
                "employee_id": data["id"],
                "employee_name": data["name"],
                "identity": identity,
                "shift": data.get("shift"),
            }
        )
        LOGGER.info(
            "Profile connected: employee_id=%s name=%s identity=%s\\%s",
            data["id"],
            data["name"],
            identity["hostname"],
            identity["username"],
        )
        return True
    except requests.RequestException as exc:
        LOGGER.warning("Profile fetch unavailable: %s", exc)
        return False


def is_online() -> bool:
    try:
        response = HTTP.get(f"{get_server_url()}/health", timeout=3)
        return response.status_code == 200
    except requests.RequestException:
        return False


def _authorized_post(path: str, *, json_body: dict, timeout: int = 10):
    if not get_employee_token() and not auto_authenticate():
        return None
    response = HTTP.post(
        f"{get_server_url()}{path}", headers=get_headers(), json=json_body, timeout=timeout
    )
    if response.status_code == 401:
        clear_employee_token()
        if not auto_authenticate(force=True):
            return response
        response = HTTP.post(
            f"{get_server_url()}{path}",
            headers=get_headers(),
            json=json_body,
            timeout=timeout,
        )
    return response


def upload_activity(samples: list[dict]) -> bool:
    if not samples:
        return True
    try:
        response = _authorized_post(
            "/activity/batch", json_body={"samples": samples}, timeout=15
        )
        return response is not None and response.status_code == 200
    except requests.RequestException:
        return False


def upload_event(event_type: str, payload: dict, timestamp: str) -> bool:
    try:
        response = _authorized_post(
            "/events",
            json_body={
                "event_type": event_type,
                "payload": payload,
                "timestamp": timestamp,
            },
        )
        return response is not None and response.status_code == 200
    except requests.RequestException:
        return False


def ping_online(state: str, app_name: str | None = None) -> dict:
    identity = get_windows_identity()
    try:
        response = _authorized_post(
            "/events/ping",
            json_body={
                "state": state,
                "app_name": app_name,
                "device_name": identity["hostname"],
                "windows_user": identity["username"],
            },
            timeout=5,
        )
        if response is not None and response.status_code == 200:
            return response.json()
    except requests.RequestException:
        pass
    return {}
