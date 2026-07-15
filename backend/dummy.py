import requests
import re
import os

print("Creating dummy employee...")
try:
    requests.post('http://127.0.0.1:8000/auth/register', json={'name': 'Rahul Sharma', 'email': 'rahul@company.com', 'password': 'password123', 'role': 'employee'})
except Exception as e:
    pass

r = requests.post('http://127.0.0.1:8000/auth/login', data={'username': 'rahul@company.com', 'password': 'password123'})
token = r.json().get('access_token', '')

if token:
    path = os.path.join('..', 'desktop_client', 'utils', 'uploader.py')
    with open(path, 'r') as f:
        content = f.read()

    content = re.sub(r'EMPLOYEE_TOKEN = .*', f'EMPLOYEE_TOKEN = "{token}"', content)

    with open(path, 'w') as f:
        f.write(content)
    print("Success!")
else:
    print("Failed to get token.")
