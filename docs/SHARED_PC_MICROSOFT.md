# Shared-PC Microsoft work sessions (v3 pilot)

## What changes

An administrator installs the shared-PC agent and enrolls each Windows profile
once. The employee clicks **Start work with Microsoft**, authenticates with their
own company account in the browser, and confirms their displayed name in Tracker.
The **Admin Request** confirmation says "Aap [name] hain?" and explains the activity
sent to the company admin. **OK, start work** starts tracking; **Account badlo**
opens a fresh Microsoft sign-in. **Reason admin ko bhejo** submits a reason
(1-1000 characters) with the verified employee, computer and server timestamp,
without starting work. The dashboard's **Admin requests: work not started** section
shows the latest 100 submissions and refreshes every 30 seconds. These are historical
sign-in decisions, not claims that an employee is currently refusing or offline.
Closing/Escape leaves tracking stopped and sends no reason. Failed submissions are
reported visibly, with the reason preserved in the retry dialog; internet and a
valid sign-in are required. A submitted decline cannot later be turned into a work
session: start a fresh login if the employee changes their mind.
This name comes from fresh verified
sign-in, not a saved previous employee or text read from the Teams screen.
Before handing over the computer they click **End work / Change employee**.
Teams itself is not modified. Existing Teams login/logout is not observed.

Identity is the verified Microsoft tenant + object ID, never a display name,
Windows username, or email scraped from a page. Moving from PC-1 to PC-8 keeps
the same employee ID. Two people named Sonu get distinct reports. One active
session per employee and per enrolled device is enforced when sessions start.
Old agents remain compatible but cannot perform this new work-account flow.

Tracking only starts after employee confirmation. Lock/switch detection, a sampling
gap over 15 seconds (e.g. sleep), restart, 10 minutes without input, or the 16-hour
session limit requires a new sign-in. Long calls without input can hit that idle
limit. Minimize the Tracker window while working; its close button ends work.
Ending Tracker work does **not** sign out of Teams or clear the browser account.
Employees must also sign out of their business apps before handover. If someone
hands over an unlocked PC without ending work, Tracker cannot know a different
human is now seated; the handover procedure is essential.

The first Microsoft login creates a new work-account employee. Existing
Windows-profile reports remain separate and untouched: their historical data
cannot safely be assigned to a human by guessing names. No automatic historical
merge is performed. Auto-learned fixed shifts are skipped for Microsoft employees;
explicit admin shift assignments still apply.

## Microsoft administrator setup (required before use)

In Microsoft Entra, register a **single-tenant** application for the customer's
organization. Configure a **Web** redirect URI exactly:

`https://tracker.greencall.online/api/work/callback/microsoft`

The server uses authorization-code OIDC with PKCE, nonce, forced login, and
signature/audience/issuer/tenant checks. Only `openid profile email` scopes are
requested, not mail, Teams conversations, browser cookies, or passwords.
Create a client secret and store its **value** only in the backend's server-side
environment. Never send that secret in chat, commit it, or embed it in the EXE.
Restrict the enterprise application's assigned users/groups to participating staff;
follow tenant consent and MFA policies. Track the secret expiry for rotation.

Add these entries to `/home/ubuntu/tracker-app/backend/.env` without replacing
existing database settings or `SECRET_KEY`:

```dotenv
WORK_PUBLIC_API_URL=https://tracker.greencall.online/api
WORK_MICROSOFT_ISSUER=https://login.microsoftonline.com/REAL_TENANT_UUID/v2.0
WORK_MICROSOFT_CLIENT_ID=REAL_APPLICATION_CLIENT_UUID
WORK_MICROSOFT_CLIENT_SECRET=SECRET_VALUE_STORED_ON_SERVER_ONLY
WORK_ENROLLMENT_KEY=GENERATE_A_RANDOM_VALUE_AT_LEAST_32_CHARACTERS
```

Use a password manager or Python's `secrets.token_urlsafe(48)` for the enrollment
key. The enrollment key is for the installing administrator, not employee sign-in.
Once enrolled, each profile uses its own random device credential. Rotate the
enrollment key after rollout if desired. Revocation is admin-authenticated
`POST /work/devices/{device_id}/disable`; disabling also ends device sessions.
Protect `%AppData%\SentinelTracker\shared.db`: it contains device credentials and
queued metadata. Anyone controlling that same Windows account can access its
files; this is not protection against a malicious local administrator.

