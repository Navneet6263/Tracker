import os
from database import SessionLocal, engine
from models.models import Employee, Base
from services.auth import hash_password

Base.metadata.create_all(bind=engine)

db = SessionLocal()
existing_admin = db.query(Employee).filter(Employee.email == "admin@tracker.com").first()

if not existing_admin:
    admin = Employee(
        name="Admin",
        email="admin@tracker.com",
        hashed_password=hash_password("password123"),
        role="admin"
    )
    db.add(admin)
    db.commit()
    print("\n✅ Admin account successfully created!")
    print("Email: admin@tracker.com")
    print("Password: password123\n")
else:
    print("\n⚠️ Admin account already exists!")
    print("Email: admin@tracker.com")
    print("Password: password123\n")

db.close()
