from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import get_db
from models.models import Employee, ShiftAssignment, WindowsIdentity
from services.auth import verify_password, create_token, hash_password, get_current_user
from pydantic import BaseModel, Field

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Employee).filter(Employee.email == form.username).first()
    if not user or not user.is_active or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
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
    identity = db.query(WindowsIdentity).filter(
        WindowsIdentity.hostname == clean_host,
        WindowsIdentity.username == clean_user,
    ).first()
    if identity is None:
        raise HTTPException(status_code=403, detail="Windows profile is not assigned to an employee")
    if identity.windows_sid and req.windows_sid and identity.windows_sid != req.windows_sid:
        raise HTTPException(status_code=403, detail="Windows profile identity does not match")
    user = db.query(Employee).filter(Employee.id == identity.employee_id).first()
    if not user or not user.is_active or user.role != "employee":
        raise HTTPException(status_code=403, detail="Employee is inactive or invalid")
    if not identity.windows_sid and req.windows_sid:
        identity.windows_sid = req.windows_sid
        db.commit()

    shift = db.query(ShiftAssignment).filter(
        ShiftAssignment.employee_id == user.id,
        ShiftAssignment.enabled.is_(True),
    ).first()

    token = create_token({"sub": user.email, "role": user.role, "id": user.id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "id": user.id,
        "name": user.name,
        "shift": None if shift is None else {
            "name": shift.shift_name,
            "start": shift.start_local,
            "end": shift.end_local,
            "timezone": shift.timezone_name,
        },
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
