from sqlalchemy import Column, Integer, String, DateTime, Float, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="employee")  # admin | employee
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    screenshots = relationship("Screenshot", back_populates="employee")
    events = relationship("SystemEvent", back_populates="employee")
    activity_logs = relationship("ActivityLog", back_populates="employee")

class Screenshot(Base):
    __tablename__ = "screenshots"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    s3_url = Column(String(1024), nullable=False)
    window_title = Column(String(512))
    captured_at = Column(DateTime, nullable=False)
    employee = relationship("Employee", back_populates="screenshots")

class SystemEvent(Base):
    __tablename__ = "system_events"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    event_type = Column(String(100), nullable=False)
    payload = Column(Text)
    occurred_at = Column(DateTime, nullable=False)
    employee = relationship("Employee", back_populates="events")

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    window_title = Column(String(512))
    category = Column(String(50))  # productive | unproductive | neutral
    duration_secs = Column(Integer, default=0)
    
    keyboard_active = Column(Boolean, default=False)
    mouse_active = Column(Boolean, default=False)
    win_r_count = Column(Integer, default=0)
    
    logged_at = Column(DateTime, default=datetime.utcnow)
    employee = relationship("Employee", back_populates="activity_logs")
