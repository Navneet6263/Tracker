from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from database import get_db
from models.models import Employee, ActivityLog, SystemEvent
from services.auth import require_admin, get_current_user
from services.productivity import compute_productivity_score, extract_app_name

router = APIRouter(prefix="/analytics", tags=["analytics"])

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
def summary(db: Session = Depends(get_db), _=Depends(require_admin)):
    employees = db.query(Employee).filter(Employee.role == "employee").all()
    result = []
    for emp in employees:
        since = _date_range("day")
        logs = db.query(ActivityLog).filter(
            ActivityLog.employee_id == emp.id,
            ActivityLog.logged_at >= since
        ).all()
        score = compute_productivity_score(logs)
        active_secs = sum(l.duration_secs for l in logs)

        last_log = db.query(ActivityLog).filter(
            ActivityLog.employee_id == emp.id
        ).order_by(ActivityLog.logged_at.desc()).first()
        last_ping = last_log.logged_at.isoformat() if last_log else None

        result.append({
            "id": emp.id,
            "name": emp.name,
            "email": emp.email,
            "productivity_score": score,
            "active_hours": round(active_secs / 3600, 2),
            "last_ping": last_ping
        })
    return result

@router.get("/employee/{employee_id}")
def employee_analytics(
    employee_id: int,
    period: str = "day",
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role != "admin" and user.id != employee_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403)

    since = _date_range(period)
    logs = db.query(ActivityLog).filter(
        ActivityLog.employee_id == employee_id,
        ActivityLog.logged_at >= since
    ).order_by(ActivityLog.logged_at.asc()).all()

    # App time breakdown (grouped by clean app name, in hours)
    app_secs: dict = {}
    keyboard_mins = 0
    mouse_mins = 0
    for l in logs:
        app_name = extract_app_name(l.window_title or "")
        app_secs[app_name] = app_secs.get(app_name, 0) + l.duration_secs
        if l.keyboard_active:
            keyboard_mins += l.duration_secs / 60
        if l.mouse_active:
            mouse_mins += l.duration_secs / 60

    # Offline periods from system_events
    events = db.query(SystemEvent).filter(
        SystemEvent.employee_id == employee_id,
        SystemEvent.occurred_at >= since,
        SystemEvent.event_type.in_(["went_offline", "came_online", "screen_locked", "screen_unlocked"])
    ).order_by(SystemEvent.occurred_at.asc()).all()

    offline_periods = []
    offline_start = None
    for ev in events:
        if ev.event_type in ("went_offline", "screen_locked") and offline_start is None:
            offline_start = ev.occurred_at.isoformat()
        elif ev.event_type in ("came_online", "screen_unlocked") and offline_start:
            offline_periods.append({
                "from": offline_start,
                "to": ev.occurred_at.isoformat(),
                "reason": "screen_locked" if ev.event_type == "screen_unlocked" else "offline"
            })
            offline_start = None

    total_secs = sum(l.duration_secs for l in logs)
    return {
        "productivity_score": compute_productivity_score(logs),
        "active_hours": round(total_secs / 3600, 2),
        "keyboard_mins": round(keyboard_mins, 1),
        "mouse_mins": round(mouse_mins, 1),
        "app_breakdown": [
            {"app": k, "secs": v, "hours": round(v / 3600, 2)}
            for k, v in sorted(app_secs.items(), key=lambda x: -x[1])[:12]
        ],
        "offline_periods": offline_periods,
    }
