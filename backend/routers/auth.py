from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import get_db
from models.models import Employee
from services.auth import verify_password, create_token, hash_password, get_current_user
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "employee"

@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(Employee).filter(Employee.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    emp = Employee(
        name=req.name,
        email=req.email,
        hashed_password=hash_password(req.password),
        role=req.role,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return {"id": emp.id, "email": emp.email, "role": emp.role}

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Employee).filter(Employee.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token({"sub": user.email, "role": user.role, "id": user.id})
    return {"access_token": token, "token_type": "bearer", "role": user.role}

@router.get("/me")
def me(user: Employee = Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
