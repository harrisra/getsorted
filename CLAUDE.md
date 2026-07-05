# getsorted

A multiuser single-page web app for household organization. The first sub-app is a
**Meal Planner**: weekly meal planning and an auto-generated shopping list for a family.
More sub-apps are expected to follow, sharing the same accounts/auth/household system.

## Tech stack

- **Backend:** Python, Django, Django REST Framework (JSON API only)
- **Frontend:** React (TypeScript, Vite, Tailwind CSS) — separate SPA, not served by Django
- **Database:** PostgreSQL
- **Auth:** Google OAuth login (via django-allauth + dj-rest-auth), multiuser
- **Dev environment:** Docker Compose (Postgres + backend + frontend)
- **Production deployment:** k3s cluster, GitOps via ArgoCD
- **Prod Postgres:** in-cluster, managed by a Postgres operator (e.g. CloudNativePG)
- **K8s manifests:** Helm chart(s), synced by ArgoCD

> The frontend stack, decoupled architecture, Docker dev setup, in-cluster Postgres
> operator, and Helm as the manifest format are my recommended defaults, not yet
> confirmed by Rob — flag/revisit if reality diverges.

## Architecture

The backend and frontend are decoupled: Django + DRF expose a JSON API; the React SPA
is a separate app (its own dev server and build) that talks to the API over HTTP.

Repo layout:

```
backend/             Django project
  config/              settings, urls, wsgi/asgi
  accounts/            User (email-based), Household, Membership, Google OAuth login view
  mealplanner/         first sub-app: recipes, weekly plan, shopping list
frontend/            React SPA (Vite + TypeScript + Tailwind v4)
docker-compose.yml   postgres + backend + frontend for local dev
deploy/              Helm chart(s) for k3s, synced by ArgoCD (not yet created)
```

## Deployment

Production target is a k3s cluster, deployed via ArgoCD (GitOps): manifests in
`deploy/` are the source of truth, ArgoCD reconciles the cluster to match.

- Backend and frontend ship as separate container images (multi-stage Dockerfiles —
  the frontend build output is served by nginx in prod, not the Vite dev server).
- Postgres runs in-cluster under a Postgres operator (e.g. CloudNativePG), not
  bundled with the app chart itself.
- Secrets (Django secret key, Google OAuth client secret, DB credentials) are not
  committed as plain YAML — use Sealed Secrets or External Secrets Operator (not
  yet decided which).
- Django config should stay 12-factor (settings from environment variables /
  secrets), so the same image works across local Compose and k3s.

### Multi-tenancy: Households

Users belong to one or more **Households**. All domain data (meal plans, recipes,
shopping lists, and future sub-app data) is scoped to a Household, not to an
individual user — any member of a household can view/edit its data. A user may
belong to more than one household (e.g. helping plan for a parent's household too).

### Sub-apps

Each domain feature is its own Django app plus a corresponding React feature module,
all sharing the same Household/user model and auth. New sub-apps should follow the
same pattern as `mealplanner`.

#### Meal Planner (first sub-app)

- Recipe library for the household
- Weekly meal plan (assign recipes/meals to days)
- Shopping list auto-generated from the week's planned meals
- Fully multiuser: any household member can view/edit the plan and list

## Conventions

### Running locally

```
docker compose up --build
```

- Backend: http://localhost:8000 (health check at `/api/health/`, admin at `/admin/`)
- Frontend: http://localhost:5173
- Postgres: localhost:5432 (db/user/password: `getsorted`)

First run needs migrations and a superuser, inside the running backend container:

```
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

Google OAuth login won't work until real credentials are set — copy `.env.example`
to `.env` at the repo root and fill in `GOOGLE_OAUTH_CLIENT_ID` /
`GOOGLE_OAUTH_CLIENT_SECRET` (from a Google Cloud OAuth client). Without them,
everything else (admin, email/password auth, meal planner API) still works.

### Without Docker

Node and Docker were not available in the environment this skeleton was built in,
so the frontend has not been `npm install`ed or run yet — do that first:

```
cd frontend && npm install && npm run dev
```

The backend was verified directly with the `py` launcher (venv + `pip install -r
requirements.txt` + `manage.py migrate`/`runserver`), reusing the same `DATABASE_URL`
override trick (e.g. `sqlite:///db.sqlite3`) if you don't want Postgres running
locally outside Docker.

### API auth model

DRF is configured for JWT (via `dj-rest-auth` + `djangorestframework-simplejwt`),
delivered as httpOnly cookies (`getsorted-access-token` / `getsorted-refresh-token`),
plus session auth for the browsable API/admin. Google login flow: frontend obtains a
Google access token client-side, POSTs it to `/api/auth/google/`, which verifies it via
allauth and returns the JWT cookies. Email/password auth (registration, password
reset) is available at `/api/auth/*` courtesy of dj-rest-auth, mainly for
admin/testing convenience — Google is the primary intended login method.

### Adding a new sub-app

Follow the `mealplanner` app as the template: models scoped to `Household` (FK or via
the household of a parent object), a `HouseholdScopedViewSet`-style base that filters
querysets to the requesting user's households, and a router wired into
`config/urls.py` under `/api/<subapp>/`.
