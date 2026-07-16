import requests
import re
import os

BASE = "http://localhost:8000"

# Login as RAHUL (employee) - not admin
r = requests.post(f"{BASE}/auth/login", data={"username": "rahul@company.com", "password": "password123"})
print("Rahul login:", r.status_code)
if r.status_code != 200:
    print(r.text)
    exit()

token = r.json()["access_token"]
print("Token OK")

# Write token to uploader.py
filepath = os.path.join("utils", "uploader.py")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

content = re.sub(r'EMPLOYEE_TOKEN = .*', f'EMPLOYEE_TOKEN = "{token}"', content)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("SUCCESS: Desktop client linked to Rahul Sharma account")
print("Now run: python main.py")
