import os
import io
from PIL import Image, ImageFilter
from pathlib import Path
from datetime import datetime
from cryptography.fernet import Fernet

SCREENSHOT_DIR = Path(os.getenv("APPDATA")) / ".tracker" / "screenshots"
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

def capture_screenshot() -> str:
    """Captures, blurs, and saves screenshot. Returns saved filepath."""
    import pyautogui
    img = pyautogui.screenshot()
    img = img.filter(ImageFilter.GaussianBlur(radius=3))

    filename = SCREENSHOT_DIR / f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.png"
    img.save(filename, format="PNG")
    return str(filename)

