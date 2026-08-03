import os
import time
import threading
from datetime import datetime, timedelta, timezone
from database import SessionLocal
from models.models import Screenshot

RETENTION_DAYS = 7
CLEANUP_INTERVAL_HOURS = 6

def run_screenshot_cleanup():
    """Deletes screenshots and database entries older than RETENTION_DAYS days."""
    try:
        db = SessionLocal()
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
        
        # 1. Query screenshots older than 7 days
        old_screenshots = db.query(Screenshot).filter(Screenshot.captured_at < cutoff_date).all()
        
        deleted_count = 0
        for shot in old_screenshots:
            # Delete local file if present
            if shot.s3_url and "/uploads/" in shot.s3_url:
                filename = shot.s3_url.split("/uploads/")[-1]
                local_path = os.path.join("uploads", filename)
                if os.path.exists(local_path):
                    try:
                        os.remove(local_path)
                    except Exception as e:
                        print(f"[Cleanup] Error deleting file {local_path}: {e}")
            
            db.delete(shot)
            deleted_count += 1
            
        db.commit()
        db.close()
        
        # 2. Also scan uploads folder for orphan files older than RETENTION_DAYS
        uploads_dir = "uploads"
        if os.path.exists(uploads_dir):
            now = time.time()
            cutoff_seconds = RETENTION_DAYS * 86400
            for fname in os.listdir(uploads_dir):
                fpath = os.path.join(uploads_dir, fname)
                if os.path.isfile(fpath):
                    file_mtime = os.path.getmtime(fpath)
                    if (now - file_mtime) > cutoff_seconds:
                        try:
                            os.remove(fpath)
                        except Exception as e:
                            print(f"[Cleanup] Error removing orphan file {fpath}: {e}")
                            
        print(f"[Cleanup] Automated 7-day cleanup complete. Purged {deleted_count} old screenshots.")
    except Exception as e:
        print(f"[Cleanup Error] {e}")

def _cleanup_loop():
    while True:
        run_screenshot_cleanup()
        time.sleep(CLEANUP_INTERVAL_HOURS * 3600)

def start_automated_cleanup_daemon():
    """Starts background thread to run cleanup periodically."""
    t = threading.Thread(target=_cleanup_loop, daemon=True)
    t.start()
    print("[Cleanup] Automated 7-day screenshot cleanup daemon started.")
