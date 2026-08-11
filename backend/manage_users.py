"""CLI-only user provisioning. The public API intentionally has no register endpoint."""

import argparse
import getpass
import secrets

from database import Base, SessionLocal, engine
from models.models import Employee, ShiftAssignment, WindowsIdentity
from services.auth import hash_password


def create_admin(args, db):
    password = getpass.getpass("New admin password (12-72 characters): ")
    if len(password) < 12 or len(password) > 72:
        raise ValueError("Password must be 12-72 characters")
    email = args.email.strip().lower()
    if db.query(Employee).filter(Employee.email == email).first():
        raise ValueError("Email already exists")
    employee = Employee(
        name=args.name.strip(),
        email=email,
        hashed_password=hash_password(password),
        role="admin",
        is_active=True,
    )
    db.add(employee)
    db.commit()
    print(f"Created admin #{employee.id}: {employee.email}")


def create_employee(args, db):
    email = args.email.strip().lower()
    hostname = args.hostname.strip().lower()
    username = args.username.strip().lower()
    if db.query(Employee).filter(Employee.email == email).first():
        raise ValueError("Email already exists")
    employee = Employee(
        name=args.name.strip(),
        email=email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        role="employee",
        is_active=True,
    )
    db.add(employee)
    db.flush()
    db.add(
        WindowsIdentity(
            employee_id=employee.id,
            windows_sid=args.sid.strip() if args.sid else None,
            hostname=hostname,
            username=username,
        )
    )
    if args.shift_name:
        db.add(
            ShiftAssignment(
                employee_id=employee.id,
                shift_name=args.shift_name,
                start_local=args.shift_start,
                end_local=args.shift_end,
                timezone_name=args.timezone,
                enabled=True,
            )
        )
    db.commit()
    print(f"Created employee #{employee.id}: {employee.name} ({hostname}\\{username})")


def assign_profile(args, db):
    email = args.email.strip().lower()
    hostname = args.hostname.strip().lower()
    username = args.username.strip().lower()
    employee = db.query(Employee).filter(Employee.email == email).first()
    if not employee or employee.role != "employee":
        raise ValueError("Active employee email was not found")
    if not employee.is_active:
        raise ValueError("Employee is inactive")

    existing = db.query(WindowsIdentity).filter(
        WindowsIdentity.hostname == hostname,
        WindowsIdentity.username == username,
    ).first()
    if existing:
        if existing.employee_id != employee.id:
            raise ValueError("Windows profile is already assigned to another employee")
        print(f"Profile already assigned: {hostname}\\{username}")
        return

    db.add(
        WindowsIdentity(
            employee_id=employee.id,
            windows_sid=args.sid.strip() if args.sid else None,
            hostname=hostname,
            username=username,
        )
    )
    db.commit()
    print(f"Assigned {hostname}\\{username} to employee #{employee.id}: {employee.email}")


def build_parser():
    parser = argparse.ArgumentParser(description="Provision Sentinel users directly in the DB")
    commands = parser.add_subparsers(dest="command", required=True)

    admin = commands.add_parser("create-admin")
    admin.add_argument("--name", required=True)
    admin.add_argument("--email", required=True)
    admin.set_defaults(handler=create_admin)

    employee = commands.add_parser("create-employee")
    employee.add_argument("--name", required=True)
    employee.add_argument("--email", required=True)
    employee.add_argument("--hostname", required=True)
    employee.add_argument("--username", required=True)
    employee.add_argument("--sid")
    employee.add_argument("--shift-name")
    employee.add_argument("--shift-start", default="09:00")
    employee.add_argument("--shift-end", default="18:00")
    employee.add_argument("--timezone", default="Asia/Kolkata")
    employee.set_defaults(handler=create_employee)

    profile = commands.add_parser("assign-profile")
    profile.add_argument("--email", required=True)
    profile.add_argument("--hostname", required=True)
    profile.add_argument("--username", required=True)
    profile.add_argument("--sid")
    profile.set_defaults(handler=assign_profile)
    return parser


def main():
    args = build_parser().parse_args()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        args.handler(args, db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
