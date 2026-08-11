# Sentinel Workforce Activity Tracker

Privacy-first Windows activity tracking for pre-created employees. The current
design stores application, input-activity, VoIP, idle, lock and shift metadata.
It does **not** capture screenshots, typed text, mouse coordinates or call audio.

## Architecture

- `desktop_client/`: one agent process per Windows user profile, local offline queue,
  app/input/lock/VoIP detection and a watchdog.
- `backend/`: FastAPI, SQL Server, JWT authentication, activity batching, presence,
  analytics and durable agent commands.
- `dashboard/`: admin-only React dashboard with password change and employee reports.

## Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Fill all production values in .env
uvicorn main:app --host 0.0.0.0 --port 8000
```

The API intentionally has no public registration endpoint. Create accounts from
the trusted server shell:

```powershell
python manage_users.py create-admin --name "Admin" --email "admin@company.com"

python manage_users.py create-employee `
  --name "Rahul Sharma" `
  --email "rahul@company.com" `
  --hostname "PC-101" `
  --username "rahul" `
  --shift-name "Day" `
  --shift-start "09:00" `
  --shift-end "18:00"

python manage_users.py create-employee `
  --name "Amit Kumar" `
  --email "amit@company.com" `
  --hostname "PC-101" `
  --username "amit" `
  --shift-name "Night" `
  --shift-start "19:00" `
  --shift-end "05:00"

# Bind an employee that already exists in the database to a Windows profile:
python manage_users.py assign-profile `
  --email "rahul@company.com" `
  --hostname "PC-101" `
  --username "rahul"
```

The agent fetches the pre-created employee using hostname + Windows username. On
the first successful match it stores that profile's Windows SID automatically.
Admin Windows profiles are not mapped and therefore do not start employee tracking.

If an employee is created without `--shift-name`, Sentinel learns the shift from
metadata during the first two qualified working days. At least 15 minutes of work
per day and 65% agreement are required. It then assigns `Day (Auto)` (09:00-18:00)
or `Night (Auto)` (19:00-05:00). Manual shift assignments are never overwritten.
The API enforces the assigned shift as well as returning it to the agent on each
heartbeat, so off-shift activity is excluded even while an older agent is running.

Important API routes:

- `POST /auth/login`: admin dashboard login
- `POST /auth/device-login`: fetch a pre-created Windows profile
- `POST /auth/change-password`: authenticated password change
- `POST /activity/batch`: idempotent metadata activity batches
- `POST /events`: lock, unlock, session and connectivity events
- `POST /events/ping`: current presence plus queued commands
- `GET /analytics/summary`: optimized workforce summary
- `GET /analytics/employee/{id}`: employee activity report
- `WS /ws/admin`: authenticated admin live events (token is the first socket message)

## Dashboard

```powershell
cd dashboard
npm install
npm run build
npm run dev
```

Set `VITE_API_URL` to the API URL. The dashboard requires an authenticated admin;
an employee token cannot open it.

## Windows agent and installer

Build both executables:

```powershell
cd desktop_client
pip install -r requirements.txt
pyinstaller --clean EmployeeTracker.spec
pyinstaller --clean TrackerWatchdog.spec
```

Compile `setup_script.iss` with Inno Setup. Installation is per-machine and requires
Windows administrator approval. The organization API is built into the agent and is
not shown in setup. It installs under `Program Files` and starts the tracker for each
Windows user through HKLM Run. If a profile has not been assigned yet, the agent keeps
retrying without collecting activity. Diagnostics are written to
`%AppData%\SentinelTracker\tracker.log`.

Standard users need administrator credentials to uninstall or modify files under
`Program Files`. A local/domain administrator always retains control of the computer.

## Activity rules

- Keyboard and mouse content is never captured; only event counts and active seconds.
- The active app and page/window title are stored with time; no screenshot is taken.
- Active input, verified passive activity and detected VoIP calls count as work.
- Idle, locked and off-shift time do not count as verified work.
- Meet, Teams, Zoom, Webex and Slack Huddles are detected through application/window
  metadata and Windows audio sessions. Audio is never recorded.
- Activity is aggregated locally into 30-second intervals and uploaded in batches.
- Presence uses a 30-second upsert instead of writing a history row every few seconds.
- Automatic shifts are learned once, remain stable, and can be replaced by an admin
  assignment in the database when an employee changes schedules.

## Delivery status

This repository can be used for a controlled pilot after configuration and testing.
Before a 300-device rollout, add code signing, managed GPO/Intune deployment, formal DB
migrations, monitoring/backups, load testing, an auto-update channel and organization
privacy/retention approval.
