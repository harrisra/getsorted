# Setup

## Prerequisites

- **Docker Desktop** (with the WSL2 backend on Windows) — see [Developing on Windows](../README.md#developing-on-windows) if you haven't installed it yet.
- Everything else (Python, Node, PostgreSQL) runs inside containers via Docker Compose, so no local install of those is required to get started.

## Environment variables

Copy the example env file at the repo root:

```
cp .env.example .env
```

This only holds the Google OAuth credentials (`GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`). Leave them blank to start — everything except the Google login button works without them. See [Google OAuth](#google-oauth) below for how to fill them in later.

## First run

From the repo root:

```
docker compose up --build
```

This starts three services:

| Service    | URL                          |
|------------|-------------------------------|
| frontend   | http://localhost:5173         |
| backend    | http://localhost:8000         |
| db         | localhost:5432 (Postgres)     |

Once it's up, apply migrations and create an admin user (there is no default admin account):

```
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

`createsuperuser` prompts for an email and password (the custom `User` model has no username field).

## Verify it's working

- http://localhost:5173 — the frontend shows "Backend API: connected" once it can reach the backend.
- http://localhost:8000/api/health/ — should return `{"status": "ok"}`.
- http://localhost:8000/admin/ — log in with the superuser you just created.

## Google OAuth

To enable "Sign in with Google":

1. Create an OAuth 2.0 Client ID in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Web application type).
2. Add `http://localhost:5173` as an authorized JavaScript origin for local dev.
3. Put the client ID/secret in `.env` at the repo root:
   ```
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   ```
4. Restart the backend service: `docker compose up -d --build backend`.

The frontend obtains a Google access token client-side and posts it to `/api/auth/google/`, which verifies it and returns session/JWT auth cookies.

## Running without Docker

Only needed if you want to iterate on one side without the other containers, or Docker isn't available.

**Backend:**

```
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
# Point at a reachable Postgres, or use sqlite for quick local testing:
set DATABASE_URL=sqlite:///db.sqlite3
python manage.py migrate
python manage.py runserver
```

**Frontend:**

```
cd frontend
npm install
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env` if the backend isn't on the default `http://localhost:8000`.

## Troubleshooting

- **Port already in use** — something else on your machine is using 5173, 8000, or 5432. Stop it, or change the port mapping in `docker-compose.yml`.
- **Frontend shows "unreachable"** — the backend container isn't up yet, or `VITE_API_BASE_URL` doesn't match where it's actually running.
- **`docker compose` not found** — you have an old standalone `docker-compose` install; use `docker compose` (no hyphen), bundled with modern Docker Desktop.
