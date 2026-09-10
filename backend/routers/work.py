"""Authenticated devices + verified employee work sessions for shared PCs.

Legacy endpoints stay available for existing installations. New devices use only
these endpoints; queue ownership is resolved from the original session, never
from whichever employee happens to be signed in when an upload arrives.
"""
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Form, Header, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models.models import (Employee, EmployeePresence, ExternalIdentity, TrackerDevice,
                           WorkLogin, WorkSession, WorkDecline)
from routers.activity import ActivityBatch, ingest_activity, _as_utc_naive
from routers.events import EventRequest, HeartbeatRequest, create_event, ping
from services.auth import hash_password, require_admin
from services.work_identity import (authorize_url, configured_providers, digest,
                                    provider_config, verify_code)

router = APIRouter(prefix="/work", tags=["work sessions"])


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def device_auth(authorization: str = Header(default=""), db: Session = Depends(get_db)):
    try:
        scheme, credential = authorization.split(" ", 1)
        device_id, key = credential.split(".", 1)
    except ValueError:
        raise HTTPException(401, "Device authorization required")
    device = db.get(TrackerDevice, device_id)
    if scheme != "Device" or not device or not device.is_active or not secrets.compare_digest(device.credential_hash, digest(key)):
        raise HTTPException(401, "Device authorization invalid")
    return device


class Enrollment(BaseModel):
    device_id: uuid.UUID
    device_key: str = Field(min_length=40, max_length=128)
    enrollment_key: str = Field(min_length=20, max_length=256)
    name: str = Field(min_length=1, max_length=255)


@router.post("/devices")
def enroll(req: Enrollment, db: Session = Depends(get_db)):
    expected = os.getenv("WORK_ENROLLMENT_KEY", "")
    if len(expected) < 32 or not secrets.compare_digest(expected, req.enrollment_key):
        raise HTTPException(403, "Device enrollment key invalid or enrollment disabled")
    device_id = str(req.device_id)
    existing = db.get(TrackerDevice, device_id)
    if existing:
        if not existing.is_active or not secrets.compare_digest(existing.credential_hash, digest(req.device_key)):
            raise HTTPException(409, "Device already registered")
    else:
        db.add(TrackerDevice(id=device_id, name=req.name.strip(), credential_hash=digest(req.device_key)))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Enrollment raced; retry")
    return {"device_id": device_id}


@router.get("/providers")
def providers(_: TrackerDevice = Depends(device_auth)):
    return {"providers": configured_providers()}


class LoginStart(BaseModel):
    provider: str
    windows_user: str = Field(min_length=1, max_length=255)


@router.post("/login")
def start_login(req: LoginStart, device: TrackerDevice = Depends(device_auth), db: Session = Depends(get_db)):
    config = provider_config(req.provider)
    # Bound pending browser handshakes; do not store raw state in the DB.
    db.query(WorkLogin).filter(WorkLogin.device_id == device.id, WorkLogin.expires_at < now()).delete()
    if db.query(WorkLogin).filter(WorkLogin.device_id == device.id, WorkLogin.expires_at > now()).count() >= 10:
        raise HTTPException(429, "Too many sign-in attempts; wait for existing attempts to expire")
    state, verifier, nonce = (secrets.token_urlsafe(48) for _ in range(3))
    try:
        url = authorize_url(config, state, verifier, nonce)
    except Exception:
        raise HTTPException(503, "Identity provider unavailable or misconfigured")
    attempt = WorkLogin(id=str(uuid.uuid4()), device_id=device.id, provider=req.provider,
                        state_hash=digest(state), verifier=verifier, nonce=nonce,
                        windows_user=req.windows_user, expires_at=now() + timedelta(minutes=10))
    db.add(attempt)
    db.commit()
    return {"login_id": attempt.id, "authorization_url": url}


