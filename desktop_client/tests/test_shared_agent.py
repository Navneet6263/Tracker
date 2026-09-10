"""Run in the desktop environment. No hooks, watchdog or live network started."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import shared_main
from utils.work_queue import WorkQueue


@pytest.mark.parametrize("choice", [None, {"action": "start", "reason": ""}, {"action": "change", "reason": ""},
                                    {"action": "decline", "reason": "Shift not started"}])
def test_identity_confirmation_is_explicit_and_discloses_tracking(monkeypatch, choice):
    calls = []
    class Parent:
        def deiconify(self): calls.append("show")
        def lift(self): calls.append("lift")
    parent = Parent()
    class Dialog:
        def __init__(self, dialog_parent, name, initial_reason):
            assert dialog_parent is parent and name == "Sonu"
            assert "company admin" in shared_main.WORK_NOTICE and "End work" in shared_main.WORK_NOTICE
            calls.append("ask")
            self.result = choice
    monkeypatch.setattr(shared_main, "WorkIdentityDialog", Dialog)
    assert shared_main.confirm_work_identity(parent, "Sonu") is choice
    assert calls == ["show", "lift", "ask"]


@pytest.mark.parametrize("reason,valid", [("   ", False), ("x" * 1001, False), (" Shift not started ", True)])
def test_reason_validation_does_not_silently_accept(monkeypatch, reason, valid):
    dialog = object.__new__(shared_main.WorkIdentityDialog)
    dialog.result = None
    class Reason:
        def get(self, *args): return reason
    dialog.reason_box = Reason()
    closed = []
    dialog.cancel = lambda: closed.append(True)
    warnings = []
    monkeypatch.setattr(shared_main.messagebox, "showwarning", lambda *args, **kwargs: warnings.append(True))
    dialog.choose("decline")
    assert bool(closed) is valid
    assert bool(warnings) is not valid
    assert dialog.result == ({"action": "decline", "reason": reason.strip()} if valid else None)


def session(name):
    start = datetime.now(timezone.utc) - timedelta(seconds=10)
    return {"session_id": name, "employee_id": name, "name": name, "device_name": "Shared-PC",
            "started_at": start.isoformat(), "expires_at": (start + timedelta(hours=16)).isoformat()}


def test_switch_flushes_previous_owner_and_restart_does_not_resume(tmp_path):
    queue = WorkQueue(tmp_path / "shared.db")
    agent = shared_main.SharedAgent(queue, "https://unused.example/api")
    agent.activate(session("Alice"))
    agent.accumulator.add("active", "Chrome", "Work", {
        "keyboard_events": 1, "mouse_events": 0, "keyboard_active": True, "mouse_active": False})
    agent.accumulator.started_at -= timedelta(seconds=2)
    agent.activate(session("Bob"))
    rows = queue.pending()
    assert [(r[1], r[2]) for r in rows] == [("Alice", "activity"), ("Alice", "end")]
    assert rows[0][3]["samples"][0]["session_id"] == "Alice"
    restarted = shared_main.SharedAgent(WorkQueue(tmp_path / "shared.db"), "https://unused.example/api")
    assert restarted.active is None
    assert queue.get_state("active_session") is None
    assert queue.pending()[-1][1:3] == ("Bob", "end")


def test_rejected_queue_preserves_all_records_and_does_not_block(tmp_path):
    queue = WorkQueue(tmp_path / "shared.db")
    for person in ("Alice", "Bob"):
        queue.put(person, "activity", {"person": person})
        queue.quarantine(queue.pending()[0][0], "outside work session")
    assert queue.pending() == []
    with queue.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM rejected").fetchone()[0] == 2
    queue.put("Charlie", "end", {})
    assert queue.pending()[0][1] == "Charlie"


def test_no_session_produces_no_activity_and_end_is_idempotent(tmp_path):
    queue = WorkQueue(tmp_path / "shared.db")
    agent = shared_main.SharedAgent(queue, "https://unused.example/api")
    agent.accumulator.flush()
    agent.end_work()
    assert queue.pending() == []
    agent.activate(session("Alice"))
    agent.end_work()
    agent.end_work()
    assert len(queue.pending()) == 1


def test_sleep_gap_requires_sign_in_without_recording_sleep(tmp_path, monkeypatch):
    queue = WorkQueue(tmp_path / "shared.db")
    agent = shared_main.SharedAgent(queue, "https://unused.example/api")
    agent.activate(session("Alice"))
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=30)
    agent.last_sample = cutoff
    monkeypatch.setattr(shared_main.time, "sleep", lambda seconds: setattr(agent, "stopped", True))
    agent.collect_loop()
    assert agent.active is None
    rows = queue.pending()
    assert len(rows) == 1 and rows[0][2] == "end"
    assert rows[0][3]["ended_at"] == cutoff.isoformat()
