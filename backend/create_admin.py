import os
from database import SessionLocal, engine
from models.models import Employee, Base
from services.auth import hash_password

def ensure_default_admin():
    """Ensures Admin@Greencall.com exists in DB with role='admin' and correct password."""
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        
        emails_to_check = ["Admin@Greencall.com", "admin@greencall.com"]
        for admin_email in emails_to_check:
            existing_admin = db.query(Employee).filter(Employee.email == admin_email).first()
            if not existing_admin:
                admin = Employee(
                    name="Admin",
                    email=admin_email,
                    hashed_password=hash_password("admin123"),
                    role="admin"
                )
                db.add(admin)
                print(f"✅ Admin account created! Email: {admin_email} | Password: admin123")
            else:
                existing_admin.hashed_password = hash_password("admin123")
                existing_admin.role = "admin"
                print(f"✅ Admin account ({admin_email}) password updated to: admin123")
        db.commit()
        db.close()
    except Exception as e:
        print(f"[Admin Seed Warning] {e}")

if __name__ == "__main__":
    ensure_default_admin()
