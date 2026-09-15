"""One-time admin bootstrap utility.

Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD, then run this file manually.
The API never creates or resets an administrator during startup.
"""

import os

from database import Base, SessionLocal, engine
from models.models import Employee
from services.auth import hash_password


def create_admin():
    email = (os.getenv("ADMIN_EMAIL") or "admin@greencall.com").strip().lower()
    name = (os.getenv("ADMIN_NAME") or "Administrator").strip()
    password = os.getenv("ADMIN_PASSWORD") or "admin123"

    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        print(f"[DB Warning] {exc}")

    from sqlalchemy import func
    db = SessionLocal()
    try:
        admin = db.query(Employee).filter(func.lower(Employee.email) == email).first()
        if not admin:
            admin = Employee(
                name=name,
                email=email,
                hashed_password=hash_password(password),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print(f"Admin account created successfully: {email} / {password}")
        else:
            admin.hashed_password = hash_password(password)
            admin.role = "admin"
            admin.is_active = True
            db.commit()
            print(f"Admin account updated & password reset: {email} / {password}")
    finally:
        db.close()


if __name__ == "__main__":
    create_admin()
