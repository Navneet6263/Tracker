import os
from PIL import Image, ImageFilter
from pathlib import Path
from datetime import datetime

SCREENSHOT_DIR = Path(os.getenv("APPDATA")) / ".tracker" / "screenshots"
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

# Blocked keywords: if the active window title contains any of these,
# screenshot will NOT be taken (privacy protection for personal laptops).
BLOCKED_KEYWORDS = [
    # Banking & Finance
    "netbanking", "internet banking", "sbi", "hdfc", "icici", "axis bank",
    "paytm", "gpay", "phonepe", "paypal", "credit card", "debit card",
    # Personal Photos / Gallery
    "photos", "gallery", "camera roll", "pictures",
    # Personal messaging
    "whatsapp", "telegram personal",
]

def is_blocked_window(window_title: str) -> bool:
    """Returns True if the current window is on the blocked list."""
    title_lower = window_title.lower()
    return any(kw in title_lower for kw in BLOCKED_KEYWORDS)

def capture_screenshot(window_title: str = "") -> str | None:
    """
    Captures screenshot. Returns saved filepath, or None if window is blocked.
    Pass the current active window title so we can skip blocked apps.
    """
    if is_blocked_window(window_title):
        print(f"[Screenshot] Blocked: '{window_title}' is on the privacy blocklist.")
        return None

    import pyautogui
    img = pyautogui.screenshot()
    img = img.filter(ImageFilter.GaussianBlur(radius=3))

    filename = SCREENSHOT_DIR / f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.png"
    img.save(filename, format="PNG")
    return str(filename)
