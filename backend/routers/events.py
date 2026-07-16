from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel
from typing import Any
from database import get_db
from models.models import SystemEvent, Employee
from services.auth import get_current_user
from routers.ws import broadcast_to_admins

router = APIRouter(prefix="/events", tags=["events"])

class EventRequest(BaseModel):
    event_type: str
    payload: Any
    timestamp: str

@router.post("")
async def create_event(req: EventRequest, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    import json
    ev = SystemEvent(
        employee_id=user.id,
        event_type=req.event_type,
        payload=json.dumps(req.payload),
        occurred_at=datetime.fromisoformat(req.timestamp),
    )
    db.add(ev)
    db.commit()

    await broadcast_to_admins({
        "type": "event",
        "event_type": req.event_type,
        "employee_id": user.id,
    })
    return {"status": "ok"}

from fastapi import HTTPException

pending_commands = {}

@router.post("/request_screenshot/{employee_id}")
async def request_screenshot(employee_id: int, user: Employee = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403)
    pending_commands[employee_id] = "take_screenshot"
    return {"status": "requested"}

@router.post("/ping")
async def ping(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    import json
    ev = SystemEvent(
        employee_id=user.id,
        event_type="ping",
        payload=json.dumps({}),
        occurred_at=datetime.utcnow(),
    )
    db.add(ev)
    db.commit()

    await broadcast_to_admins({
        "type": "ping",
        "employee_id": user.id,
    })
    
    cmd = pending_commands.pop(user.id, None)
    return {"status": "ok", "command": cmd}

@router.get("/{employee_id}")
def get_events(employee_id: int, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    if user.role != "admin" and user.id != employee_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403)
    events = db.query(SystemEvent).filter(SystemEvent.employee_id == employee_id).order_by(SystemEvent.occurred_at.desc()).limit(100).all()
    return [{"type": e.event_type, "payload": e.payload, "at": e.occurred_at} for e in events]