Official protocol/setup references:

- [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Register an application](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)

## Backend and dashboard rollout

1. Back up **TrackerDB** using your existing backup process. Do not reset it.
2. Deploy the reviewed changes to `/home/ubuntu/tracker-app` using your normal Git
   workflow. Install backend requirements using `backend/venv/bin/python -m pip`,
   not the system Python. Configure the Microsoft entries above.
3. Restart the existing `tracker-backend` PM2 process with updated environment.
   Startup creates five new tables (`tracker_devices`, `external_identities`,
   `work_sessions`, `work_logins`, `work_declines`). It does not drop tables or clear existing data.
   The DB account needs CREATE TABLE permission in TrackerDB. Production session
   locking targets SQL Server; SQLite tests do not prove multi-worker SQL Server
   concurrency. Verify that separately during the pilot.
4. In `dashboard`, run `npm ci` and `npm run build` **on AWS Linux**. Restart the
   existing `tracker-frontend` process. Production entry remains
   `.output/server/index.mjs`; do not copy the Windows build to Linux.
5. Check API readiness, dashboard admin login, and the pilot checklist below.
   Microsoft callback must be reachable over HTTPS through the same `/api` proxy.
   Allow POST form callbacks; do not enable request-body logging on that route.

No live deployment is performed by building this repository. Do not run
`reset_tracker.py` for this upgrade. Other databases are not involved.

## Build and install Windows pilot

From an activated desktop build environment with `requirements.txt` installed:

```powershell
cd desktop_client
python -m PyInstaller packaging/shared.spec --distpath dist/shared --workpath build/shared --noconfirm
python -m PyInstaller packaging/watchdog.spec --distpath dist/shared --workpath build/shared-watchdog --noconfirm
& 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' setup_shared.iss
```

Artifact: `desktop_client/Output/EmployeeTrackerSharedSetup.exe`.
The legacy `EmployeeTrackerSetup.exe` artifact is not overwritten. The shared
installer uses the existing application ID/install folder so it upgrades an
installed copy, rather than running two trackers. First end existing work and
stop the old agent through the dashboard; confirm both old processes have exited
before installing. Installation requires Windows administrator approval. Run the
agent under the actual shared Windows account, not the administrator's account,
and enter the enrollment key once under **Setup / Reconnect**. Installer autostart
also applies at future Windows sign-ins. A standalone EXE alone does not register
autostart or include the watchdog; distribute the setup installer.

The API defaults to `https://tracker.greencall.online/api`. A different deployment
can set the agent's `TRACKER_SERVER` environment variable to its HTTPS API URL.
The v3 agent uses a separate `shared.db`; it never assigns pending legacy
`local.db` records to the newly signed-in person. Drain the old agent queue before
upgrading. No browser/Microsoft tokens or client secret are stored by the agent.

## Pilot acceptance checklist (must pass before client rollout)

- Real employee Microsoft sign-in and wrong-account cancellation; MFA if required.
- Person A on PC-1: app usage appears under A and history lists PC-1.
- A ends; person B uses same Windows login on PC-1: only B receives new data.
- A logs in on PC-8: same employee record, PC-8 in history; old session rejects ping.
- Two accounts with the same display name remain separate.
- Disconnect internet during an existing session, change employee after reconnect,
  and confirm old uploads stay under their original employee, not the new one.
- Lock, sleep, reboot, long idle, sign-in cancellation, and admin stop behavior.
- Verify one running main agent and watchdog after upgrade and Windows sign-in.
- Old admin reports still load; no records or other databases were cleared.

Offline start/login requires internet. Already-running sessions can queue local
activity until their limit. Records outside the server's original session window
are preserved locally in `shared.db`'s `rejected` table for admin review, not moved
to another person. Overlapping last intervals after a remote PC switch may be
quarantined rather than credited. Keep clocks synchronized. Existing API rules
accept only the last 14 days of activity; older offline records are quarantined.

Automated tests use isolated SQLite databases, mocked provider exchange, and
locally signed test tokens. They are **not** a successful real-tenant sign-in,
SQL Server load test, or multi-PC installer pilot. The installer is unsigned;
complete code signing and managed rollout requirements before broad distribution.
