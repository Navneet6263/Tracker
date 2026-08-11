from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from database import get_db
from models.models import (
    ActivityInterval,
    Employee,
    EmployeePresence,
    ShiftAssignment,
    SystemEvent,
)
from services.auth import get_current_user, require_admin


router = APIRouter(prefix="/analytics", tags=["analytics"])
WORK_STATES = ("active", "passive", "meeting")


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _date_range(period: str):
    now = _utcnow()
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    return now - timedelta(hours=24)


@router.get("/summary")
def summary(db: Session = Depends(get_db), _: Employee = Depends(require_admin)):
    since = _date_range("day")
    employees = (
        db.query(Employee)
        .filter(Employee.role == "employee", Employee.is_active == 1)
        .all()
    )

    aggregates = []
    try:
        aggregates = (
            db.query(
                ActivityInterval.employee_id,
                func.sum(
                    case(
                        (ActivityInterval.state.in_(WORK_STATES), ActivityInterval.duration_secs),
                        else_=0,
                    )
                ).label("work_secs"),
                func.sum(
                    case(
                        (ActivityInterval.category == "productive", ActivityInterval.duration_secs),
                        else_=0,
                    )
                ).label("productive_secs"),
                func.sum(
                    case(
                        (ActivityInterval.state == "meeting", ActivityInterval.duration_secs),
                        else_=0,
                    )
                ).label("meeting_secs"),
            )
            .filter(ActivityInterval.started_at >= since)
            .group_by(ActivityInterval.employee_id)
            .all()
        )
    except Exception:
        db.rollback()

    aggregate_by_employee = {
        row.employee_id: {
            "work": int(row.work_secs or 0),
            "productive": int(row.productive_secs or 0),
            "meeting": int(row.meeting_secs or 0),
        }
        for row in aggregates
    }

    presence_by_employee = {}
    try:
        presence_by_employee = {
            row.employee_id: row for row in db.query(EmployeePresence).all()
        }
    except Exception:
        db.rollback()

    shift_by_employee = {}
    try:
        shift_by_employee = {
            row.employee_id: row
            for row in db.query(ShiftAssignment)
            .filter(ShiftAssignment.enabled == 1)
            .all()
        }
    except Exception:
        db.rollback()

    result = []
    for employee in employees:
        metrics = aggregate_by_employee.get(
            employee.id, {"work": 0, "productive": 0, "meeting": 0}
        )
        work_secs = metrics["work"]
        score = round((metrics["productive"] / work_secs) * 100, 1) if work_secs else 0.0
        presence = presence_by_employee.get(employee.id)
        shift = shift_by_employee.get(employee.id)
        result.append(
            {
                "id": employee.id,
                "name": employee.name,
                "email": employee.email,
                "productivity_score": score,
                "active_hours": round(work_secs / 3600, 2),
                "meeting_hours": round(metrics["meeting"] / 3600, 2),
                "last_ping": presence.last_seen.isoformat() if presence else None,
                "current_state": presence.state if presence else "offline",
                "current_app": presence.app_name if presence else None,
                "shift": None
                if shift is None
                else {
                    "name": shift.shift_name,
                    "start": shift.start_local,
                    "end": shift.end_local,
                    "timezone": shift.timezone_name,
                },
            }
        )
    return result


