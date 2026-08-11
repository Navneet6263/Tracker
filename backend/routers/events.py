import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models.models import AgentCommand, Employee, EmployeePresence, ShiftAssignment, SystemEvent
from routers.ws import broadcast_to_admins
from services.auth import get_current_user, require_admin
from services.shifts import serialize_shift


router = APIRouter(prefix="/events", tags=["events"])
ALLOWED_EVENT_TYPES = {
    "screen_locked",
    "screen_unlocked",
    "session_started",
    "session_ended",
    "sleep",
    "resume",
    "went_offline",
    "came_online",
    "client_started",
    "client_stopped",
}
ALLOWED_PRESENCE_STATES = {
    "active",
    "passive",
    "meeting",
    "idle",
    "locked",
    "off_shift",
    "offline",
}


def _parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


class EventRequest(BaseModel):
    event_type: str
    payload: Any = Field(default_factory=dict)
    timestamp: str


@router.post("")
async def create_event(
    req: EventRequest,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if req.event_type not in ALLOWED_EVENT_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported event type")
    occurred_at = _parse_timestamp(req.timestamp)
    ev = SystemEvent(
        employee_id=user.id,
        event_type=req.event_type,
        payload=json.dumps(req.payload),
        occurred_at=occurred_at,
    )
    db.add(ev)
    db.commit()
    await broadcast_to_admins(
        {"type": "event", "event_type": req.event_type, "employee_id": user.id}
    )
    return {"status": "ok"}


@router.post("/stop_client/{employee_id}")
def stop_client(
    employee_id: int,
    db: Session = Depends(get_db),
    _: Employee = Depends(require_admin),
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    db.add(AgentCommand(employee_id=employee_id, command="stop_client"))
    db.commit()
    return {"status": "stop_command_queued"}


class HeartbeatRequest(BaseModel):
    state: str = Field(default="active", max_length=30)
    app_name: str | None = Field(default=None, max_length=255)
    device_name: str | None = Field(default=None, max_length=255)
    windows_user: str | None = Field(default=None, max_length=255)

    @field_validator("state")
    @classmethod
    def validate_state(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_PRESENCE_STATES:
            raise ValueError("Unsupported presence state")
        return normalized


@router.post("/ping")
async def ping(
    req: HeartbeatRequest = Body(default=HeartbeatRequest()),
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    presence = db.query(EmployeePresence).filter(EmployeePresence.employee_id == user.id).first()
    if presence is None:
        presence = EmployeePresence(employee_id=user.id)
        db.add(presence)
    presence.last_seen = datetime.now(timezone.utc).replace(tzinfo=None)
    presence.state = req.state
    presence.app_name = req.app_name
    presence.device_name = req.device_name
    presence.windows_user = req.windows_user

    command = (
        db.query(AgentCommand)
        .filter(
            AgentCommand.employee_id == user.id,
            AgentCommand.delivered_at.is_(None),
        )
        .order_by(AgentCommand.created_at.asc())
        .first()
    )
    command_name = None
    if command is not None:
        command_name = command.command
        command.delivered_at = datetime.now(timezone.utc).replace(tzinfo=None)
    shift = (
        db.query(ShiftAssignment)
        .filter(
            ShiftAssignment.employee_id == user.id,
            ShiftAssignment.enabled == 1,
        )
        .first()
    )
    db.commit()

    await broadcast_to_admins(
        {
            "type": "ping",
            "employee_id": user.id,
            "state": req.state,
            "app_name": req.app_name,
        }
    )
    return {
        "status": "ok",
        "command": command_name,
        "shift": serialize_shift(shift),
    }


@router.get("/{employee_id}")
def get_events(
    employee_id: int,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role != "admin" and user.id != employee_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    events = (
        db.query(SystemEvent)
        .filter(SystemEvent.employee_id == employee_id)
        .order_by(SystemEvent.occurred_at.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": event.id,
            "event_type": event.event_type,
            "payload": event.payload,
            "occurred_at": event.occurred_at,
        }
        for event in events
    ]
