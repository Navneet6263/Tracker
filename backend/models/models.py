from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


def utcnow_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="employee")  # admin | employee
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow_naive)

    events = relationship("SystemEvent", back_populates="employee")
    activity_intervals = relationship("ActivityInterval", back_populates="employee")

class SystemEvent(Base):
    __tablename__ = "system_events"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    event_type = Column(String(100), nullable=False)
    payload = Column(Text)
    occurred_at = Column(DateTime, nullable=False)
    employee = relationship("Employee", back_populates="events")

class WindowsIdentity(Base):
    """Maps a pre-created employee to one Windows user profile."""

    __tablename__ = "windows_identities"
    __table_args__ = (UniqueConstraint("hostname", "username", name="uq_windows_host_user"),)

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    windows_sid = Column(String(255), unique=True, nullable=True, index=True)
    hostname = Column(String(255), nullable=False, index=True)
    username = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow_naive, nullable=False)


class ShiftAssignment(Base):
    """Server-managed shift configuration; overnight shifts are supported."""

    __tablename__ = "shift_assignments"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), unique=True, nullable=False, index=True)
    shift_name = Column(String(100), nullable=False)
    start_local = Column(String(5), nullable=False)  # HH:MM
    end_local = Column(String(5), nullable=False)  # HH:MM
    timezone_name = Column(String(100), default="Asia/Kolkata", nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)


class ActivityInterval(Base):
    """Aggregated metadata-only activity; no key content or call audio is stored."""

    __tablename__ = "activity_intervals"

    id = Column(Integer, primary_key=True, index=True)
    client_event_id = Column(String(36), unique=True, nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    session_id = Column(String(100), nullable=False, index=True)
    device_name = Column(String(255), nullable=False)
    windows_user = Column(String(255), nullable=False)
    state = Column(String(30), nullable=False, index=True)
    app_name = Column(String(255), nullable=True)
    domain = Column(String(255), nullable=True)
    category = Column(String(50), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False, index=True)
    ended_at = Column(DateTime, nullable=False, index=True)
    duration_secs = Column(Integer, nullable=False, default=0)
    keyboard_events = Column(Integer, nullable=False, default=0)
    mouse_events = Column(Integer, nullable=False, default=0)
    keyboard_active_secs = Column(Integer, nullable=False, default=0)
    mouse_active_secs = Column(Integer, nullable=False, default=0)
    employee = relationship("Employee", back_populates="activity_intervals")


class EmployeePresence(Base):
    """One current presence row per employee instead of millions of ping events."""

    __tablename__ = "employee_presence"

    employee_id = Column(Integer, ForeignKey("employees.id"), primary_key=True)
    last_seen = Column(DateTime, nullable=False, default=utcnow_naive, index=True)
    state = Column(String(30), nullable=False, default="offline")
    app_name = Column(String(255), nullable=True)
    device_name = Column(String(255), nullable=True)
    windows_user = Column(String(255), nullable=True)


class AgentCommand(Base):
    """Durable admin-to-agent commands that survive API restarts."""

    __tablename__ = "agent_commands"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    command = Column(String(50), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)
    delivered_at = Column(DateTime, nullable=True)
