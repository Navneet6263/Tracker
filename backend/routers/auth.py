import hashlib
import logging
import os
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from database import get_db
from models.models import Employee, ShiftAssignment, WindowsIdentity
from services.auth import (
    verify_password,
    create_token,
    hash_password,
    password_hash_needs_rehash,
    get_current_user,
)
from services.shifts import serialize_shift
from pydantic import BaseModel, Field

router = APIRouter(prefix="/auth", tags=["auth"])
LOGGER = logging.getLogger("sentinel.auth")


def _device_auto_enrollment_enabled() -> bool:
    return os.getenv("ALLOW_DEVICE_AUTO_ENROLLMENT", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _auto_employee_email(hostname: str, username: str) -> str:
    """Build a stable, unique internal email for a Windows profile."""

    safe_user = re.sub(r"[^a-z0-9]+", ".", username.casefold()).strip(".") or "user"
    safe_host = re.sub(r"[^a-z0-9]+", ".", hostname.casefold()).strip(".") or "device"
    fingerprint = hashlib.sha256(
        f"{hostname.casefold()}\0{username.casefold()}".encode("utf-8")
    ).hexdigest()[:12]
    local_part = f"{safe_user[:48]}.{safe_host[:48]}.{fingerprint}"
    return f"{local_part}@devices.greencall.local"


def _auto_employee_name(hostname: str, username: str) -> str:
    return f"{username} ({hostname})"[:255]


def _find_identity(db: Session, hostname: str, username: str):
    return db.query(WindowsIdentity).filter(
        WindowsIdentity.hostname == hostname,
        WindowsIdentity.username == username,
    ).first()


def _load_identity_user(db: Session, hostname: str, username: str):
    identity = _find_identity(db, hostname, username)
    user = (
        db.query(Employee).filter(Employee.id == identity.employee_id).first()
        if identity is not None
        else None
    )
    return identity, user

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Employee).filter(Employee.email == form.username).first()
    if not user or not user.is_active or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if password_hash_needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(form.password)
        db.commit()
    token = create_token({"sub": user.email, "role": user.role, "id": user.id})
    return {"access_token": token, "token_type": "bearer", "role": user.role}

@router.get("/me")
def me(user: Employee = Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}

class DeviceLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    hostname: str = Field(min_length=1, max_length=255)
    windows_sid: str | None = Field(default=None, max_length=255)

@router.post("/device-login")
def device_login(
    req: DeviceLoginRequest,
    db: Session = Depends(get_db),
):
    clean_user = req.username.strip().lower()
    clean_host = req.hostname.strip().lower()
    identity, user = _load_identity_user(db, clean_host, clean_user)
    identity_changed = False
    if identity is not None:
        if identity.windows_sid and req.windows_sid and identity.windows_sid != req.windows_sid:
            raise HTTPException(status_code=403, detail="Windows profile identity does not match")
    else:
        candidates = (
            db.query(Employee)
            .filter(Employee.role == "employee", Employee.is_active == 1)
            .all()
        )
        matching_users = [
            employee
            for employee in candidates
            if employee.email.partition("@")[0].strip().lower() == clean_user
        ]
        if len(matching_users) == 1:
            user = matching_users[0]
            identity = WindowsIdentity(
                employee_id=user.id,
                windows_sid=req.windows_sid,
                hostname=clean_host,
                username=clean_user,
            )
            db.add(identity)
            identity_changed = True
            LOGGER.info(
                "Auto-bound Windows profile %s\\%s to employee_id=%s",
                clean_host,
                clean_user,
                user.id,
            )
        elif len(matching_users) == 0 and _device_auto_enrollment_enabled():
            if not req.windows_sid:
                raise HTTPException(
                    status_code=403,
                    detail="Windows SID is required for automatic enrollment",
                )
            try:
                user = Employee(
                    name=_auto_employee_name(clean_host, clean_user),
                    email=_auto_employee_email(clean_host, clean_user),
                    hashed_password=hash_password(secrets.token_urlsafe(32)),
                    role="employee",
                    is_active=True,
                )
                db.add(user)
                db.flush()
                identity = WindowsIdentity(
                    employee_id=user.id,
                    windows_sid=req.windows_sid,
                    hostname=clean_host,
                    username=clean_user,
                )
                db.add(identity)
                db.commit()
                LOGGER.warning(
                    "Auto-enrolled Windows profile %s\\%s as employee_id=%s",
                    clean_host,
                    clean_user,
                    user.id,
                )
            except IntegrityError:
                # Concurrent startup attempts for the same Windows profile may
                # race. Reuse the row committed by the first request.
                db.rollback()
                identity, user = _load_identity_user(db, clean_host, clean_user)
                if identity is None or user is None:
                    raise HTTPException(
                        status_code=409,
                        detail="Windows profile enrollment conflicted; retry shortly",
                    )
        else:
            LOGGER.warning(
                "Unassigned Windows profile rejected: %s\\%s matching_employees=%s",
                clean_host,
                clean_user,
                len(matching_users),
            )
            raise HTTPException(
                status_code=403,
                detail="No unique employee email matches the Windows username",
            )

    if not user or not user.is_active or user.role != "employee":
        raise HTTPException(status_code=403, detail="Employee is inactive or invalid")
    if not identity.windows_sid and req.windows_sid:
        identity.windows_sid = req.windows_sid
        identity_changed = True
    if identity_changed:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Windows SID is already assigned to another profile",
            )

    shift = db.query(ShiftAssignment).filter(
        ShiftAssignment.employee_id == user.id,
        ShiftAssignment.enabled == 1,
    ).first()

    token = create_token({"sub": user.email, "role": user.role, "id": user.id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "id": user.id,
        "name": user.name,
        "shift": serialize_shift(shift),
    }


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=72)


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    user: Employee = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if verify_password(req.new_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different")
    user.hashed_password = hash_password(req.new_password)
    db.commit()
    return {"status": "password_changed"}
