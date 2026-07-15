PRODUCTIVE = {
    "vs code", "visual studio", "github", "gitlab", "pycharm", "intellij",
    "terminal", "cmd", "powershell", "postman", "figma", "notion", "jira",
    "confluence", "slack", "teams", "zoom", "excel", "word", "outlook"
}
UNPRODUCTIVE = {
    "youtube", "netflix", "facebook", "instagram", "twitter", "reddit",
    "tiktok", "twitch", "discord", "whatsapp", "telegram", "spotify"
}

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
