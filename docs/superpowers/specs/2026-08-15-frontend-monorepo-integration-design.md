# Frontend Monorepo Integration — Design

## Overview

Argus's dashboard is currently a Google-OAuth-protected, server-rendered (Jinja2) web UI. A separate Next.js project, `argus-dashboard`, was started as an eventual replacement — originally planned as an independently-deployed, cross-origin single-page app.

That direction is reversed by this spec. `argus-dashboard` moves **into** the `argus` repository as `frontend/`, and its build output is served by the **same** FastAPI process, at the **same** origin. Same-origin serving means the dashboard's existing session-cookie authentication continues to work unchanged — no Bearer tokens, no CORS, no separate SPA OAuth flow are needed. (An earlier plan and PR built exactly that cross-origin machinery; it is abandoned — see [Superseded work](#superseded-work).)

This spec covers three things that must land together, in one branch, before merging to `main`:

1. Folding `argus-dashboard`'s source into `argus/frontend/`, with a Docker multi-stage build and CI wired up.
2. FastAPI serving the built static frontend, replacing two of the three legacy Jinja2 routes.
3. The actual dashboard pages (event list, event detail, webhook logs, login-state handling) built against the existing `/dashboard/api/*` JSON API.

The three are inseparable: shipping (1) alone — a Docker build that now requires a Node/pnpm toolchain but whose output nothing serves — adds a new deployment failure point for zero functional benefit. Nothing merges to `main` until the whole pipeline works end-to-end.

## Superseded Work

