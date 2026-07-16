PRODUCTIVE = {
    "vs code", "visual studio", "github", "gitlab", "pycharm", "intellij",
    "terminal", "cmd", "powershell", "postman", "figma", "notion", "jira",
    "confluence", "slack", "teams", "zoom", "excel", "word", "outlook",
    "gmail", "google docs", "google sheets", "google meet", "trello",
    "asana", "linear", "clickup", "chrome devtools", "xcode", "android studio"
}
UNPRODUCTIVE = {
    "youtube", "netflix", "facebook", "instagram", "twitter", "reddit",
    "tiktok", "twitch", "discord", "whatsapp", "telegram", "spotify",
    "amazon prime", "hotstar", "mx player", "vlc", "games", "steam",
    "pubg", "fortnite", "minecraft", "free fire"
}

# Known apps for clean naming
APP_NAME_MAP = {
    "gmail": "Gmail",
    "whatsapp": "WhatsApp",
    "youtube": "YouTube",
    "teams": "MS Teams",
    "slack": "Slack",
    "zoom": "Zoom",
    "vs code": "VS Code",
    "visual studio code": "VS Code",
    "chrome": "Chrome",
    "firefox": "Firefox",
    "edge": "Edge",
    "outlook": "Outlook",
    "excel": "Excel",
    "word": "Word",
    "powerpoint": "PowerPoint",
    "notion": "Notion",
    "figma": "Figma",
    "postman": "Postman",
    "terminal": "Terminal",
    "powershell": "PowerShell",
    "cmd": "CMD",
    "github": "GitHub",
    "netflix": "Netflix",
    "spotify": "Spotify",
}

def extract_app_name(window_title: str) -> str:
    """Extract a clean app name from a window title string."""
    if not window_title:
        return "Unknown"
    title_lower = window_title.lower()
    # Check known map first
    for key, display in APP_NAME_MAP.items():
        if key in title_lower:
            return display
    # Fallback: take last part after " - " separator (browser tab style)
    parts = window_title.split(" - ")
    if len(parts) > 1:
        return parts[-1].strip()[:30]
    return window_title.strip()[:30]

def classify(window_title: str) -> str:
    title_lower = window_title.lower()
    if any(k in title_lower for k in PRODUCTIVE):
        return "productive"
    if any(k in title_lower for k in UNPRODUCTIVE):
        return "unproductive"
    return "neutral"

def compute_productivity_score(logs: list) -> float:
    if not logs:
        return 0.0
    total = sum(l.duration_secs for l in logs)
    if total == 0:
        return 0.0
    productive = sum(l.duration_secs for l in logs if l.category == "productive")
    return round((productive / total) * 100, 1)
