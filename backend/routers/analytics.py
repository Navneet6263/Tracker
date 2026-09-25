from datetime import datetime, timedelta, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from database import get_db
from models.models import (
    ActivityInterval,
    AgentCommand,
    Employee,
    EmployeePresence,
    ExternalIdentity,
    ShiftAssignment,
    SystemEvent,
    WindowsIdentity,
    WorkDecline,
    WorkLogin,
    WorkSession,
)
from services.auth import get_current_user, require_admin
from services.shifts import is_within_shift, serialize_shift


router = APIRouter(prefix="/analytics", tags=["analytics"])
WORK_STATES = ("active", "passive", "meeting")
MIN_PAGE_SECONDS = 10
GAP_MERGE_SECONDS = 60
SYSTEM_PAGE_TITLES = {
    "new tab",
    "program manager",
    "shortcut",
    "system tray overflow window",
    "system tray overflow window.",
    "windows default lock screen",
}
APP_DISPLAY_NAMES = {
    "msedge": "Microsoft Edge",
    "chrome": "Google Chrome",
    "firefox": "Mozilla Firefox",
    "explorer": "File Explorer",
}


def _display_app_name(app_name: str | None) -> str:
    raw_name = (app_name or "Unknown").strip()
    return APP_DISPLAY_NAMES.get(raw_name.lower(), raw_name)


def _normalize_page_title(app_name: str | None, title: str | None) -> str | None:
    if not title:
        return None
    normalized = " ".join(title.split()).strip()
    normalized = re.sub(
        r"\s+-\s+Profile\s+\d+\s+-\s+Microsoft Edge$",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"\s+[-—]\s+(Microsoft Edge|Google Chrome|Mozilla Firefox)$",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"\s+and\s+\d+\s+more\s+pages?",
        "",
        normalized,
        flags=re.IGNORECASE,
    ).strip(" -")
    if not normalized or normalized.casefold() in SYSTEM_PAGE_TITLES:
        return None
    if (app_name or "").strip().lower() == "lockapp":
        return None
    return normalized[:255]


def _effective_state(state: str, app_name: str | None, title: str | None) -> str:
    if (app_name or "").strip().lower() == "lockapp":
        return "locked"
    if (title or "").strip().casefold() == "windows default lock screen":
        return "locked"
    return state


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _date_range(period: str):
    now = _utcnow()
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    return now - timedelta(hours=24)


import time

_SUMMARY_CACHE: dict = {"data": None, "ts": 0.0}
SUMMARY_CACHE_TTL = 3.0  # 3 seconds cache prevents parallel burst latency

_EMPLOYEE_CACHE: dict = {}
EMPLOYEE_CACHE_TTL = 3.0