@router.get("/employee/{employee_id}")
def employee_analytics(
    employee_id: int,
    period: str = "day",
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role != "admin" and user.id != employee_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if period not in {"day", "week", "month"}:
        raise HTTPException(status_code=422, detail="Unsupported period")

    since = _date_range(period)
    intervals = []
    try:
        intervals = (
            db.query(ActivityInterval)
            .filter(
                ActivityInterval.employee_id == employee_id,
                ActivityInterval.started_at >= since,
            )
            .order_by(ActivityInterval.started_at.asc())
            .all()
        )
    except Exception:
        db.rollback()

    app_secs: dict[tuple[str, str], int] = {}
    page_secs: dict[tuple[str, str], int] = {}
    state_secs: dict[str, int] = {}
    work_secs = 0
    productive_secs = 0
    keyboard_secs = 0
    mouse_secs = 0
    keyboard_events = 0
    mouse_events = 0
    for interval in intervals:
        state_secs[interval.state] = state_secs.get(interval.state, 0) + interval.duration_secs
        if interval.state in WORK_STATES:
            work_secs += interval.duration_secs
        if interval.category == "productive" and interval.state in WORK_STATES:
            productive_secs += interval.duration_secs
        keyboard_secs += interval.keyboard_active_secs or 0
        mouse_secs += interval.mouse_active_secs or 0
        keyboard_events += interval.keyboard_events or 0
        mouse_events += interval.mouse_events or 0
        if interval.state in WORK_STATES:
            app = interval.app_name or "Unknown"
            key = (app, interval.category)
            app_secs[key] = app_secs.get(key, 0) + interval.duration_secs
            if interval.domain:
                page_key = (app, interval.domain)
                page_secs[page_key] = page_secs.get(page_key, 0) + interval.duration_secs

    events = (
        db.query(SystemEvent)
        .filter(
            SystemEvent.employee_id == employee_id,
            SystemEvent.occurred_at >= since,
            SystemEvent.event_type.in_(
                ["went_offline", "came_online", "screen_locked", "screen_unlocked"]
            ),
        )
        .order_by(SystemEvent.occurred_at.asc())
        .all()
    )
    offline_periods = _pair_gap_events(events)

    return {
        "productivity_score": round((productive_secs / work_secs) * 100, 1) if work_secs else 0.0,
        "active_hours": round(work_secs / 3600, 2),
        "keyboard_mins": round(keyboard_secs / 60, 1),
        "mouse_mins": round(mouse_secs / 60, 1),
        "keyboard_events": keyboard_events,
        "mouse_events": mouse_events,
        "meeting_mins": round(state_secs.get("meeting", 0) / 60, 1),
        "passive_mins": round(state_secs.get("passive", 0) / 60, 1),
        "idle_mins": round(state_secs.get("idle", 0) / 60, 1),
        "locked_mins": round(state_secs.get("locked", 0) / 60, 1),
        "state_breakdown": {
            state: round(seconds / 60, 1) for state, seconds in state_secs.items()
        },
        "app_breakdown": [
            {
                "app": app,
                "category": category,
                "secs": seconds,
                "hours": round(seconds / 3600, 2),
            }
            for (app, category), seconds in sorted(
                app_secs.items(), key=lambda item: -item[1]
            )[:20]
        ],
        "page_breakdown": [
            {"app": app, "title": title, "secs": seconds}
            for (app, title), seconds in sorted(
                page_secs.items(), key=lambda item: -item[1]
            )[:30]
        ],
        "offline_periods": offline_periods,
    }


def _pair_gap_events(events: list[SystemEvent]) -> list[dict]:
    pairs = {
        "screen_locked": ("screen_unlocked", "screen_locked"),
        "went_offline": ("came_online", "offline"),
    }
    open_events: dict[str, datetime] = {}
    periods: list[dict] = []
    for event in events:
        if event.event_type in pairs:
            open_events[event.event_type] = event.occurred_at
            continue
        for start_type, (end_type, reason) in pairs.items():
            if event.event_type == end_type and start_type in open_events:
                periods.append(
                    {
                        "from": open_events.pop(start_type).isoformat(),
                        "to": event.occurred_at.isoformat(),
                        "reason": reason,
                    }
                )
    now = _utcnow().isoformat()
    for start_type, started_at in open_events.items():
        periods.append(
            {
                "from": started_at.isoformat(),
                "to": now,
                "reason": pairs[start_type][1],
            }
        )
    return sorted(periods, key=lambda row: row["from"])
