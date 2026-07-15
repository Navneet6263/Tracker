import os
import time
import json
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

DB_PATH = Path(os.getenv("APPDATA")) / ".tracker" / "local.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

def get_conn():
    return sqlite3.connect(str(DB_PATH))

def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pending_screenshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filepath TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                window_title TEXT,
                keyboard_active INTEGER DEFAULT 0,
                mouse_active INTEGER DEFAULT 0,
                win_r_count INTEGER DEFAULT 0,
                uploaded INTEGER DEFAULT 0
            )
        """)
        # Add new columns if they don't exist (in case of existing DB)
        try:
            conn.execute("ALTER TABLE pending_screenshots ADD COLUMN keyboard_active INTEGER DEFAULT 0")
            conn.execute("ALTER TABLE pending_screenshots ADD COLUMN mouse_active INTEGER DEFAULT 0")
            conn.execute("ALTER TABLE pending_screenshots ADD COLUMN win_r_count INTEGER DEFAULT 0")
        except:
            pass

        conn.execute("""
            CREATE TABLE IF NOT EXISTS pending_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                uploaded INTEGER DEFAULT 0
            )
        """)
        conn.commit()

def save_screenshot(filepath: str, window_title: str, keyboard_active: bool = False, mouse_active: bool = False, win_r_count: int = 0):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO pending_screenshots (filepath, timestamp, window_title, keyboard_active, mouse_active, win_r_count) VALUES (?,?,?,?,?,?)",
            (filepath, datetime.utcnow().isoformat(), window_title, int(keyboard_active), int(mouse_active), win_r_count)
        )
        conn.commit()

def save_event(event_type: str, payload: dict):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO pending_events (event_type, payload, timestamp) VALUES (?,?,?)",
            (event_type, json.dumps(payload), datetime.utcnow().isoformat())
        )
        conn.commit()

def get_pending_screenshots():
    with get_conn() as conn:
        return conn.execute(
            "SELECT id, filepath, timestamp, window_title, keyboard_active, mouse_active, win_r_count FROM pending_screenshots WHERE uploaded=0"
        ).fetchall()

def get_pending_events():
    with get_conn() as conn:
        return conn.execute(
            "SELECT id, event_type, payload, timestamp FROM pending_events WHERE uploaded=0"
        ).fetchall()

def mark_screenshot_uploaded(row_id: int):
    with get_conn() as conn:
        conn.execute("UPDATE pending_screenshots SET uploaded=1 WHERE id=?", (row_id,))
        conn.commit()

def mark_event_uploaded(row_id: int):
    with get_conn() as conn:
        conn.execute("UPDATE pending_events SET uploaded=1 WHERE id=?", (row_id,))
        conn.commit()
