"""Isolated DB; Microsoft exchange is mocked, not a live tenant test."""
import os
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlencode

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "isolated-work-tests-secret-at-least-32-characters")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from database import Base, get_db
from models.models import ActivityInterval, Employee, EmployeePresence, ExternalIdentity, WorkSession, WorkLogin, WorkDecline
from routers import work


@pytest.fixture
def setup(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    def database():
        with factory() as db:
            yield db
    app = FastAPI()
    app.include_router(work.router)
    app.dependency_overrides[get_db] = database
    monkeypatch.setenv("WORK_ENROLLMENT_KEY", "enroll-" + "x" * 40)
    monkeypatch.setattr(work, "provider_config", lambda name: {"name": name})
    states = []
    def authorize(config, state, verifier, nonce):
        states.append(state)
        return "https://company.example/authorize?" + urlencode({"state": state})
    monkeypatch.setattr(work, "authorize_url", authorize)
    monkeypatch.setattr(work, "verify_code", lambda config, code, verifier, nonce: {
        "issuer": "https://company.example/tenant", "subject": code, "name": "Sonu"})
    client = TestClient(app)
    def device(name):
        device_id, key = str(uuid.uuid4()), "k" * 48
        response = client.post("/work/devices", json={"device_id": device_id, "device_key": key,
            "name": name, "enrollment_key": "enroll-" + "x" * 40})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Device {device_id}.{key}"}
    def login(headers, subject, confirm=True):
        response = client.post("/work/login", headers=headers,
                               json={"provider": "microsoft", "windows_user": "SharedWindows"})
        assert response.status_code == 200, response.text
        login_id = response.json()["login_id"]
        assert client.post(f"/work/login/{login_id}/confirm", headers=headers).status_code == 409
        response = client.post("/work/callback/microsoft", data={"state": states[-1], "code": subject})
        assert response.status_code == 200, response.text
        assert client.get("/work/callback/microsoft", params={"state": states[-1], "code": subject}).status_code == 400
        assert client.get(f"/work/login/{login_id}", headers=headers).json() == {"ready": True, "name": "Sonu"}
        if not confirm:
            return {"login_id": login_id}
        result = client.post(f"/work/login/{login_id}/confirm", headers=headers)
        assert result.status_code == 200, result.text
        assert client.post(f"/work/login/{login_id}/confirm", headers=headers).json() == result.json()
        return result.json()
    yield client, factory, device, login
    client.close()
    engine.dispose()


def test_same_identity_moves_and_same_name_does_not_merge(setup):
    client, factory, device, login = setup
    first, second = device("PC-1"), device("PC-8")
    sonu = login(first, "sonu-object-id")
    same_sonu = login(second, "sonu-object-id")
    assert sonu["employee_id"] == same_sonu["employee_id"]
    assert client.post(f'/work/sessions/{sonu["session_id"]}/ping', headers=first, json={}).status_code == 409
    assert client.post(f'/work/sessions/{same_sonu["session_id"]}/ping', headers=first, json={}).status_code == 403
    assert client.post(f'/work/sessions/{same_sonu["session_id"]}/ping', headers=second, json={}).status_code == 200
    other_sonu = login(second, "different-person-same-name")
    assert sonu["employee_id"] != other_sonu["employee_id"]
    with factory() as db:
        assert db.query(Employee).count() == 2
        assert db.query(ExternalIdentity).count() == 2
        assert db.query(WorkSession).filter_by(ended_at=None).count() == 1
        assert db.get(EmployeePresence, sonu["employee_id"]).state == "offline"


def test_decline_is_verified_private_idempotent_and_never_starts_work(setup):
    client, factory, device, login = setup
    headers, other = device("PC-1"), device("PC-8")
    attempt = login(headers, "alice", confirm=False)
    login_id = attempt["login_id"]
    url = f"/work/login/{login_id}/decline"
    assert client.post(url, headers=other, json={"reason": "wrong device"}).status_code == 404
    assert client.post(url, headers=headers, json={"reason": "   "}).status_code == 422
    assert client.post(url, headers=headers, json={"reason": "x" * 1001}).status_code == 422
    assert client.post(url, headers=headers, json={"reason": " Shift not started "}).status_code == 200
    assert client.post(url, headers=headers, json={"reason": "edited retry"}).status_code == 200
    assert client.post(f"/work/login/{login_id}/confirm", headers=headers).status_code == 409
    assert client.get("/work/declines", headers=headers).status_code == 401
    with factory() as db:
        from services.auth import create_token
        employee_token = create_token({"sub": db.query(Employee).one().email})
        assert db.query(WorkSession).count() == 0
        row = db.query(WorkDecline).one()
        assert row.reason == "Shift not started"
        assert row.employee_id == db.query(Employee).one().id
        # Audit must survive the normal deletion of expired login handshakes.
        db.delete(db.get(WorkLogin, login_id))
        db.commit()
    assert client.get("/work/declines", headers={"Authorization": "Bearer " + employee_token}).status_code == 403
    assert client.post(url, headers=headers, json={"reason": "retry"}).status_code == 200
    client.app.dependency_overrides[work.require_admin] = lambda: object()
    report = client.get("/work/declines")
    assert report.status_code == 200
    assert len(report.json()) == 1
    assert report.json()[0]["device_name"] == "PC-1"
    assert report.json()[0]["employee_name"] == "Sonu"
    assert report.json()[0]["reason"] == "Shift not started"


def test_cannot_report_decline_before_verification_or_after_start(setup):
    client, factory, device, login = setup
    headers = device("PC")
    attempt = client.post("/work/login", headers=headers,
                         json={"provider": "microsoft", "windows_user": "Shared"}).json()
    assert client.post(f'/work/login/{attempt["login_id"]}/decline', headers=headers,
                       json={"reason": "unverified"}).status_code == 409
    started = login(headers, "alice")
    with factory() as db:
        login_id = db.query(WorkLogin).filter_by(session_id=started["session_id"]).one().id
    assert client.post(f"/work/login/{login_id}/decline", headers=headers,
                       json={"reason": "already started"}).status_code == 409


def test_offline_upload_keeps_original_employee_and_device(setup):
    client, factory, device, login = setup
    headers = device("PC-1")
    old = login(headers, "alice")
    start = datetime.utcnow() - timedelta(minutes=2)
    with factory() as db:
        db.get(WorkSession, old["session_id"]).started_at = start
        db.commit()
    new = login(headers, "bob")
    sample = {"event_id": str(uuid.uuid4()), "session_id": old["session_id"],
              "device_name": "spoofed", "windows_user": "spoofed", "state": "active",
              "started_at": start.isoformat() + "Z", "ended_at": (start + timedelta(seconds=30)).isoformat() + "Z"}
    url = f'/work/sessions/{old["session_id"]}/activity'
    response = client.post(url, headers=headers, json={"samples": [sample]})
    assert response.status_code == 200, response.text
    assert response.json()["accepted"] == 1
    assert client.post(url, headers=headers, json={"samples": [sample]}).json()["accepted"] == 0
    with factory() as db:
        record = db.query(ActivityInterval).one()
        assert record.employee_id == old["employee_id"] != new["employee_id"]
        assert record.device_name == "PC-1" and record.windows_user == "SharedWindows"
    sample["event_id"] = str(uuid.uuid4())
    sample["session_id"] = new["session_id"]
    rejected = client.post(url, headers=headers, json={"samples": [sample]}).json()
    assert rejected["accepted"] == 0 and rejected["rejected_event_ids"] == [sample["event_id"]]
    sample["session_id"] = old["session_id"]
    sample["ended_at"] = (datetime.utcnow() + timedelta(seconds=30)).isoformat() + "Z"
    assert client.post(url, headers=headers, json={"samples": [sample]}).json()["accepted"] == 0


def test_expiry_invalid_end_device_auth_and_history_protection(setup):
    client, factory, device, login = setup
    headers = device("PC")
    session = login(headers, "alice")
    sid = session["session_id"]
    assert client.get("/work/providers").status_code == 401
    assert client.post(f"/work/sessions/{sid}/end", headers=headers,
                       json={"ended_at": "2000-01-01T00:00:00Z"}).status_code == 422
    assert client.get(f'/work/employees/{session["employee_id"]}/sessions', headers=headers).status_code == 401
    assert client.post(f"/work/sessions/{sid}/events", headers=headers,
        json={"timestamp": "bad", "event_type": "session_started"}).status_code == 422
    with factory() as db:
        db.get(WorkSession, sid).expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.post(f"/work/sessions/{sid}/ping", headers=headers, json={}).status_code == 409


def test_disabled_employee_cannot_start_or_upload(setup):
    client, factory, device, login = setup
    headers = device("PC")
    session = login(headers, "alice")
    with factory() as db:
        db.get(Employee, session["employee_id"]).is_active = False
        db.commit()
    assert client.post(f'/work/sessions/{session["session_id"]}/ping', headers=headers, json={}).status_code == 403


def test_end_session_idempotent_and_delayed_end_does_not_clear_new_presence(setup):
    client, factory, device, login = setup
    headers = device("PC")
    old = login(headers, "alice")
    new = login(headers, "alice")
    new_url = f'/work/sessions/{new["session_id"]}/ping'
    assert client.post(new_url, headers=headers, json={"state": "active"}).status_code == 200
    end_url = f'/work/sessions/{old["session_id"]}/end'
    for _ in range(2):
        assert client.post(end_url, headers=headers, json={"ended_at": datetime.utcnow().isoformat() + "Z"}).status_code == 200
    with factory() as db:
        assert db.get(EmployeePresence, new["employee_id"]).state == "active"
