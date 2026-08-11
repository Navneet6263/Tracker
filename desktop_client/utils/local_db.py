import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


APP_DATA = os.getenv("APPDATA") or os.path.expanduser("~")
DB_PATH = Path(APP_DATA) / "SentinelTracker" / "local.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_conn():
    connection = sqlite3.connect(str(DB_PATH), timeout=10)
    connection.execute("PRAGMA journal_mode=WAL")
    return connection


def init_db():
    with get_conn() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL UNIQUE,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
            """
        )
        connection.commit()


def save_activity(sample: dict):
    with get_conn() as connection:
        connection.execute(
            "INSERT OR IGNORE INTO pending_activity (event_id, payload, created_at) VALUES (?, ?, ?)",
            (
                sample["event_id"],
                json.dumps(sample, separators=(",", ":")),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        connection.commit()


def get_pending_activity(limit: int = 100):
    with get_conn() as connection:
        rows = connection.execute(
            "SELECT id, payload FROM pending_activity ORDER BY id ASC LIMIT ?", (limit,)
        ).fetchall()
    return [(row_id, json.loads(payload)) for row_id, payload in rows]


def delete_activity(row_ids: list[int]):
    if not row_ids:
        return
    placeholders = ",".join("?" for _ in row_ids)
    with get_conn() as connection:
        connection.execute(
            f"DELETE FROM pending_activity WHERE id IN ({placeholders})", row_ids
        )
        connection.commit()


def save_event(event_type: str, payload: dict):
    with get_conn() as connection:
        connection.execute(
            "INSERT INTO pending_events (event_type, payload, timestamp) VALUES (?, ?, ?)",
            (
                event_type,
                json.dumps(payload, separators=(",", ":")),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        connection.commit()


def get_pending_events(limit: int = 100):
    with get_conn() as connection:
        rows = connection.execute(
            "SELECT id, event_type, payload, timestamp FROM pending_events ORDER BY id ASC LIMIT ?",
            (limit,),
        ).fetchall()
    return [
        (row_id, event_type, json.loads(payload), timestamp)
        for row_id, event_type, payload, timestamp in rows
    ]


def delete_events(row_ids: list[int]):
    if not row_ids:
        return
    placeholders = ",".join("?" for _ in row_ids)
    with get_conn() as connection:
        connection.execute(
            f"DELETE FROM pending_events WHERE id IN ({placeholders})", row_ids
        )
        connection.commit()
