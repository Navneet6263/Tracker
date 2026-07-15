# Employee Monitoring Tool

## Project Structure
```
Tracker/
├── desktop_client/       # Python Windows client (.exe)
├── backend/              # FastAPI server
└── dashboard/            # React admin + employee portal
```

---

## 1. Desktop Client Setup

```bash
cd desktop_client
pip install -r requirements.txt

# Set env vars before running
set TRACKER_SERVER=http://your-server:8000
set TRACKER_TOKEN=<employee_jwt_token>

python main.py
```

**Build .exe:**
```bash
pyinstaller --onefile --windowed --name=tracker main.py
# Then compile installer.iss with Inno Setup
```

---

## 2. Backend Setup

```bash
cd backend
pip install -r requirements.txt

# Copy and fill in env
copy .env.example .env

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Requirements:**
- MS SQL Server running with a `TrackerDB` database
- AWS S3 bucket named `tracker-screenshots`
- Redis on `localhost:6379`

**Create first admin:**
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@company.com","password":"secret","role":"admin"}'
```

---

## 3. Dashboard Setup

```bash
cd dashboard
npm install
npm start        # dev
npm run build    # production
```

Set `REACT_APP_API_URL=http://your-server:8000` in a `.env` file.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login → JWT |
| GET | `/auth/me` | Current user |
| POST | `/screenshots/upload` | Upload screenshot |
| GET | `/screenshots/{id}` | List screenshots |
| POST | `/events` | Log system event |
| GET | `/events/{id}` | Get events |
| GET | `/analytics/summary` | Admin summary |
| GET | `/analytics/employee/{id}` | Per-employee stats |
| WS | `/ws/{employee_id}` | Live WebSocket |

---

## Phases

| Phase | Status | Features |
|-------|--------|---------|
| 1 | ✅ | Client exe, FastAPI, basic dashboard |
| 2 | ✅ | Lock/sleep detection, offline sync, WebSockets |
| 3 | ✅ | Recharts analytics, app breakdown |
| 4 | ✅ | Screenshot encryption, role-based access, FAANG UI |
