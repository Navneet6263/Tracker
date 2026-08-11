import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models.models import ActivityInterval, Employee, ShiftAssignment
from routers.ws import broadcast_to_admins
from services.auth import get_current_user
from services.productivity import classify
from services.shifts import WORK_STATES, infer_shift_assignment, is_within_shift


router = APIRouter(prefix="/activity", tags=["activity"])
LOGGER = logging.getLogger("sentinel.activity")
ALLOWED_STATES = {"active", "passive", "meeting", "idle", "locked"}


def _as_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


class ActivitySample(BaseModel):
    event_id: UUID
    session_id: str = Field(min_length=1, max_length=100)
    device_name: str = Field(min_length=1, max_length=255)
    windows_user: str = Field(min_length=1, max_length=255)
    state: str
    app_name: str | None = Field(default=None, max_length=255)
    domain: str | None = Field(default=None, max_length=255)
    started_at: datetime
    ended_at: datetime
    keyboard_events: int = Field(default=0, ge=0, le=1_000_000)
    mouse_events: int = Field(default=0, ge=0, le=1_000_000)
    keyboard_active_secs: int = Field(default=0, ge=0, le=300)
    mouse_active_secs: int = Field(default=0, ge=0, le=300)

    @field_validator("state")
    @classmethod
    def validate_state(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_STATES:
            raise ValueError("Unsupported activity state")
        return normalized


class ActivityBatch(BaseModel):
    samples: list[ActivitySample] = Field(min_length=1, max_length=500)


@router.post("/batch")
async def ingest_activity(
    req: ActivityBatch,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    inserted = 0
    latest = None
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    requested_ids = [str(sample.event_id) for sample in req.samples]
    existing_ids = {
        row[0]
        for row in db.query(ActivityInterval.client_event_id)
        .filter(ActivityInterval.client_event_id.in_(requested_ids))
        .all()
    }
    assigned_shift = (
        db.query(ShiftAssignment)
        .filter(
            ShiftAssignment.employee_id == user.id,
            ShiftAssignment.enabled == 1,
        )
        .first()
    )

    seen_ids = set(existing_ids)
    for sample in req.samples:
        event_id = str(sample.event_id)
        if event_id in seen_ids:
            continue
        seen_ids.add(event_id)

        started_at = _as_utc_naive(sample.started_at)
        ended_at = _as_utc_naive(sample.ended_at)
        duration = int((ended_at - started_at).total_seconds())
        if duration <= 0 or duration > 300:
            raise HTTPException(status_code=422, detail="Activity intervals must be 1-300 seconds")
        if ended_at > now + timedelta(minutes=5) or started_at < now - timedelta(days=14):
            raise HTTPException(status_code=422, detail="Activity timestamp is outside the accepted range")

        normalized_state = sample.state
        if (sample.app_name or "").strip().lower() == "lockapp" or (
            sample.domain or ""
        ).strip().casefold() == "windows default lock screen":
            normalized_state = "locked"
        if normalized_state in WORK_STATES and not is_within_shift(
            started_at, assigned_shift
        ):
            normalized_state = "off_shift"
        label = " ".join(filter(None, [sample.app_name, sample.domain]))
        category = "productive" if normalized_state == "meeting" else classify(label)
        row = ActivityInterval(
            client_event_id=event_id,
            employee_id=user.id,
            session_id=sample.session_id,
            device_name=sample.device_name,
            windows_user=sample.windows_user,
            state=normalized_state,
            app_name=sample.app_name,
            domain=sample.domain,
            category=category,
            started_at=started_at,
            ended_at=ended_at,
            duration_secs=duration,
            keyboard_events=sample.keyboard_events,
            mouse_events=sample.mouse_events,
            keyboard_active_secs=min(sample.keyboard_active_secs, duration),
            mouse_active_secs=min(sample.mouse_active_secs, duration),
        )
        db.add(row)
        inserted += 1
        latest = row

    db.commit()

    try:
        infer_shift_assignment(db, user.id)
    except Exception:
        db.rollback()
        LOGGER.exception("Automatic shift inference failed for employee_id=%s", user.id)

    if latest is not None:
        await broadcast_to_admins(
            {
                "type": "activity",
                "employee_id": user.id,
                "state": latest.state,
                "app_name": latest.app_name,
                "inputs": {
                    "keyboard": latest.keyboard_events > 0,
                    "mouse": latest.mouse_events > 0,
                    "keyboard_events": latest.keyboard_events,
                    "mouse_events": latest.mouse_events,
                },
            }
        )

    return {"status": "ok", "accepted": inserted}