@router.get("/callback/{provider}", response_class=HTMLResponse)
def callback(provider: str, state: str = "", code: str = "", error: str = "", db: Session = Depends(get_db)):
    attempt = db.query(WorkLogin).filter_by(state_hash=digest(state), provider=provider).first()
    if not attempt or attempt.expires_at <= now() or attempt.claimed:
        raise HTTPException(400, "Sign-in expired or already used; start again in Tracker")
    claimed = db.query(WorkLogin).filter_by(id=attempt.id, claimed=False).update({"claimed": True})
    if claimed != 1:
        raise HTTPException(409, "Sign-in already in progress")
    db.commit()
    if error or not code:
        raise HTTPException(400, "Sign-in was not completed; start again in Tracker")
    try:
        identity = verify_code(provider_config(provider), code, attempt.verifier, attempt.nonce)
    except Exception:
        raise HTTPException(401, "Could not verify work identity; contact your administrator")
    identity_key = digest(identity["issuer"] + "\0" + identity["subject"])
    external = db.get(ExternalIdentity, identity_key)
    if external:
        employee = db.get(Employee, external.employee_id)
    else:
        # Never match or merge identities by name or an unverified email claim.
        employee = Employee(name=identity["name"], email=identity_key + "@identity.invalid",
                            hashed_password=hash_password(secrets.token_urlsafe(32)),
                            role="employee", is_active=True)
        db.add(employee)
        try:
            db.flush()
            db.add(ExternalIdentity(identity_key=identity_key, provider=provider,
                                   issuer=identity["issuer"], subject=identity["subject"], employee_id=employee.id))
            db.flush()
        except IntegrityError:
            db.rollback()
            external = db.get(ExternalIdentity, identity_key)
            if not external:
                raise HTTPException(409, "Identity registration raced; sign in again")
            employee = db.get(Employee, external.employee_id)
    if not employee or not employee.is_active or employee.role != "employee":
        raise HTTPException(403, "Employee inactive or ineligible")
    attempt.employee_id = employee.id
    # Discard PKCE/nonce values after use. Provider tokens are never persisted.
    attempt.verifier = "used"
    attempt.nonce = "used"
    db.commit()
    return HTMLResponse("<h2>Identity verified</h2><p>Return to Sentinel Tracker and confirm your name to start work.</p>",
                        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


@router.post("/callback/{provider}", response_class=HTMLResponse)
def callback_form(provider: str, state: str = Form(default=""), code: str = Form(default=""),
                  error: str = Form(default=""), db: Session = Depends(get_db)):
    # Microsoft returns the one-use code in a form body, not proxy URL logs.
    return callback(provider, state, code, error, db)


def login_for_device(db, login_id, device):
    attempt = db.get(WorkLogin, login_id)
    if not attempt or attempt.device_id != device.id or attempt.expires_at <= now():
        raise HTTPException(404, "Work sign-in expired or missing")
    return attempt


@router.get("/login/{login_id}")
def login_status(login_id: str, device: TrackerDevice = Depends(device_auth), db: Session = Depends(get_db)):
    attempt = login_for_device(db, login_id, device)
    employee = db.get(Employee, attempt.employee_id) if attempt.employee_id else None
    return {"ready": employee is not None, "name": employee.name if employee else None}


def lock_row(db, model, key):
    # SQL Server/Postgres row locks serialize switches across API workers.
    # SQLite is for local testing, not multi-worker shared-PC deployments.
    query = db.query(model).populate_existing().filter(model.id == key)
    if db.bind.dialect.name == "mssql":
        query = query.with_hint(model, "WITH (UPDLOCK, HOLDLOCK)", dialect_name="mssql")
    else:
        query = query.with_for_update()
    return query.one()


def close_sessions(db, sessions, timestamp):
    for work in sessions:
        if work.ended_at is None:
            work.ended_at = min(timestamp, work.expires_at)
            presence = db.get(EmployeePresence, work.employee_id)
            if presence:
                presence.state, presence.app_name = "offline", None


def serialize_session(work, employee, device):
    return {"session_id": work.id, "employee_id": employee.id, "name": employee.name,
            "device_name": device.name, "windows_user": work.windows_user,
            "started_at": work.started_at.isoformat() + "Z", "expires_at": work.expires_at.isoformat() + "Z"}


@router.post("/login/{login_id}/confirm")
def confirm_login(login_id: str, device: TrackerDevice = Depends(device_auth), db: Session = Depends(get_db)):
    lock_row(db, TrackerDevice, device.id)
    if not device.is_active:
        raise HTTPException(401, "Device disabled")
    attempt = login_for_device(db, login_id, device)
    if db.get(WorkDecline, login_id):
        raise HTTPException(409, "Reason already submitted; start a new sign-in to work")
    if not attempt.employee_id:
        raise HTTPException(409, "Complete provider sign-in first")
    employee = lock_row(db, Employee, attempt.employee_id)
    if not employee.is_active or employee.role != "employee":
        raise HTTPException(403, "Employee inactive")
    if attempt.session_id:
        work = db.get(WorkSession, attempt.session_id)
        if work.ended_at or work.expires_at <= now():
            raise HTTPException(409, "Session has ended; sign in again")
        return serialize_session(work, employee, device)
    timestamp = now()
    prior = db.query(WorkSession).filter(
        or_(WorkSession.employee_id == employee.id, WorkSession.device_id == device.id),
        WorkSession.ended_at.is_(None)).all()
    close_sessions(db, prior, timestamp)
    work = WorkSession(id=str(uuid.uuid4()), employee_id=employee.id, device_id=device.id,
                       windows_user=attempt.windows_user, started_at=timestamp,
                       expires_at=timestamp + timedelta(hours=16))
    db.add(work)
    db.flush()
    attempt.session_id = work.id
    db.commit()
    return serialize_session(work, employee, device)


class DeclineRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Please enter a reason")
        return value


@router.post("/login/{login_id}/decline")
def decline_login(login_id: str, req: DeclineRequest, device: TrackerDevice = Depends(device_auth), db: Session = Depends(get_db)):
    lock_row(db, TrackerDevice, device.id)
    if not device.is_active:
        raise HTTPException(401, "Device disabled")
    existing = db.get(WorkDecline, login_id)
    if existing:
        if existing.device_id != device.id:
            raise HTTPException(404, "Sign-in missing")
        return {"status": "submitted"}
    attempt = login_for_device(db, login_id, device)
    if not attempt.employee_id or attempt.session_id:
        raise HTTPException(409, "Requires verified sign-in with no started work session")
    employee = lock_row(db, Employee, attempt.employee_id)
    if not employee.is_active or employee.role != "employee":
        raise HTTPException(403, "Employee inactive")
    db.add(WorkDecline(login_id=attempt.id, employee_id=employee.id, device_id=device.id, reason=req.reason))
    db.commit()
    return {"status": "submitted"}


@router.get("/declines")
def list_declines(db: Session = Depends(get_db), _: Employee = Depends(require_admin)):
    rows = db.query(WorkDecline, Employee.name, TrackerDevice.name).join(
        Employee, Employee.id == WorkDecline.employee_id).join(
        TrackerDevice, TrackerDevice.id == WorkDecline.device_id).order_by(
        WorkDecline.created_at.desc()).limit(100).all()
    return [{"id": item.login_id, "employee_id": item.employee_id, "employee_name": employee_name,
             "device_name": device_name, "reason": item.reason,
             "created_at": item.created_at.isoformat() + "Z"} for item, employee_name, device_name in rows]


def work_for_device(db, session_id, device, active=False):
    lock_row(db, TrackerDevice, device.id)
    if not device.is_active:
        raise HTTPException(401, "Device disabled")
    work = db.get(WorkSession, session_id)
    if not work or work.device_id != device.id:
        raise HTTPException(403, "Session does not belong to this device")
    employee = lock_row(db, Employee, work.employee_id)
    db.refresh(work)
    if not employee or not employee.is_active or employee.role != "employee":
        raise HTTPException(403, "Employee inactive")
    if active and (work.ended_at or work.expires_at <= now()):
        raise HTTPException(409, "Work session ended; sign in again")
    return work, employee


class EndSession(BaseModel):
    ended_at: datetime


@router.post("/sessions/{session_id}/end")
def end_session(session_id: str, req: EndSession, device: TrackerDevice = Depends(device_auth), db: Session = Depends(get_db)):
    lock_row(db, TrackerDevice, device.id)
    work, employee = work_for_device(db, session_id, device)
    lock_row(db, Employee, employee.id)
    end = _as_utc_naive(req.ended_at)
    if not work.started_at <= end <= now() + timedelta(minutes=1):
        raise HTTPException(422, "Invalid session end time")
    close_sessions(db, [work], min(end, now()))
    db.commit()
    return {"status": "ended"}


@router.post("/sessions/{session_id}/activity")
async def session_activity(session_id: str, req: ActivityBatch, device: TrackerDevice = Depends(device_auth), db: Session = Depends(get_db)):
    work, employee = work_for_device(db, session_id, device)
    upper = min(work.ended_at or work.expires_at, work.expires_at)
    accepted = []
    rejected = []
    for sample in req.samples:
        start, end = _as_utc_naive(sample.started_at), _as_utc_naive(sample.ended_at)
        if sample.session_id != work.id or start < work.started_at or end > upper:
            rejected.append(str(sample.event_id))
            continue
        accepted.append(sample.model_copy(update={"device_name": device.name, "windows_user": work.windows_user}))
    result = await ingest_activity(ActivityBatch(samples=accepted), db, employee) if accepted else {"accepted": 0}
    return {**result, "rejected_event_ids": rejected}


@router.post("/sessions/{session_id}/events")
async def session_event(session_id: str, req: EventRequest, device: TrackerDevice = Depends(device_auth), db: Session = Depends(get_db)):
    work, employee = work_for_device(db, session_id, device)
    try:
        timestamp = _as_utc_naive(datetime.fromisoformat(req.timestamp.replace("Z", "+00:00")))
    except ValueError:
        raise HTTPException(422, "Invalid event timestamp")
    if not work.started_at <= timestamp <= min(work.ended_at or work.expires_at, work.expires_at):
        raise HTTPException(422, "Event outside work session")
    req.payload = {"session_id": work.id, "device_name": device.name}
    return await create_event(req, db, employee)


@router.post("/sessions/{session_id}/ping")
async def session_ping(session_id: str, req: HeartbeatRequest, device: TrackerDevice = Depends(device_auth), db: Session = Depends(get_db)):
    work, employee = work_for_device(db, session_id, device, active=True)
    req.device_name, req.windows_user = device.name, work.windows_user
    return await ping(req, db, employee)


@router.get("/employees/{employee_id}/sessions")
def history(employee_id: int, db: Session = Depends(get_db), _: Employee = Depends(require_admin)):
    rows = db.query(WorkSession, TrackerDevice.name).join(TrackerDevice).filter(
        WorkSession.employee_id == employee_id).order_by(WorkSession.started_at.desc()).limit(100).all()
    return [{"id": w.id, "device_name": name, "started_at": w.started_at.isoformat() + "Z",
             "ended_at": (w.ended_at or w.expires_at).isoformat() + "Z" if w.ended_at or w.expires_at <= now() else None,
             "expires_at": w.expires_at.isoformat() + "Z"} for w, name in rows]


@router.post("/devices/{device_id}/disable")
def disable_device(device_id: str, db: Session = Depends(get_db), _: Employee = Depends(require_admin)):
    if not db.get(TrackerDevice, device_id):
        raise HTTPException(404, "Device not found")
    device = lock_row(db, TrackerDevice, device_id)
    device.is_active = False
    close_sessions(db, db.query(WorkSession).filter_by(device_id=device.id, ended_at=None).all(), now())
    db.commit()
    return {"status": "disabled"}
