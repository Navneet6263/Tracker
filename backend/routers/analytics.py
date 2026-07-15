from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from database import get_db
from models.models import Employee, ActivityLog, SystemEvent
from services.auth import require_admin, get_current_user
from services.productivity import compute_productivity_score

router = APIRouter(prefix="/analytics", tags=["analytics"])

def _date_range(period: str):
    now = datetime.utcnow()
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    return now - timedelta(days=1)

@router.get("/summary")
def summary(db: Session = Depends(get_db), _=Depends(require_admin)):
    employees = db.query(Employee).filter(Employee.role == "employee").all()
    result = []
    for emp in employees:
        logs = db.query(ActivityLog).filter(
            ActivityLog.employee_id == emp.id,
            ActivityLog.logged_at >= _date_range("day")
        ).all()
        score = compute_productivity_score(logs)
        active_secs = sum(l.duration_secs for l in logs)
        
        last_log = db.query(ActivityLog).filter(ActivityLog.employee_id == emp.id).order_by(ActivityLog.logged_at.desc()).first()
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
    ).all()

    app_breakdown = {}
    for l in logs:
        app_breakdown[l.window_title or "Unknown"] = app_breakdown.get(l.window_title or "Unknown", 0) + l.duration_secs

    return {
        "productivity_score": compute_productivity_score(logs),
        "active_hours": round(sum(l.duration_secs for l in logs) / 3600, 2),
        "app_breakdown": [{"app": k, "secs": v} for k, v in sorted(app_breakdown.items(), key=lambda x: -x[1])[:10]],
    }
