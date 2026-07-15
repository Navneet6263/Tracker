import requests
import os
import sys

# Force UTF-8 output for Windows
sys.stdout.reconfigure(encoding='utf-8')

SERVER = os.getenv("TRACKER_SERVER", "http://127.0.0.1:8000")

print("Linking client to your account...")
try:
    # Login as employee - change email/password as needed
    r = requests.post(f"{SERVER}/auth/login", data={
        "username": os.getenv("EMPLOYEE_EMAIL", "admin@tracker.com"),
        "password": os.getenv("EMPLOYEE_PASSWORD", "password123")
    })
    if r.status_code == 200:
        token = r.json()["access_token"]

        filepath = os.path.join("utils", "uploader.py")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        import re
        content = re.sub(r'EMPLOYEE_TOKEN = .*', f'EMPLOYEE_TOKEN = "{token}"', content)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

        print("SUCCESS: Tracker Client is now linked!")
        print("Run: python main.py")
    else:
        print(f"FAILED: Login failed with status {r.status_code}")
        print(f"Response: {r.text}")
except Exception as e:
    print(f"ERROR: {e}")