@router.get("/summary")
def summary(db: Session = Depends(get_db), _: Employee = Depends(require_admin)):
    now_ts = time.time()
    if _SUMMARY_CACHE["data"] is not None and (now_ts - _SUMMARY_CACHE["ts"]) < SUMMARY_CACHE_TTL:
        return _SUMMARY_CACHE["data"]

    since = _date_range("day")
    activity_totals = (
        db.query(
            ActivityInterval.employee_id.label("employee_id"),
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
        .subquery()
    )

    # One SQL round-trip returns employee, aggregate, presence and shift data.
    # This matters when the API and SQL Server are in different data centers.
    rows = (
        db.query(
            Employee,
            activity_totals.c.work_secs,
            activity_totals.c.productive_secs,
            activity_totals.c.meeting_secs,
            EmployeePresence,
            ShiftAssignment,
        )
        .outerjoin(
            activity_totals,
            activity_totals.c.employee_id == Employee.id,
        )
        .outerjoin(EmployeePresence, EmployeePresence.employee_id == Employee.id)
        .outerjoin(
            ShiftAssignment,
            (ShiftAssignment.employee_id == Employee.id)
            & (ShiftAssignment.enabled == 1),
        )
        .filter(Employee.role == "employee", Employee.is_active == 1)
        .all()
    )

    result = []
    for employee, work_value, productive_value, meeting_value, presence, shift in rows:
        work_secs = int(work_value or 0)
        productive_secs = int(productive_value or 0)
        meeting_secs = int(meeting_value or 0)
        score = round((productive_secs / work_secs) * 100, 1) if work_secs else 0.0
        result.append(
            {
                "id": employee.id,
                "name": employee.name,
                "email": employee.email,
                "productivity_score": score,
                "active_hours": round(work_secs / 3600, 2),
                "meeting_hours": round(meeting_secs / 3600, 2),
                "last_ping": presence.last_seen.isoformat() if presence else None,
                "current_state": presence.state if presence else "offline",
                "current_app": presence.app_name if presence else None,
                "current_device": presence.device_name if presence else None,
                "identity_mode": "work_account" if employee.email.endswith("@identity.invalid") else "windows_profile",
                "shift": serialize_shift(shift),
            }
        )
    _SUMMARY_CACHE["data"] = result
    _SUMMARY_CACHE["ts"] = now_ts
    return result


@router.get("/employee/{employee_id}")
def employee_analytics(
    employee_id: int,
    period: str = "day",
    date: str | None = Query(None, description="Target date YYYY-MM-DD or today/yesterday"),
    start_date: str | None = Query(None, description="Start date YYYY-MM-DD"),
    end_date: str | None = Query(None, description="End date YYYY-MM-DD"),
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role != "admin" and user.id != employee_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    now = _utcnow()
    selected_date_str = None
    effective_period = period

    if date:
        date_clean = date.strip().lower()
        if date_clean == "today":
            target_d = now.date()
        elif date_clean == "yesterday":
            target_d = now.date() - timedelta(days=1)
        else:
            try:
                target_d = datetime.strptime(date.strip(), "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=422, detail="Invalid date format, expected YYYY-MM-DD")
        since = datetime.combine(target_d, datetime.min.time())
        until = datetime.combine(target_d, datetime.max.time())
        selected_date_str = target_d.strftime("%Y-%m-%d")
        effective_period = "day"
    elif start_date and end_date:
        try:
            s_d = datetime.strptime(start_date.strip(), "%Y-%m-%d").date()
            e_d = datetime.strptime(end_date.strip(), "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date range format, expected YYYY-MM-DD")
        since = datetime.combine(s_d, datetime.min.time())
        until = datetime.combine(e_d, datetime.max.time())
        selected_date_str = f"{start_date} to {end_date}"
        effective_period = "custom"
    elif period == "yesterday":
        target_d = now.date() - timedelta(days=1)
        since = datetime.combine(target_d, datetime.min.time())
        until = datetime.combine(target_d, datetime.max.time())
        selected_date_str = target_d.strftime("%Y-%m-%d")
        effective_period = "day"
    elif period == "week":
        since = now - timedelta(days=7)
        until = now
        effective_period = "week"
    elif period == "month":
        since = now - timedelta(days=30)
        until = now
        effective_period = "month"
    else:  # "day" / "today"
        target_d = now.date()
        since = datetime.combine(target_d, datetime.min.time())
        until = now
        selected_date_str = target_d.strftime("%Y-%m-%d")
        effective_period = "day"

    now_ts = time.time()
    cache_key = (employee_id, effective_period, selected_date_str)
    cached = _EMPLOYEE_CACHE.get(cache_key)
    if cached and (now_ts - cached[0]) < EMPLOYEE_CACHE_TTL:
        return cached[1]

    intervals = []
    shift = None
    try:
        intervals = (
            db.query(
                ActivityInterval.state,
                ActivityInterval.app_name,
                ActivityInterval.domain,
                ActivityInterval.category,
                ActivityInterval.duration_secs,
                ActivityInterval.keyboard_active_secs,
                ActivityInterval.mouse_active_secs,
                ActivityInterval.keyboard_events,
                ActivityInterval.mouse_events,
                ActivityInterval.started_at,
                ActivityInterval.ended_at,
                ActivityInterval.session_id,
                ActivityInterval.device_name,
            )
            .filter(
                ActivityInterval.employee_id == employee_id,
                ActivityInterval.started_at >= since,
                ActivityInterval.started_at <= until,
            )
            .order_by(ActivityInterval.started_at.asc())
            .all()
        )
    except Exception:
        db.rollback()

    try:
        shift = (
            db.query(ShiftAssignment)
            .filter(
                ShiftAssignment.employee_id == employee_id,
                ShiftAssignment.enabled == 1,
            )
            .first()
        )
    except Exception:
        db.rollback()

    hourly_slots = {
        h: {
            "hour": f"{h:02d}:00",
            "hour_int": h,
            "active_secs": 0,
            "meeting_secs": 0,
            "passive_secs": 0,
            "idle_secs": 0,
            "locked_secs": 0,
            "keyboard_events": 0,
            "mouse_events": 0,
            "apps": {},
        }
        for h in range(24)
    }

    daily_groups: dict[str, dict] = {}
    sessions_map: dict[str, dict] = {}

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
        effective_state = _effective_state(
            interval.state, interval.app_name, interval.domain
        )
        state_secs[effective_state] = (
            state_secs.get(effective_state, 0) + interval.duration_secs
        )
        if effective_state in WORK_STATES:
            work_secs += interval.duration_secs
            if interval.category == "productive":
                productive_secs += interval.duration_secs

        keyboard_secs += interval.keyboard_active_secs or 0
        mouse_secs += interval.mouse_active_secs or 0
        keyboard_events += interval.keyboard_events or 0
        mouse_events += interval.mouse_events or 0

        # Hourly slot grouping
        h = interval.started_at.hour
        if 0 <= h <= 23:
            slot = hourly_slots[h]
            if effective_state == "meeting":
                slot["meeting_secs"] += interval.duration_secs
            elif effective_state == "active":
                slot["active_secs"] += interval.duration_secs
            elif effective_state == "passive":
                slot["passive_secs"] += interval.duration_secs
            elif effective_state == "idle":
                slot["idle_secs"] += interval.duration_secs
            elif effective_state == "locked":
                slot["locked_secs"] += interval.duration_secs
            slot["keyboard_events"] += interval.keyboard_events or 0
            slot["mouse_events"] += interval.mouse_events or 0
            if interval.app_name and effective_state in WORK_STATES:
                app_disp = _display_app_name(interval.app_name)
                slot["apps"][app_disp] = slot["apps"].get(app_disp, 0) + interval.duration_secs

        # Daily grouping
        d_key = interval.started_at.strftime("%Y-%m-%d")
        if d_key not in daily_groups:
            daily_groups[d_key] = {
                "date": d_key,
                "day_name": interval.started_at.strftime("%A"),
                "work_secs": 0,
                "productive_secs": 0,
                "meeting_secs": 0,
                "idle_secs": 0,
                "locked_secs": 0,
                "keyboard_events": 0,
                "mouse_events": 0,
                "apps": {},
            }
        dg = daily_groups[d_key]
        if effective_state in WORK_STATES:
            dg["work_secs"] += interval.duration_secs
            if interval.category == "productive":
                dg["productive_secs"] += interval.duration_secs
            if interval.app_name:
                app_disp = _display_app_name(interval.app_name)
                dg["apps"][app_disp] = dg["apps"].get(app_disp, 0) + interval.duration_secs
        elif effective_state == "meeting":
            dg["meeting_secs"] += interval.duration_secs
        elif effective_state == "idle":
            dg["idle_secs"] += interval.duration_secs
        elif effective_state == "locked":
            dg["locked_secs"] += interval.duration_secs
        dg["keyboard_events"] += interval.keyboard_events or 0
        dg["mouse_events"] += interval.mouse_events or 0

        # Session tracking
        s_id = interval.session_id or "default_session"
        if s_id not in sessions_map:
            sessions_map[s_id] = {
                "session_id": s_id,
                "device_name": interval.device_name or "Windows Profile",
                "started_at": interval.started_at,
                "ended_at": interval.ended_at or interval.started_at,
                "work_secs": 0,
                "events_count": 0,
            }
        else:
            if interval.started_at < sessions_map[s_id]["started_at"]:
                sessions_map[s_id]["started_at"] = interval.started_at
            if interval.ended_at and interval.ended_at > sessions_map[s_id]["ended_at"]:
                sessions_map[s_id]["ended_at"] = interval.ended_at
        if effective_state in WORK_STATES:
            sessions_map[s_id]["work_secs"] += interval.duration_secs
        sessions_map[s_id]["events_count"] += (interval.keyboard_events or 0) + (interval.mouse_events or 0)

        # App & Page tracking
        if effective_state in WORK_STATES:
            app = _display_app_name(interval.app_name)
            key = (app, interval.category)
            app_secs[key] = app_secs.get(key, 0) + interval.duration_secs
            page_title = _normalize_page_title(interval.app_name, interval.domain)
            if page_title:
                page_key = (app, page_title)
                page_secs[page_key] = page_secs.get(page_key, 0) + interval.duration_secs

    events = []
    try:
        events = (
            db.query(
                SystemEvent.event_type,
                SystemEvent.occurred_at,
            )
            .filter(
                SystemEvent.employee_id == employee_id,
                SystemEvent.occurred_at >= since,
                SystemEvent.occurred_at <= until,
                SystemEvent.event_type.in_(
                    ["went_offline", "came_online", "screen_locked", "screen_unlocked"]
                ),
            )
            .order_by(SystemEvent.occurred_at.asc())
            .all()
        )
    except Exception:
        db.rollback()

    offline_periods = _pair_gap_events(events)

    hourly_timeline = []
    for h in range(24):
        slot = hourly_slots[h]
        total_slot_activity = (
            slot["active_secs"] + slot["meeting_secs"] + slot["passive_secs"] + slot["idle_secs"] + slot["locked_secs"]
        )
        top_app = max(slot["apps"].items(), key=lambda x: x[1])[0] if slot["apps"] else None
        hourly_timeline.append({
            "hour": slot["hour"],
            "hour_int": h,
            "active_mins": round(slot["active_secs"] / 60, 1),
            "meeting_mins": round(slot["meeting_secs"] / 60, 1),
            "passive_mins": round(slot["passive_secs"] / 60, 1),
            "idle_mins": round(slot["idle_secs"] / 60, 1),
            "locked_mins": round(slot["locked_secs"] / 60, 1),
            "keyboard_events": slot["keyboard_events"],
            "mouse_events": slot["mouse_events"],
            "top_app": top_app,
            "has_activity": total_slot_activity > 0,
        })

    daily_breakdown = []
    for d_key, dg in sorted(daily_groups.items(), key=lambda x: x[0], reverse=True):
        top_app = max(dg["apps"].items(), key=lambda x: x[1])[0] if dg.get("apps") else None
        w_s = dg.get("work_secs", 0)
        p_s = dg.get("productive_secs", 0)
        daily_breakdown.append({
            "date": dg.get("date", d_key),
            "day_name": dg.get("day_name", ""),
            "active_hours": round(w_s / 3600, 2),
            "meeting_mins": round(dg.get("meeting_secs", 0) / 60, 1),
            "idle_mins": round(dg.get("idle_secs", 0) / 60, 1),
            "locked_mins": round(dg.get("locked_secs", 0) / 60, 1),
            "productivity_score": round((p_s / w_s) * 100, 1) if w_s else 0.0,
            "keyboard_events": dg.get("keyboard_events", 0),
            "mouse_events": dg.get("mouse_events", 0),
            "top_app": top_app,
        })

    work_sessions_list = []
    for s_id, s_data in sorted(sessions_map.items(), key=lambda x: x[1]["started_at"], reverse=True):
        st_at = s_data.get("started_at")
        en_at = s_data.get("ended_at")
        work_sessions_list.append({
            "session_id": s_id,
            "device_name": s_data.get("device_name", "Windows Profile"),
            "started_at": st_at.isoformat() if hasattr(st_at, "isoformat") else str(st_at or ""),
            "ended_at": en_at.isoformat() if hasattr(en_at, "isoformat") else (str(en_at) if en_at else None),
            "active_hours": round(s_data.get("work_secs", 0) / 3600, 2),
            "total_events": s_data.get("events_count", 0),
        })

    total_app_secs = sum(app_secs.values()) or 1
    app_breakdown = [
        {
            "app": app,
            "category": category,
            "secs": seconds,
            "hours": round(seconds / 3600, 2),
            "percentage": round((seconds / total_app_secs) * 100, 1),
        }
        for (app, category), seconds in sorted(
            app_secs.items(), key=lambda item: -item[1]
        )[:35]
    ]

    response_data = {
        "selected_date": selected_date_str,
        "effective_period": effective_period,
        "since": since.isoformat(),
        "until": until.isoformat(),
        "productivity_score": round((productive_secs / work_secs) * 100, 1) if work_secs else 0.0,
        "active_hours": round(work_secs / 3600, 2),
        "keyboard_mins": round(keyboard_secs / 60, 1),
        "mouse_mins": round(mouse_secs / 60, 1),
        "keyboard_events": keyboard_events,
        "mouse_events": mouse_events,
        "keystrokes_per_hour": round(keyboard_events / (work_secs / 3600), 1) if work_secs else 0,
        "clicks_per_hour": round(mouse_events / (work_secs / 3600), 1) if work_secs else 0,
        "meeting_mins": round(state_secs.get("meeting", 0) / 60, 1),
        "passive_mins": round(state_secs.get("passive", 0) / 60, 1),
        "idle_mins": round(state_secs.get("idle", 0) / 60, 1),
        "locked_mins": round(state_secs.get("locked", 0) / 60, 1),
        "state_breakdown": {
            state: round(seconds / 60, 1) for state, seconds in state_secs.items()
        },
        "hourly_timeline": hourly_timeline,
        "daily_breakdown": daily_breakdown,
        "work_sessions": work_sessions_list,
        "app_breakdown": app_breakdown,
        "page_breakdown": [
            {"app": app, "title": title, "secs": seconds}
            for (app, title), seconds in sorted(
                page_secs.items(), key=lambda item: -item[1]
            )
            if seconds >= MIN_PAGE_SECONDS
        ][:50],
        "offline_periods": offline_periods,
    }
    _EMPLOYEE_CACHE[cache_key] = (now_ts, response_data)
    return response_data



@router.delete("/employee/{employee_id}")
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    admin: Employee = Depends(require_admin),
):
    if admin.id == employee_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own logged-in admin account")

    target = db.query(Employee).filter(Employee.id == employee_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Employee profile not found")
    if target.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete an administrator profile")

    try:
        # Delete dependent rows in child tables first to satisfy foreign key constraints
        db.query(SystemEvent).filter(SystemEvent.employee_id == employee_id).delete(synchronize_session=False)
        db.query(ActivityInterval).filter(ActivityInterval.employee_id == employee_id).delete(synchronize_session=False)
        db.query(EmployeePresence).filter(EmployeePresence.employee_id == employee_id).delete(synchronize_session=False)
        db.query(ShiftAssignment).filter(ShiftAssignment.employee_id == employee_id).delete(synchronize_session=False)
        db.query(WindowsIdentity).filter(WindowsIdentity.employee_id == employee_id).delete(synchronize_session=False)
        db.query(AgentCommand).filter(AgentCommand.employee_id == employee_id).delete(synchronize_session=False)
        db.query(ExternalIdentity).filter(ExternalIdentity.employee_id == employee_id).delete(synchronize_session=False)
        db.query(WorkLogin).filter(WorkLogin.employee_id == employee_id).delete(synchronize_session=False)
        db.query(WorkSession).filter(WorkSession.employee_id == employee_id).delete(synchronize_session=False)
        db.query(WorkDecline).filter(WorkDecline.employee_id == employee_id).delete(synchronize_session=False)

        deleted_name = target.name
        deleted_email = target.email
        db.delete(target)
        db.commit()

        # Invalidate in-memory caches so UI updates instantly
        _SUMMARY_CACHE["data"] = None
        _SUMMARY_CACHE["ts"] = 0.0
        for k in list(_EMPLOYEE_CACHE.keys()):
            if k[0] == employee_id:
                _EMPLOYEE_CACHE.pop(k, None)
        try:
            from services.auth import _USER_CACHE
            _USER_CACHE.pop(deleted_email, None)
        except Exception:
            pass

        return {"status": "success", "message": f"Profile for {deleted_name} permanently deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete employee: {str(e)}")


def _pair_gap_events(events: list[SystemEvent]) -> list[dict]:
    pairs = {
        "screen_locked": ("screen_unlocked", "screen_locked"),
        "went_offline": ("came_online", "offline"),
    }
    open_events: dict[str, datetime] = {}
    periods: list[dict] = []
    for event in events:
        if event.event_type in pairs:
            open_events.setdefault(event.event_type, event.occurred_at)
            continue
        for start_type, (end_type, reason) in pairs.items():
            if event.event_type == end_type and start_type in open_events:
                periods.append(
                    {
                        "from": open_events.pop(start_type),
                        "to": event.occurred_at,
                        "reason": reason,
                    }
                )
    now = _utcnow()
    for start_type, started_at in open_events.items():
        periods.append(
            {
                "from": started_at,
                "to": now,
                "reason": pairs[start_type][1],
            }
        )
    return _merge_gap_periods(periods)


def _merge_gap_periods(periods: list[dict]) -> list[dict]:
    merged: list[dict] = []
    for period in sorted(periods, key=lambda row: row["from"]):
        if period["to"] <= period["from"]:
            continue
        if not merged:
            merged.append(period.copy())
            continue
        previous = merged[-1]
        gap_seconds = (period["from"] - previous["to"]).total_seconds()
        overlaps = gap_seconds <= 0
        same_reason_nearby = (
            period["reason"] == previous["reason"]
            and gap_seconds <= GAP_MERGE_SECONDS
        )
        if overlaps or same_reason_nearby:
            previous["to"] = max(previous["to"], period["to"])
            if period["reason"] == "screen_locked":
                previous["reason"] = "screen_locked"
        else:
            merged.append(period.copy())

    return [
        {
            "from": period["from"].isoformat(),
            "to": period["to"].isoformat(),
            "reason": period["reason"],
        }
        for period in merged
        if (period["to"] - period["from"]).total_seconds() >= 10
    ]
