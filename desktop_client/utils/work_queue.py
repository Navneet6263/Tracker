"""Separate durable queue for v3; v2 records are never reassigned to a human."""
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path


class WorkQueue:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(str(self.path), timeout=15)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def put(self, session_id, kind, payload):
        with self.connect() as db:
            db.execute("INSERT INTO outbox(session_id,kind,payload) VALUES (?,?,?)", (session_id, kind, json.dumps(payload)))

    def pending(self):
        with self.connect() as db:
            return [(i, s, k, json.loads(p)) for i, s, k, p in db.execute(
                "SELECT id,session_id,kind,payload FROM outbox ORDER BY id LIMIT 100")]

    def remove(self, row_id):
        with self.connect() as db:
            db.execute("DELETE FROM outbox WHERE id=?", (row_id,))

    def get_state(self, key):
        with self.connect() as db:
            row = db.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def set_state(self, key, value):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO state(key,value) VALUES (?,?)", (key, json.dumps(value)))

    def quarantine(self, row_id, reason):
        # Keep rejected records for administrator review, but unblock later work.
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS rejected (id INTEGER PRIMARY KEY, session_id TEXT, kind TEXT, payload TEXT, reason TEXT)")
            db.execute("INSERT OR REPLACE INTO rejected SELECT id,session_id,kind,payload,? FROM outbox WHERE id=?", (reason, row_id))
            db.execute("DELETE FROM outbox WHERE id=?", (row_id,))
