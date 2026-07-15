import requests
import os

print("Linking client to your account...")
try:
    r = requests.post("http://127.0.0.1:8000/auth/login", data={"username": "admin@tracker.com", "password": "password123"})
    if r.status_code == 200:
        token = r.json()["access_token"]
        
        filepath = os.path.join("utils", "uploader.py")
        with open(filepath, "r") as f:
            content = f.read()

        import re
        content = re.sub(r'EMPLOYEE_TOKEN = .*', f'EMPLOYEE_TOKEN = "{token}"', content)

        with open(filepath, "w") as f:
            f.write(content)

        print("✅ Tracker Client is now successfully linked!")
        print("👉 You can now run: python main.py")
    else:
        print("❌ Login failed. Is your backend server running?")
except Exception as e:
    print(f"❌ Error connecting to backend: {e}")
