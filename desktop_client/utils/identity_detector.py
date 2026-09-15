import json
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Callable, Optional

LOGGER = logging.getLogger("sentinel.identity_detector")

EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")

IGNORED_EMAILS = {
    "noreply@",
    "no-reply@",
    "donotreply@",
    "support@",
    "mailer-daemon@",
    "admin@greencall.com",
}


def _is_valid_user_email(email: str) -> bool:
    if not email or "@" not in email:
        return False
    lower = email.strip().lower()
    if any(lower.startswith(ign) for ign in IGNORED_EMAILS):
        return False
    # Exclude common system domains
    if lower.endswith(".local") or lower.endswith(".invalid"):
        return False
    return True


def scan_window_titles(active_title: str) -> Optional[dict]:
    """Scan current active window title for user email or Teams/Keka profile."""
    if not active_title:
        return None

    # Check for direct email in window title
    matches = EMAIL_REGEX.findall(active_title)
    for email in matches:
        if _is_valid_user_email(email):
            return {"email": email.lower(), "name": email.split("@")[0].replace(".", " ").title(), "source": "window_title"}

    lower = active_title.lower()

    # Keka pattern: "Name - Keka" or "Keka | Name"
    if "keka" in lower:
        parts = re.split(r"[-|–—]", active_title)
        for part in parts:
            clean = part.strip()
            if clean and "keka" not in clean.lower() and len(clean) > 2 and len(clean) < 40:
                return {"name": clean, "email": None, "source": "keka_title"}

    # Teams pattern: "Chat | Rahul Sharma | Microsoft Teams"
    if "teams" in lower:
        parts = re.split(r"[-|–—]", active_title)
        for part in parts:
            clean = part.strip()
            if clean and "teams" not in clean.lower() and "chat" not in clean.lower() and len(clean) > 2 and len(clean) < 40:
                return {"name": clean, "email": None, "source": "teams_title"}

    return None


def scan_browser_active_profile() -> Optional[dict]:
    """Read active Google Chrome or Microsoft Edge profile from Local State."""
    local_appdata = os.getenv("LOCALAPPDATA")
    if not local_appdata:
        return None

    browser_paths = [
        Path(local_appdata) / "Google" / "Chrome" / "User Data" / "Local State",
        Path(local_appdata) / "Microsoft" / "Edge" / "User Data" / "Local State",
        Path(local_appdata) / "BraveSoftware" / "Brave-Browser" / "User Data" / "Local State",
    ]

    for path in browser_paths:
        if not path.exists():
            continue
        try:
            content = json.loads(path.read_text(encoding="utf-8"))
            info_cache = content.get("profile", {}).get("info_cache", {})
            last_active = content.get("profile", {}).get("last_active_profiles", [])

            profiles_to_check = last_active if isinstance(last_active, list) else []
            for p in info_cache.keys():
                if p not in profiles_to_check:
                    profiles_to_check.append(p)

            for prof_key in profiles_to_check:
                prof_data = info_cache.get(prof_key, {})
                user_email = prof_data.get("user_name", "")
                user_name = prof_data.get("gaia_name") or prof_data.get("name") or ""
                if _is_valid_user_email(user_email):
                    return {
                        "email": user_email.strip().lower(),
                        "name": user_name.strip() or user_email.split("@")[0].replace(".", " ").title(),
                        "source": f"{path.parent.parent.name}_profile",
                    }
        except Exception as exc:
            LOGGER.debug("Could not read browser state from %s: %s", path, exc)

    return None


def scan_teams_desktop_config() -> Optional[dict]:
    """Scan Classic and New Teams config files for signed-in user."""
    appdata = os.getenv("APPDATA")
    if appdata:
        teams_config = Path(appdata) / "Microsoft" / "Teams" / "desktop-config.json"
        if teams_config.exists():
            try:
                data = json.loads(teams_config.read_text(encoding="utf-8"))
                user_email = data.get("userEmail") or data.get("userUPN")
                if _is_valid_user_email(user_email):
                    return {
                        "email": user_email.strip().lower(),
                        "name": data.get("userDisplayName") or user_email.split("@")[0].title(),
                        "source": "teams_desktop",
                    }
            except Exception:
                pass

    local_appdata = os.getenv("LOCALAPPDATA")
    if local_appdata:
        new_teams_dir = Path(local_appdata) / "Packages"
        if new_teams_dir.exists():
            for pkg in new_teams_dir.glob("MSTeams_*"):
                settings_file = pkg / "LocalCache" / "Microsoft" / "MSTeams" / "users.json"
                if settings_file.exists():
                    try:
                        data = json.loads(settings_file.read_text(encoding="utf-8"))
                        for u in data.get("users", []):
                            email = u.get("email") or u.get("upn")
                            if _is_valid_user_email(email):
                                return {
                                    "email": email.strip().lower(),
                                    "name": u.get("displayName") or email.split("@")[0].title(),
                                    "source": "new_teams",
                                }
                    except Exception:
                        pass
    return None


def detect_current_identity(active_window_title: str = "") -> Optional[dict]:
    """Detect current employee identity with priority order:
    1. Teams desktop configuration
    2. Window titles (Teams/Keka)
    3. Browser active profile
    """
    # 1. Check Teams desktop app
    teams_id = scan_teams_desktop_config()
    if teams_id and teams_id.get("email"):
        return teams_id

    # 2. Check current active window title
    win_id = scan_window_titles(active_window_title)
    if win_id and win_id.get("email"):
        return win_id

    # 3. Check active browser profile
    browser_id = scan_browser_active_profile()
    if browser_id and browser_id.get("email"):
        return browser_id

    # 4. If name-only detected from window title
    if win_id and win_id.get("name"):
        return win_id

    return None


class IdentityWatcher:
    """Background worker that continuously watches for user identity switches."""

    def __init__(self, callback: Callable[[str, str], None], check_interval_secs: int = 15):
        self.callback = callback
        self.check_interval_secs = check_interval_secs
        self.current_email: Optional[str] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="identity_watcher")
        self._thread.start()

    def stop(self):
        self._running = False

    def _run(self):
        LOGGER.info("IdentityWatcher started (interval=%ss)", self.check_interval_secs)
        while self._running:
            try:
                from utils.win_utils import get_active_window_title
                title = get_active_window_title()
                identity = detect_current_identity(title)
                if identity and identity.get("email"):
                    new_email = identity["email"]
                    new_name = identity.get("name") or new_email.split("@")[0].title()
                    if self.current_email is None:
                        self.current_email = new_email
                        LOGGER.info("Initial identity confirmed: %s (%s)", new_email, new_name)
                    elif new_email != self.current_email:
                        LOGGER.info("Identity switch detected: %s -> %s (%s)", self.current_email, new_email, new_name)
                        self.current_email = new_email
                        self.callback(new_email, new_name)
            except Exception as exc:
                LOGGER.debug("Identity check error: %s", exc)

            time.sleep(self.check_interval_secs)
