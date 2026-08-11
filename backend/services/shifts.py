import logging
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from models.models import ActivityInterval, ShiftAssignment


LOGGER = logging.getLogger("sentinel.shifts")
TIMEZONE_NAME = "Asia/Kolkata"


def _timezone_for_name(name: str):
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        if name == TIMEZONE_NAME:
            return timezone(timedelta(hours=5, minutes=30), name)
        raise


TIMEZONE = _timezone_for_name(TIMEZONE_NAME)
LOOKBACK_DAYS = 14
MIN_OBSERVED_DAYS = 2
MIN_SECONDS_PER_DAY = 15 * 60
MIN_CONFIDENCE = 0.65
CHECK_INTERVAL = timedelta(minutes=15)
AUTO_SUFFIX = " (Auto)"
WORK_STATES = ("active", "passive", "meeting")
SHIFT_DEFINITIONS = {
    "Day": {"start": "09:00", "end": "18:00"},
    "Night": {"start": "19:00", "end": "05:00"},
}
_last_check: dict[int, datetime] = {}


def _parse_time(value: str) -> time:
    hour, minute = value.split(":", 1)
    return time(int(hour), int(minute))


def _as_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _shift_for_time(local_time: time) -> str | None:
    for name, definition in SHIFT_DEFINITIONS.items():
        start = _parse_time(definition["start"])
        end = _parse_time(definition["end"])
        if start <= end and start <= local_time < end:
            return name
        if start > end and (local_time >= start or local_time < end):
            return name
    return None


def _work_date(local_datetime: datetime, shift_name: str) -> date:
    if shift_name == "Night" and local_datetime.time() < _parse_time("05:00"):
        return (local_datetime - timedelta(days=1)).date()
    return local_datetime.date()


def infer_shift_assignment(
    db: Session,
    employee_id: int,
    *,
    force: bool = False,
    now: datetime | None = None,
) -> ShiftAssignment | None:
    now_utc = _as_utc_naive(now or datetime.now(timezone.utc))
    existing = (
        db.query(ShiftAssignment)
        .filter(ShiftAssignment.employee_id == employee_id)
        .first()
    )
    # Once a shift exists, keep it stable. An admin-managed value (including a
    # disabled assignment) is authoritative and automatic shifts do not churn.
    if existing:
        return existing
    if not force:
        previous_check = _last_check.get(employee_id)
        if previous_check and now_utc - previous_check < CHECK_INTERVAL:
            return existing
        _last_check[employee_id] = now_utc

    intervals = (
        db.query(ActivityInterval)
        .filter(
            ActivityInterval.employee_id == employee_id,
            ActivityInterval.state.in_(WORK_STATES),
            ActivityInterval.started_at >= now_utc - timedelta(days=LOOKBACK_DAYS),
        )
        .all()
    )
    scores_by_day: dict[date, dict[str, int]] = defaultdict(
        lambda: defaultdict(int)
    )
    for interval in intervals:
        local_started = interval.started_at.replace(tzinfo=timezone.utc).astimezone(
            TIMEZONE
        )
        shift_name = _shift_for_time(local_started.time())
        if shift_name is None:
            continue
        observed_date = _work_date(local_started, shift_name)
        scores_by_day[observed_date][shift_name] += interval.duration_secs

    qualified_days = {
        observed_date: scores
        for observed_date, scores in scores_by_day.items()
        if sum(scores.values()) >= MIN_SECONDS_PER_DAY
    }
    if len(qualified_days) < MIN_OBSERVED_DAYS:
        return existing

    totals = {
        shift_name: sum(day_scores.get(shift_name, 0) for day_scores in qualified_days.values())
        for shift_name in SHIFT_DEFINITIONS
    }
    total_scored = sum(totals.values())
    if not total_scored:
        return existing
    winner = max(totals, key=totals.get)
    confidence = totals[winner] / total_scored
    if confidence < MIN_CONFIDENCE:
        LOGGER.info(
            "Shift remains unassigned: employee_id=%s confidence=%.2f scores=%s",
            employee_id,
            confidence,
            totals,
        )
        return existing

    definition = SHIFT_DEFINITIONS[winner]
    if existing is None:
        existing = ShiftAssignment(employee_id=employee_id)
        db.add(existing)
    existing.shift_name = f"{winner}{AUTO_SUFFIX}"
    existing.start_local = definition["start"]
    existing.end_local = definition["end"]
    existing.timezone_name = TIMEZONE_NAME
    existing.enabled = True
    db.commit()
    LOGGER.info(
        "Auto-assigned shift: employee_id=%s shift=%s confidence=%.2f observed_days=%s",
        employee_id,
        winner,
        confidence,
        len(qualified_days),
    )
    return existing


def is_within_shift(timestamp: datetime, shift: ShiftAssignment | None) -> bool:
    """Return whether a UTC activity timestamp belongs to the assigned local shift."""
    if shift is None or not shift.enabled:
        return True
    try:
        local_time = _as_utc_naive(timestamp).replace(tzinfo=timezone.utc).astimezone(
            _timezone_for_name(shift.timezone_name)
        ).time()
        start = _parse_time(shift.start_local)
        end = _parse_time(shift.end_local)
        if start <= end:
            return start <= local_time < end
        return local_time >= start or local_time < end
    except (ValueError, ZoneInfoNotFoundError):
        LOGGER.exception("Invalid shift configuration: shift_id=%s", shift.id)
        return True


def serialize_shift(shift: ShiftAssignment | None) -> dict | None:
    if shift is None:
        return None
    return {
        "name": shift.shift_name,
        "start": shift.start_local,
        "end": shift.end_local,
        "timezone": shift.timezone_name,
        "automatic": shift.shift_name.endswith(AUTO_SUFFIX),
    }
