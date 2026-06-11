# Keystone Task Command Center

A standalone task command center for Keystone task work.

This app is separate from the finance app. It runs locally, stores data in a
SQLite file under `data/tasks.sqlite`, and imports tasks from a downloaded
`.xlsx` export of the task Google Sheet.

## Run

Use Node 24 or newer.

```powershell
node server.mjs
```

Then open:

```text
http://localhost:4242
```

## Website Hosting

The app is now ready to run as a small private website. Use a host that can run
a long-lived Node 24 process with a persistent disk/volume for SQLite.

Set these environment variables on the host:

```text
APP_USERNAME=keystone
APP_PASSWORD=pick-a-private-password
DB_PATH=/data/tasks.sqlite
PORT=4242
```

Important: `DB_PATH` must point to persistent storage. If the host resets that
folder on deploy, your tasks will disappear from the website copy.

There is also a `Dockerfile` for hosts that deploy containers. Mount a
persistent volume at `/data`, set the environment variables above, and expose
port `4242`.

To move your current local tasks to the website, copy these files into the
hosted persistent volume:

```text
data/tasks.sqlite
data/tasks.sqlite-shm
data/tasks.sqlite-wal
```

Stop the local app before copying the database files so the copy is clean.

## Checks

```powershell
node scripts/check.mjs
node scripts/build.mjs
```

## Ring Tommy And Done Notifications

When someone uses Ring Tommy, or when a task is marked done, the app can email
Tommy at `tommy@keystone.studio` if a sender is configured. Text messages are
also supported if Twilio is configured.

Create `.env.local` in this folder with one or more options:

```text
APP_USERNAME=keystone
APP_PASSWORD=pick-a-private-password

TASK_NOTIFY_EMAIL=tommy@keystone.studio
TASK_NOTIFY_PHONE=+18456633682

RESEND_API_KEY=...
TASK_NOTIFY_FROM=Keystone Tasks <you@yourdomain.com>

TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+15555555555

TASK_DONE_WEBHOOK_URL=https://...
```
