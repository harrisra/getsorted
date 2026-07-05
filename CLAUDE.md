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

Planned repo layout:

```
backend/            Django project
  config/            settings, urls, wsgi/asgi
  accounts/          users, households, Google OAuth
  mealplanner/        first sub-app: recipes, weekly plan, shopping list
frontend/            React SPA (Vite)
docker-compose.yml   postgres + backend + frontend for local dev
deploy/              Helm chart(s) for k3s, synced by ArgoCD
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

No code exists yet — this file will be updated with real commands (test, lint, run)
once the Django and React projects are scaffolded.
