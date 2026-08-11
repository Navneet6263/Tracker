import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


TEST_DB = Path(tempfile.gettempdir()) / f"sentinel_api_test_{uuid.uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-that-is-long-enough-for-api-tests"

from fastapi.testclient import TestClient

from database import Base, SessionLocal, engine
from main import app
from models.models import Employee, ShiftAssignment, WindowsIdentity
from models.models import SystemEvent
from routers.analytics import _normalize_page_title, _pair_gap_events
from services.auth import hash_password


def test_privacy_first_api_flow():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    admin = Employee(
        name="Admin",
        email="admin@example.com",
        hashed_password=hash_password("OldPassword!123"),
        role="admin",
        is_active=True,
    )
    employee = Employee(
        name="Rahul",
        email="rahul@example.com",
        hashed_password=hash_password("unused-device-password"),
        role="employee",
        is_active=True,
    )
    auto_employee = Employee(
        name="Amit",
        email="amit@example.com",
        hashed_password=hash_password("unused-device-password"),
        role="employee",
        is_active=True,
    )
    db.add_all([admin, employee, auto_employee])
    db.flush()
    db.add(
        WindowsIdentity(
            employee_id=employee.id,
            windows_sid=None,
            hostname="pc-101",
            username="rahul",
        )
    )
    db.add(
        ShiftAssignment(
            employee_id=employee.id,
            shift_name="Day",
            start_local="09:00",
            end_local="18:00",
            timezone_name="Asia/Kolkata",
            enabled=True,
        )
    )
    db.commit()
    employee_id = employee.id
    auto_employee_id = auto_employee.id
    db.close()

    client = TestClient(app)
    assert client.post("/auth/register", json={}).status_code == 404

    admin_login = client.post(
        "/auth/login",
        data={"username": "admin@example.com", "password": "OldPassword!123"},
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    with client.websocket_connect("/ws/admin") as websocket:
        websocket.send_json({"token": admin_token})

    denied_device = client.post(
        "/auth/device-login",
        json={"username": "unknown", "hostname": "pc-101", "windows_sid": "S-1-5-21-test-9999"},
    )
    assert denied_device.status_code == 403

    device_login = client.post(
        "/auth/device-login",
        json={"username": "rahul", "hostname": "pc-101", "windows_sid": "S-1-5-21-test-1001"},
    )
    assert device_login.status_code == 200
    assert device_login.json()["shift"]["name"] == "Day"
    employee_token = device_login.json()["access_token"]

    auto_login = client.post(
        "/auth/device-login",
        json={"username": "amit", "hostname": "pc-202", "windows_sid": "S-1-5-21-test-1002"},
    )
    assert auto_login.status_code == 200
    assert auto_login.json()["name"] == "Amit"
    auto_identity_db = SessionLocal()
    auto_identity = auto_identity_db.query(WindowsIdentity).filter_by(
        hostname="pc-202", username="amit"
    ).one()
    assert auto_identity.employee_id == auto_employee_id
    auto_identity_db.close()

    ended_at = datetime.now(timezone.utc)
    started_at = ended_at - timedelta(seconds=30)
    event_id = str(uuid.uuid4())
    activity = {
        "event_id": event_id,
        "session_id": "session-1",
        "device_name": "pc-101",
        "windows_user": "rahul",
        "state": "meeting",
        "app_name": "Microsoft Teams",
        "domain": "Client CRM - Lead 42",
        "started_at": started_at.isoformat(),
        "ended_at": ended_at.isoformat(),
        "keyboard_events": 0,
        "mouse_events": 0,
        "keyboard_active_secs": 0,
        "mouse_active_secs": 0,
    }
    headers = {"Authorization": f"Bearer {employee_token}"}
    first_batch = client.post("/activity/batch", headers=headers, json={"samples": [activity]})
    assert first_batch.status_code == 200
    assert first_batch.json()["accepted"] == 1
    duplicate_batch = client.post("/activity/batch", headers=headers, json={"samples": [activity]})
    assert duplicate_batch.status_code == 200
    assert duplicate_batch.json()["accepted"] == 0

    ping = client.post(
        "/events/ping",
        headers=headers,
        json={
            "state": "meeting",
            "app_name": "Microsoft Teams",
            "device_name": "pc-101",
            "windows_user": "rahul",
        },
    )
    assert ping.status_code == 200

    employee_summary_denied = client.get("/analytics/summary", headers=headers)
    assert employee_summary_denied.status_code == 403
    summary = client.get(
        "/analytics/summary", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert summary.status_code == 200
    row = next(item for item in summary.json() if item["id"] == employee_id)
    assert row["current_state"] == "meeting"
    assert row["meeting_hours"] > 0

    analytics = client.get(
        f"/analytics/employee/{employee_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert analytics.status_code == 200
    assert analytics.json()["page_breakdown"][0]["title"] == "Client CRM - Lead 42"

    identity_db = SessionLocal()
    bound_identity = identity_db.query(WindowsIdentity).filter_by(employee_id=employee_id).one()
    assert bound_identity.windows_sid == "S-1-5-21-test-1001"
    identity_db.close()

    password_change = client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"current_password": "OldPassword!123", "new_password": "NewPassword!456"},
    )
    assert password_change.status_code == 200
    assert client.post(
        "/auth/login",
        data={"username": "admin@example.com", "password": "OldPassword!123"},
    ).status_code == 401
    assert client.post(
        "/auth/login",
        data={"username": "admin@example.com", "password": "NewPassword!456"},
    ).status_code == 200

    engine.dispose()
    TEST_DB.unlink(missing_ok=True)


def test_report_noise_filter_and_lock_merging():
    assert _normalize_page_title(
        "msedge", "YouTube - Profile 1 - Microsoft Edge"
    ) == "YouTube"
    assert _normalize_page_title(
        "msedge", "LinkedIn - Search and 1 more page - Profile 1 - Microsoft Edge"
    ) == "LinkedIn - Search"
    assert _normalize_page_title("explorer", "Program Manager") is None
    assert _normalize_page_title("LockApp", "Windows Default Lock Screen") is None

    start = datetime(2026, 8, 11, 11, 42, tzinfo=None)
    events = [
        SystemEvent(employee_id=1, event_type="screen_locked", occurred_at=start),
        SystemEvent(
            employee_id=1,
            event_type="screen_unlocked",
            occurred_at=start + timedelta(seconds=20),
        ),
        SystemEvent(
            employee_id=1,
            event_type="screen_locked",
            occurred_at=start + timedelta(seconds=30),
        ),
        SystemEvent(
            employee_id=1,
            event_type="screen_unlocked",
            occurred_at=start + timedelta(minutes=7),
        ),
    ]
    periods = _pair_gap_events(events)
    assert len(periods) == 1
    assert periods[0]["from"] == start.isoformat()
    assert periods[0]["to"] == (start + timedelta(minutes=7)).isoformat()
