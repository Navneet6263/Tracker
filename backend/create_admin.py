"""One-time admin bootstrap utility.

Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD, then run this file manually.
The API never creates or resets an administrator during startup.
"""

import os

from database import Base, SessionLocal, engine
from models.models import Employee
from services.auth import hash_password


def create_admin():
    email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    name = os.getenv("ADMIN_NAME", "Administrator").strip()
    password = os.getenv("ADMIN_PASSWORD", "")
    if not email or len(password) < 12:
        raise RuntimeError("ADMIN_EMAIL and ADMIN_PASSWORD (minimum 12 characters) are required")

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Employee).filter(Employee.email == email).first():
            raise RuntimeError("An account with this email already exists")
        db.add(
            Employee(
                name=name,
                email=email,
                hashed_password=hash_password(password),
                role="admin",
                is_active=True,
            )
        )
        db.commit()
        print(f"Admin created: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    create_admin()
