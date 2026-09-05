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

> The frontend stack, decoupled architecture, in-cluster Postgres operator, and
> Helm as the manifest format are my recommended defaults, not yet confirmed by
> Rob — flag/revisit if reality diverges. The Docker dev setup below is now
> confirmed: Rob runs it day-to-day via Docker Desktop on Windows.

## Architecture

The backend and frontend are decoupled: Django + DRF expose a JSON API; the React SPA
is a separate app (its own dev server and build) that talks to the API over HTTP.

Repo layout:

```
backend/             Django project
  config/              settings, urls, wsgi/asgi
  accounts/            User (email-based), Household, Membership, Google OAuth login view
  mealplanner/         first sub-app: recipes, weekly plan, shopping list
  catalog/             shared grocery product catalog (Store, GroceryItem) — app-wide,
                       not Household-scoped; see Catalog below
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

#### Catalog

A shared, app-wide product catalog (`Store`, `GroceryItem`, `GroceryItemPrice`)
feeding the meal planner's shopping list — e.g. so a "Tesco British Cooked Ham
Slices 120g" entry is added once and reused by every household, rather than each
household maintaining its own copy. Deliberately **not** Household-scoped, the one
exception to the sub-app convention above; any signed-in user can view/add/edit
entries, but only the account that created an entry (`created_by`) can delete it.

A `GroceryItem` is the product itself (name/brand/aisle/size/image/`trolley_url`) —
it can be priced at several stores at once, each as its own `GroceryItemPrice` row
(store, price, that store's own `product_url`), rather than needing a duplicate
`GroceryItem` per store. `RecipeIngredientStoreOption` and `ShoppingListItem` match
against a specific `GroceryItemPrice` (i.e. a specific store's price for a
product), not the `GroceryItem` directly, since "which store" now lives there.

It also has one action that fetches product data on the user's behalf:
`/api/catalog/grocery-items/{id}/refresh-price/` re-fetches prices from the item's
`trolley_url` (a trolley.co.uk product page) by scraping that page's own per-store
comparison table, and updates/creates a `GroceryItemPrice` for every store row that
matches a known `Store` (stores absent from that particular page are left alone,
not cleared). Open to any signed-in user (no third-party API cost, no bot-block
risk — see `_scrape_trolley_prices` in `catalog/views.py`).

> Pepesto (paid product-lookup API) and a Sainsbury's-own-search scrape used to
> back "Populate"/"Scrape URLs" buttons on this page, matching a pasted product
> URL to a store/name/size/price. Rob stopped using both — removed from the
> codebase (backend `catalog/views.py` and `serializers.py`, frontend
> `groceries/GroceryItemForm.tsx` and `GroceryItemsPage.tsx`, the
> `PEPESTO_API_KEY` setting/env var) rather than left dormant. `refresh-price`
> above is unrelated and unaffected.

## Conventions

### Running locally

Rob develops on Windows 11, using PowerShell as the primary shell, with Docker
Desktop (WSL2 backend) as the actual day-to-day dev environment — Node and Python
aren't installed natively; everything runs in containers. In practice the three
containers (`getsorted-db-1`, `getsorted-backend-1`, `getsorted-frontend-1`) are
usually already up and left running across sessions rather than restarted each time
— check `docker compose ps` / `docker ps` before assuming a fresh `up --build` is
needed.

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

`.env` at the repo root (copied from `.env.example`, gitignored) holds secrets read
by `docker-compose.yml`:

- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` — Google login. Without
  them, everything else (admin, email/password auth, meal planner API) still works.

Editing either Dockerfile's `dev` stage, `docker-compose.yml` itself, or
`requirements.txt`/`package.json` needs `docker compose up --build` (or
`docker compose up -d --build <service>`) to take effect — plain source edits under
`backend/`/`frontend/` are picked up live via the bind mounts (Django autoreload,
Vite HMR).

### Without Docker

Only needed to iterate on one side without the other containers, or if Docker isn't
available. See `docs/setup.md` for the full "Running without Docker" instructions
(backend: venv + `pip install -r requirements.txt`, with `DATABASE_URL` overridable
to e.g. `sqlite:///db.sqlite3`; frontend: `npm install && npm run dev`, already done
in this repo's `frontend/` checkout).

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
`config/urls.py` under `/api/<subapp>/`. `catalog` is the one deliberate exception
(app-wide data, not Household-scoped) — a new sub-app should default to
Household-scoping unless it has the same "shared across every household" rationale.