An earlier plan (`docs/superpowers/plans/2026-08-15-frontend-api-extraction.md`) and its PR (#16) added:
- Bearer-token issue/verify (`auth.issue_api_token`/`verify_api_token`)
- Bearer support in `require_login`
- `GET /dashboard/login/spa` / `GET /dashboard/oauth/callback/spa`
- `CORSMiddleware`
- Config: `FRONTEND_ORIGINS`, `FRONTEND_REDIRECT_URL`, `AUTH_TOKEN_TTL_SECONDS`

None of it is needed once the frontend is same-origin. PR #16 was closed without merging; none of its code exists on `main`, so there is nothing to revert. `GET /dashboard/api/me` is the one thing from that effort worth keeping conceptually — but it already works with the plain session cookie via the *existing* (pre-PR-#16) `require_login`, so it needs no Bearer-specific code either. It is not currently on `main`; whether to (re-)add it is a call for whoever implements the plan, based on whether the new frontend's client-side auth check (see [Client-side auth check](#client-side-auth-check)) needs it.

## Repository Layout

`argus-dashboard` (a local-only repo at `/Users/zhangwuxian/Code/sciwork/argus-dashboard`, no remote, 14 commits including shadcn/ui setup, Storybook+Vitest scaffolding, and `output: "export"` already configured) is copied — **files only, not git history** — into `argus/frontend/`:

```
argus/
├── src/argus/...              # unchanged
├── frontend/                  # new: Next.js source (this repo's copy of argus-dashboard)
│   ├── app/
│   ├── components/
│   ├── package.json           # packageManager: pnpm@10.33.0
│   ├── pnpm-lock.yaml
│   ├── pnpm-workspace.yaml
│   ├── next.config.ts
│   └── .gitignore             # kept — frontend-specific ignores stay scoped here, not merged into root
├── Dockerfile                 # modified — see below
├── .dockerignore               # modified — see below
├── pyproject.toml              # modified — see below
└── .github/workflows/ci.yml    # modified — see below
```

The original `argus-dashboard` directory is left in place (not deleted) — it's out of scope for this spec to decide its fate.

## Routing

| Path | Before | After |
|------|--------|-------|
| `GET /dashboard` | Jinja2 `index.html` | **Swapped** — serves the built static frontend's home page |
| `GET /dashboard/webhook-logs` | Jinja2 `webhook_logs.html` | **Swapped** — serves the built static frontend |
| `GET /dashboard/events?slug=<slug>` | *(doesn't exist)* | **New** — serves the built static frontend's event-detail page |
| `GET /dashboard/events/{slug}` | Jinja2 `event.html`, session-gated | **Unchanged** — kept because Next.js static export cannot pre-render a path segment for a slug that doesn't exist yet at build time (new events arrive via webhook after deploy) |
| `GET /dashboard/login`, `GET /dashboard/oauth/callback`, `GET /dashboard/logout` | session-cookie OAuth flow | **Unchanged** |
| `GET /dashboard/api/*` (events, timeseries, webhook-logs, report/trigger, event delete) | session-cookie protected via `Depends(auth.require_login)` | **Unchanged** |

Consequences:
- `dashboard/templates/index.html` and `dashboard/templates/webhook_logs.html`, and the `dashboard_home`/`dashboard_webhook_logs` route functions that render them, are deleted. `event.html` and `dashboard_event` stay exactly as they are.
- The new frontend's event-detail page reads its identifier from a query string (`?slug=`), not a path segment — Next.js can pre-render this as a single static file (`app/events/page.tsx`, no dynamic route segment), sidestepping the pre-rendering problem entirely. The frontend's own links to this page (e.g. from the event list) point at `/dashboard/events?slug=<slug>`, not the legacy path.

### Client-side auth check

The three swapped/new pages (`/dashboard`, `/dashboard/webhook-logs`, `/dashboard/events`) are **public shells** — FastAPI serves the static HTML with no server-side session check, because a static file has no per-request logic to check anything with. Protection stays where it already lives: every `/dashboard/api/*` call still requires the session cookie. The frontend calls the dashboard's user-lookup endpoint on load; on 401 it redirects the browser to `/dashboard/login`. (Whether that's the existing-but-unused `/dashboard/api/me` or a route the implementer adds is their call — see [Superseded Work](#superseded-work).)

This is a deliberate, accepted UX change from today's behavior: an unauthenticated visit to `/dashboard` currently gets an immediate server-side 302; after this change it will briefly render the shell before client-side JS redirects. For an internal admin tool this trade-off is acceptable.

`/dashboard/events/{slug}` (the retained legacy route) is unaffected — it keeps its existing server-side `_session_email_or_redirect` gate, because it's still a real Jinja2 route with per-request logic.

## Static File Serving

A real `next build` with `output: "export"` (already configured in `argus-dashboard`) was run as a spike to see the actual output shape. It produces more than per-page `.html` files:

```
out/
├── index.html, index.txt              # page + a lightweight client-nav prefetch payload
├── 404.html, _not-found.html/.txt
├── favicon.ico, *.svg                 # public/ assets, copied verbatim
└── _next/static/
    ├── chunks/*.js, *.css             # content-hashed, cacheable forever
    ├── media/*.woff2
    └── <build-id>/*.js                # build-id directory name changes every build
```

Because of the extra `.txt` companion files and the per-build hashed directory, **the whole output tree must be served as-is** — bespoke per-page route handlers (as originally sketched in the superseded plan) would miss files the client-side router needs for navigation. The recommended mechanism is a single `StaticFiles(directory=..., html=True)` mount covering the whole build directory, registered **after** `app.include_router(dashboard_router)` so the more specific routes (`/dashboard/login`, `/dashboard/api/*`, `/dashboard/events/{slug}`, `/dashboard/oauth/callback`) are matched first and only unmatched paths fall through to the static mount.

Two Next.js config requirements this implies, both belonging in `frontend/next.config.ts`:

- **`basePath: "/dashboard"`** — so every one of Next's own asset/script/link references resolves under the same prefix FastAPI mounts the files at. Without this, the built HTML's script tags would reference `/_next/static/...` (root-relative) instead of `/dashboard/_next/static/...`, and the assets would 404.
- **`trailingSlash: true`** — so each page exports as `<page>/index.html` rather than a flat `<page>.html`. Static file servers (including Starlette's `StaticFiles(html=True)`) resolve directory-style paths (`/dashboard/webhook-logs/` → `webhook-logs/index.html`) far more predictably than they resolve an extensionless path to a same-named `.html` file. This is also the standard recommendation for serving a Next static export from a non-Next server.

The build directory itself is `src/argus/dashboard/frontend/` — inside the `dashboard` feature package, alongside the existing `templates/` directory, following the same convention (see [Build & Packaging](#build--packaging)). This is a *build artifact location*, not source — it exists only inside the Docker image, populated by the multi-stage build below. It is unrelated to (and not a duplicate of) `argus/frontend/`, which is the Next.js *source*.

**Left to implementation, not fully specified here:** the exact FastAPI mount call, and empirical verification that a request to `/dashboard/webhook-logs` actually resolves against the real Next export output once `trailingSlash`/`basePath` are set — this needs a real build-and-serve check, not just code review.

## Build & Packaging

### Dockerfile (multi-stage)

```dockerfile
FROM node:22-slim AS frontend-build

WORKDIR /frontend
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend ./
RUN pnpm build


FROM python:3.12-slim-bookworm

LABEL org.opencontainers.image.source="https://github.com/sciwork/argus"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
COPY --from=frontend-build /frontend/out ./src/argus/dashboard/frontend

RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["uvicorn", "argus.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Notes on deviations from the reference Dockerfile the design started from:
- **pnpm, not npm** — matches `argus-dashboard`'s actual tooling (`pnpm-lock.yaml`, `packageManager` field); installed via corepack rather than a global `npm install -g pnpm`, so the exact pinned version is used.
- **Copies from `/frontend/out`, not `/frontend/dist`** — matches Next.js's actual static-export output directory (confirmed by the spike), not the reference's assumption.
- **No `sqlite3` CLI install** — the reference Dockerfile this design started from included `apt-get install sqlite3`; that was deliberately removed from `argus`'s Dockerfile in a past change (#13) and must **not** be reintroduced.

### `pyproject.toml`

Add the frontend build output to package data, alongside the existing `templates/*.html` entry:

```toml
[tool.setuptools.package-data]
"argus.dashboard" = ["templates/*.html", "frontend/**/*"]
"argus.kktix" = ["templates/*.j2"]
```

**Verify, don't assume:** confirm setuptools' glob actually picks up nested files recursively (build a wheel and inspect its contents) rather than trusting the `**` pattern works as written — this is an easy thing to get subtly wrong.

### `.dockerignore`

Add:
```
frontend/node_modules
frontend/.next
frontend/out
```

### CI (`.github/workflows/ci.yml`)

Add a `frontend` job alongside the existing Python `test` job: corepack-installed pnpm (pinned via `packageManager`), `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`. No test step yet — `package.json` has no `test` script defined despite the Storybook/Vitest scaffolding commit; add one only once real component tests exist.

## Local Development

In production, FastAPI serves the built frontend, so both are same-origin by construction. In local development, `next dev` (typically `localhost:3000`) and `uvicorn` (`localhost:8000`) run as separate processes on different ports — still cross-origin.

Rather than reintroducing CORS for dev only, `frontend/next.config.ts` gets a dev-only `rewrites()` entry forwarding `/dashboard/api/:path*` to `http://localhost:8000/dashboard/api/:path*`. The browser only ever talks to `localhost:3000`; Next's dev server proxies the API calls server-side. This keeps dev and prod auth behavior identical (session cookie, no CORS, ever) and preserves hot-reload.

## Frontend Pages

Built against the **existing, unchanged** `/dashboard/api/*` JSON shapes (documented in `SPEC.md`) — no backend API changes are needed to support them:

- **Home / event list** (`/dashboard`) — replaces the Jinja2 event list. Consumes `GET /dashboard/api/events`. Links to each event point at `/dashboard/events?slug=<slug>`.
- **Event detail** (`/dashboard/events`, reading `slug` from the query string) — replaces the Jinja2 per-event chart page. Consumes `GET /dashboard/api/events/{slug}/timeseries`. Feature parity with the current Chart.js rendering: one line per ticket type plus "Total", horizontal dashed capacity line, vertical dashed event-start line, daily granularity.
- **Webhook logs** (`/dashboard/webhook-logs`) — replaces the Jinja2 log viewer. Consumes `GET /dashboard/api/webhook-logs` (paginated), `DELETE /dashboard/api/webhook-logs/{id}`, `DELETE /dashboard/api/webhook-logs`.
- **Login-state handling** — see [Client-side auth check](#client-side-auth-check) above.

Charting library: `argus-dashboard` already has shadcn/ui set up, which ships a chart component built on **Recharts**. Recommended over pulling in Chart.js again, for consistency with the rest of the design system already in place. This is a low-risk, easily-revisited implementation choice, not a hard requirement of this spec.

Visual/component-level design (exact layout, spacing, styling) is intentionally not specified here — build to functional parity with the current dashboard, using the design system already scaffolded in `argus-dashboard` (shadcn/ui, breakpoint tokens), and use judgment for the rest. This is an internal admin tool, not a customer-facing product.

## Sequencing & Merge Gate

All of the above lands in one branch (fresh off `main` — PR #16 was closed unmerged first). Suggested order, each step kept independently testable:

1. Copy `argus-dashboard` → `frontend/`, add `.gitignore`, confirm `pnpm install`/`pnpm build`/`pnpm lint` work standalone.
2. Dockerfile + `.dockerignore` + `pyproject.toml` package-data — build the image, confirm the static files land in the installed package (inspect the built wheel/image, don't assume).
3. CI `frontend` job.
4. FastAPI static-serving wiring (`basePath`/`trailingSlash` config, the `StaticFiles` mount, removal of the two Jinja2 routes/templates) — verified against a real build, not just code review.
5. The three pages + client-side auth check.
6. Local-dev proxy (`next.config.ts` rewrites).
7. End-to-end verification: fresh clone, `docker build`, run the container, confirm `/dashboard`, `/dashboard/webhook-logs`, `/dashboard/events?slug=...`, and `/dashboard/events/{slug}` (legacy) all work, login/logout still work, and nothing else (webhook ingestion, Discord reports, `/health`) regressed.

Only after step 7 passes does this merge to `main`.

## Open Questions / Explicitly Deferred

- Preserving `argus-dashboard`'s original git history in the merge — explicitly decided against; a plain copy is used instead.
- A frontend test suite / CI test step — deferred until real tests exist.
- Deleting the original `argus-dashboard` directory — deferred, not this spec's call.
