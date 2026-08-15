# Frontend Monorepo Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the separate `argus-dashboard` Next.js project into `argus` as `frontend/`, have FastAPI serve its static export at the same origin (replacing two of three legacy Jinja2 dashboard routes), and build the three real dashboard pages against the existing `/dashboard/api/*` JSON API — so the whole pipeline works end-to-end before it ever reaches `main`.

**Architecture:** Same-origin static-file serving. `frontend/` (Next.js, `output: "export"`) builds to a directory Docker copies into `src/argus/dashboard/frontend/`, which FastAPI mounts via `StaticFiles(html=True)` under `/dashboard`, registered after the existing dashboard router so `/dashboard/login`, `/dashboard/api/*`, `/dashboard/oauth/callback`, and the retained legacy `/dashboard/events/{slug}` all take priority. No Bearer tokens, no CORS — the existing session-cookie `require_login` dependency is untouched and is what actually protects data; the static pages themselves are public shells.

**Tech Stack:** Backend unchanged (FastAPI, SQLAlchemy, Starlette). Frontend: Next.js 16 (App Router, static export), TypeScript, Tailwind v4, shadcn/ui (Base UI primitives, `style: "base-sera"`), axios, Recharts (via shadcn's chart wrapper), pnpm, Vitest + Storybook (`@storybook/nextjs-vite`, Playwright browser provider).

**Spec:** [docs/superpowers/specs/2026-08-15-frontend-monorepo-integration-design.md](../specs/2026-08-15-frontend-monorepo-integration-design.md)

## Global Constraints

- Nothing in this plan merges to `main` until Task 11 (end-to-end verification) passes — see the spec's "Sequencing & Merge Gate".
- Backend: Python 3.11+, ruff (`I, N, E, W, F, UP`), double-quote strings, isort `from-first`, 2 blank lines after imports. Every commit ends with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Frontend: **pnpm only, never npm** (`packageManager: "pnpm@10.33.0"` in `frontend/package.json`). **Axios, not native `fetch`**, for all API calls (AGENTS.md: "Data Fetching: Axios"). Follow the folder convention from `frontend/AGENTS.md`: `apis/` (API calls), `types/responses/` (response shapes), `hooks/` (custom hooks) — create these directories as needed, they don't exist yet. TypeScript: prefer explicit types over inferred (`as const` where relevant); avoid `any`, use `unknown` + narrowing. Run `pnpm exec prettier . --write` before every frontend commit (double quotes, semicolons, trailing commas, the project's specific import order, Tailwind class sorting — all enforced by the configured Prettier plugins, not by hand).
- **`basePath: "/dashboard"` gotcha:** once Task 5 sets this, Next's own `<Link href>` / `useRouter()` **automatically prepend** `/dashboard` to any app-internal path. Write internal hrefs *without* the `/dashboard` prefix (e.g. `href="/events?slug=..."`, which Next renders as `/dashboard/events?slug=...`). Paths Next does *not* own — `/dashboard/login`, `/dashboard/oauth/callback` — are FastAPI routes; navigate to them with a real browser navigation (`window.location.href = "/dashboard/login"`), never through Next's router, and write them with the full `/dashboard/...` path since nothing auto-prefixes a raw `window.location` assignment.
- `cn()` convention (from `frontend/AGENTS.md`): static classes as a string argument, conditional classes in an object argument — `cn("static-class", { "conditional-class": isCondition })`.
- Storybook stories + Vitest component tests are required by `frontend/AGENTS.md` for reusable `components/*`. This plan scopes that requirement to the one genuinely reusable extraction (`EventChart`, Task 8) — page-level route files (`app/*/page.tsx`) are composition/wiring, not reusable components, and are not given stories.
- The original `argus-dashboard` directory is left untouched throughout this plan.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/` | Copied Next.js source (from `argus-dashboard`) |
| `AGENTS.md`, `CLAUDE.md` (repo root) | New — point Claude/agents at `frontend/AGENTS.md` for frontend conventions (see Task 1) |
| `Dockerfile` | Modified — multi-stage: Node/pnpm build stage, then Python |
| `.dockerignore`, `pyproject.toml` | Modified — frontend build artifacts ignored; static output packaged |
| `.github/workflows/ci.yml` | Modified — new `frontend` job |
| `src/argus/auth.py` | Modified — `require_login` gains no new logic; only a new route consumes it |
| `src/argus/dashboard/router.py` | Modified — remove `dashboard_home`/`dashboard_webhook_logs` + their templates; add `api_me` |
| `src/argus/dashboard/templates/index.html`, `webhook_logs.html` | Deleted |
| `src/argus/main.py` | Modified — `StaticFiles` mount |
| `frontend/next.config.ts` | Modified — `basePath`, `trailingSlash`, dev-only `rewrites()` |
| `frontend/apis/*.ts`, `frontend/types/responses/*.ts`, `frontend/hooks/*.ts` | New — API client + auth-check hook |
| `frontend/app/page.tsx` | Modified — event list |
| `frontend/app/events/page.tsx`, `frontend/components/event-chart.tsx` | New — event detail + chart |
| `frontend/app/webhook-logs/page.tsx` | New — webhook log viewer |

---

### Task 1: Fold `argus-dashboard` into `frontend/`

**Files:**
- Create: `frontend/` (copied from `argus-dashboard`, files only — no git history)
- Create: `AGENTS.md`, `CLAUDE.md` (repo root)

**Interfaces:**
- Produces: a working, standalone `frontend/` Next.js project (`pnpm install`/`pnpm build`/`pnpm lint` all succeed from within it) — every later task builds on this.

- [ ] **Step 1: Copy tracked files only, no history**

`argus-dashboard`'s working tree must be clean before this (`git -C /Users/zhangwuxian/Code/sciwork/argus-dashboard status --porcelain` should print nothing).

```bash
mkdir -p frontend
git -C /Users/zhangwuxian/Code/sciwork/argus-dashboard archive HEAD | tar -x -C frontend
```

`git archive` exports exactly the tracked tree at `HEAD` — no `.git/`, no history, and (because it's a tracked file) `frontend/.gitignore` comes along automatically, so `node_modules/`, `.next/`, `out/`, etc. stay correctly ignored once you `pnpm install`/`pnpm build` below.

- [ ] **Step 2: Verify the copy is self-contained**

```bash
cd frontend && pnpm install && pnpm build && pnpm lint
cd ..
```

Expected: all three succeed. `pnpm build` produces `frontend/out/` (gitignored, don't commit it).

- [ ] **Step 3: Root `AGENTS.md`/`CLAUDE.md` — point at the frontend's own conventions**

`frontend/AGENTS.md` and `frontend/CLAUDE.md` came along in Step 1, but the repo root's existing `.gitignore` has:
```
# AI assistant configs (personal, not shared)
.claude/
CLAUDE.md
AGENTS.md
```
No leading `/`, so this matches at *any* depth — `frontend/AGENTS.md` and `frontend/CLAUDE.md` will be silently excluded from git by this repo's existing, deliberate policy (agent-config files aren't shared via git here). Leave that policy alone. But a Claude session working from the repo root (not already `cd`'d into `frontend/`) needs *some* on-disk pointer to discover that `frontend/` has its own detailed conventions doc — so create root-level files whose job is only to point there:

```markdown
# AGENTS.md
# Argus

FastAPI backend (`src/argus/`) — see `SPEC.md` for the full API/architecture
reference — plus a Next.js dashboard frontend (`frontend/`), served
same-origin by the same FastAPI process. See
`docs/superpowers/specs/2026-08-15-frontend-monorepo-integration-design.md`
for how the two fit together.

## Frontend (`frontend/`)

A separate Next.js project with its own tech stack, folder conventions, and
testing rules — see `frontend/AGENTS.md` (present on disk once `frontend/`
exists in your working copy; not tracked in git, matching this repo's
existing policy of not committing agent-config files). Key points if you
don't have it handy:

- Static export (`output: "export"`), served by FastAPI at the same origin
  as the backend — no separate deployment, no CORS, no Bearer tokens.
- Package manager: pnpm (not npm).
- Data fetching: axios.
- Component library: shadcn/ui on Base UI (not Radix) — see
  `frontend/.agents/skills/shadcn/` and
  `frontend/.agents/skills/migrate-radix-to-base/`.
```

```markdown
# CLAUDE.md
@AGENTS.md
```

(Mirrors `frontend/CLAUDE.md`'s own one-line-pointer pattern.) These two root files will *also* be excluded by the same gitignore rule — that's fine, they exist to help whoever's local working copy has `frontend/` present; they aren't meant to be the shared record of these conventions (the spec and this plan are).

- [ ] **Step 4: Commit**

```bash
git add -A frontend
git status --porcelain  # confirm AGENTS.md/CLAUDE.md (root and frontend/) do NOT appear — gitignored, as intended
git commit -m "feat: fold argus-dashboard into frontend/

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(The root/`frontend/` `AGENTS.md`/`CLAUDE.md` files from Step 3 stay on disk but aren't part of this commit, by design — see Step 3.)

---

### Task 2: Docker multi-stage build + package data

**Files:**
- Modify: `Dockerfile`
- Modify: `.dockerignore`
- Modify: `pyproject.toml`

**Interfaces:**
- Consumes: `frontend/` (Task 1).
- Produces: a Docker image whose Python package includes the built static frontend at `src/argus/dashboard/frontend/` at runtime — consumed by Task 5's `StaticFiles` mount.

- [ ] **Step 1: Rewrite `Dockerfile` as multi-stage**

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

Do not reintroduce `apt-get install sqlite3` — the current single-stage `Dockerfile` already has it removed (past change #13); this rewrite must preserve that.

- [ ] **Step 2: Update `.dockerignore`**

Add:
```
frontend/node_modules
frontend/.next
frontend/out
```

- [ ] **Step 3: Update `pyproject.toml` package data**

```toml
[tool.setuptools.package-data]
"argus.dashboard" = ["templates/*.html", "frontend/**/*"]
"argus.kktix" = ["templates/*.j2"]
```

- [ ] **Step 4: Build the image and verify the static files actually land in the installed package**

Don't just trust the `**` glob — check the built wheel directly:

```bash
docker build --tag argus-frontend-check .
docker run --rm argus-frontend-check python -c "
import pathlib
p = pathlib.Path('/usr/local/lib/python3.12/site-packages/argus/dashboard/frontend')
assert p.is_dir(), f'{p} missing'
assert (p / 'index.html').exists(), 'index.html missing from installed package'
print('OK:', sorted(str(f.relative_to(p)) for f in p.rglob('*'))[:10], '...')
"
docker image rm argus-frontend-check
```

Expected: `OK: [...]` printing at least `index.html` and something under `_next/`. If the assertion fails, the `package-data` glob isn't matching recursively as written — the `[tool.setuptools.package-data]` glob or a `MANIFEST.in`/`include_package_data` setting needs adjusting; don't guess which without seeing the actual failure.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore pyproject.toml
git commit -m "feat: multi-stage Docker build for the frontend static export

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: CI frontend job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `frontend/` (Task 1).
- Produces: CI coverage that `pnpm install`/`pnpm lint`/`pnpm build` keep working on every push/PR.

- [ ] **Step 1: Add a `frontend` job**

```yaml
  frontend:
    name: Frontend
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Enable corepack
        run: corepack enable

      - name: Set up Node
        uses: actions/setup-node@v5
        with:
          node-version: "22"

      - name: Install dependencies
        working-directory: frontend
        run: pnpm install --frozen-lockfile

      - name: Lint
        working-directory: frontend
        run: pnpm lint

      - name: Build
        working-directory: frontend
        run: pnpm build
```

Add this as a sibling to the existing `test:` job (same `jobs:` level), not nested inside it. No test step — `frontend/package.json` has no `test` script yet (the Storybook/Vitest scaffolding isn't wired to one); add it once real component tests exist (Task 8 adds the first one, at which point revisit).

- [ ] **Step 2: Verify locally as far as possible**

```bash
cd frontend && pnpm install --frozen-lockfile && pnpm lint && pnpm build
cd ..
```

(Full CI verification happens when this branch's commits actually run in GitHub Actions — note that in your PR description/final check rather than trying to fully simulate it locally.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add frontend lint/build job

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `GET /dashboard/api/me`

**Files:**
- Modify: `src/argus/dashboard/router.py`
- Test: `tests/test_auth.py`

**Interfaces:**
- Consumes: `auth.require_login` (existing, unchanged — session-cookie only, no Bearer).
- Produces: `GET /dashboard/api/me` → `{"email": str}` — consumed by Task 6's frontend auth-check hook.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_auth.py — reuse the existing dashboard_app fixture and its
# session-cookie login pattern (this file already has a real OIDC-mock
# OAuth flow test to model from; a simpler direct-session-set test suffices
# here since api_me has no logic beyond require_login)
@pytest.mark.asyncio
async def test_api_me_returns_authenticated_email(dashboard_app):
    """The frontend can look up who is currently logged in via the session cookie."""
    transport = httpx.ASGITransport(app=dashboard_app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        # Log in by hitting the real OAuth flow, or set the session directly
        # via the test client's cookie jar if this file already has a helper
        # for that — check tests/test_auth.py's existing fixtures/imports
        # before adding a new one.
        login_response = await client.get(
            "/dashboard/api/me"
        )
        assert login_response.status_code == 401  # no session yet

        # (Use whichever session-establishing approach the existing test file
        # already relies on — e.g. driving the real OIDC-mock flow like
        # test_google_oauth_accepts_only_allowlisted_user does — to then
        # assert a 200 with {"email": "chester@example.com"}.)
```

Read `tests/test_auth.py` in full before writing this — the file already has a working pattern for establishing an authenticated session via the real (mocked) Google OAuth flow (`run_server_in_thread`, `client.get("/dashboard/login", ...)`, following the redirect chain). Reuse that pattern rather than inventing a new one; the test above is a starting sketch, not the literal final code — fill in the actual login step using the existing pattern in the same file.

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_auth.py -v -k api_me`
Expected: FAIL — route doesn't exist yet (404, or the test itself won't even reach a meaningful assertion).

- [ ] **Step 3: Implement**

```python
# src/argus/dashboard/router.py — add to the "── JSON API ──" section,
# as the first route, right before api_events
@router.get("/dashboard/api/me")
async def api_me(email: str = Depends(auth.require_login)):
    return {"email": email}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_auth.py -v`
Expected: PASS (whole file — confirms this addition didn't disturb the existing OAuth cookie-flow test)

- [ ] **Step 5: Commit**

```bash
git add src/argus/dashboard/router.py tests/test_auth.py
git commit -m "feat: add GET /dashboard/api/me for frontend session bootstrap

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Next.js config + FastAPI static serving + remove two legacy routes

**Files:**
- Modify: `frontend/next.config.ts`
- Modify: `src/argus/main.py`
- Modify: `src/argus/dashboard/router.py`
- Delete: `src/argus/dashboard/templates/index.html`, `src/argus/dashboard/templates/webhook_logs.html`
- Modify: `tests/test_docker_integration.py`

**Interfaces:**
- Consumes: `src/argus/dashboard/frontend/` existing at runtime (Task 2's Docker copy).
- Produces: `GET /dashboard` resolves to the built static frontend (still just the default scaffold page at this point — Task 7 replaces its content); `/dashboard/webhook-logs` and `/dashboard/events` will 404 until Tasks 8–9 add those pages, which is expected and fine at this stage. `/dashboard/events/{slug}` (legacy Jinja2) and all `/dashboard/api/*`, `/dashboard/login`, `/dashboard/oauth/callback` routes are unaffected.

- [ ] **Step 1: Next.js config**

```typescript
// frontend/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/dashboard",
  trailingSlash: true,
  // next/image's default loader needs a server; serve images as-is instead.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
```

- [ ] **Step 2: Remove the two legacy Jinja2 routes and templates**

```python
# src/argus/dashboard/router.py — DELETE these two route functions entirely:
#   @router.get("/dashboard")
#   async def dashboard_home(request: Request): ...
#
#   @router.get("/dashboard/webhook-logs")
#   async def dashboard_webhook_logs(request: Request): ...
#
# Keep `dashboard_event` (the /dashboard/events/{slug} handler), the
# `templates` Jinja2Templates instance (event.html still needs it),
# `_session_email_or_redirect`, and `_format_start_at_local` exactly as they are.
```

```bash
rm src/argus/dashboard/templates/index.html
rm src/argus/dashboard/templates/webhook_logs.html
```

- [ ] **Step 3: Mount the static frontend in `main.py`**

```python
# src/argus/main.py — imports: add
from pathlib import Path

from starlette.staticfiles import StaticFiles
```

```python
# src/argus/main.py — add right after app.include_router(health_router)
_FRONTEND_DIR = Path(__file__).parent / "dashboard" / "frontend"

if _FRONTEND_DIR.is_dir():
    app.mount(
        "/dashboard", StaticFiles(directory=_FRONTEND_DIR, html=True), name="dashboard-frontend"
    )
```

The `is_dir()` guard matters: in local development (no Docker build), `src/argus/dashboard/frontend/` won't exist, and `StaticFiles(directory=...)` raises at construction time if its directory is missing — without the guard, the app would fail to start at all for anyone running `uvicorn` directly against a source checkout without having built the frontend first.

Mounting *after* `app.include_router(dashboard_router)` (already the case — this is appended after the last `include_router` call) means the more specific routes (`/dashboard/login`, `/dashboard/api/*`, `/dashboard/events/{slug}`, `/dashboard/oauth/callback`) are matched first; only paths under `/dashboard/*` that don't match any of those fall through to the static mount.

- [ ] **Step 4: Extend the Docker integration test**

```python
# tests/test_docker_integration.py — new test function, using the existing
# api_url fixture (already builds the real image and runs it)
def test_docker_image_serves_frontend_shell(api_url: str) -> None:
    """The built static frontend is served at /dashboard, same-origin."""
    with httpx.Client(base_url=api_url, timeout=5) as client:
        response = client.get("/dashboard")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
```

Do **not** add assertions for `/dashboard/webhook-logs` or `/dashboard/events` here — those pages don't exist in the Next app until Tasks 8–9, so a request for them would 404 at this point in the sequence; those tasks add their own equivalent assertions once their pages exist. Do **not** remove or alter `test_docker_image_api_flow` or `test_docker_image_cors_and_bearer_token_auth` — wait, the latter is from the abandoned PR #16 and shouldn't exist on `main` at all; if you find it while reading this file, that means you're working from the wrong base — confirm you branched from current `main`, not the old `worktree-frontend-api-extraction` branch.

- [ ] **Step 5: Run the full suite, including Docker**

Run: `uv run pytest tests/ -v` (this rebuilds the image — expect ~30-60s)
Expected: PASS, including the new frontend-shell test and the retained legacy-`/dashboard/events/{slug}` coverage in the existing suite.

- [ ] **Step 6: Commit**

```bash
git add frontend/next.config.ts src/argus/main.py src/argus/dashboard/router.py \
        tests/test_docker_integration.py
git rm src/argus/dashboard/templates/index.html src/argus/dashboard/templates/webhook_logs.html
git commit -m "feat: serve the built frontend at /dashboard, retire two Jinja2 routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend API client + auth-check hook

**Files:**
- Create: `frontend/apis/client.ts`, `frontend/apis/auth.ts`, `frontend/apis/events.ts`, `frontend/apis/webhook-logs.ts`
- Create: `frontend/types/responses/auth.ts`, `frontend/types/responses/events.ts`, `frontend/types/responses/webhook-logs.ts`
- Create: `frontend/hooks/use-require-auth.ts`
- Test: `frontend/tests/hooks/use-require-auth.test.tsx`

**Interfaces:**
- Consumes: `GET /dashboard/api/me`, `/events`, `/events/{slug}/timeseries`, `/events/{slug}` (DELETE), `/webhook-logs`, `/webhook-logs/{id}` (DELETE) — all documented in `SPEC.md`, unchanged by this plan.
- Produces: `getCurrentUser(): Promise<CurrentUser | null>`, `listEvents()`, `getEventTimeseries(slug)`, `deleteEvent(slug)`, `listWebhookLogs(limit, offset)`, `deleteWebhookLog(id)`, `clearWebhookLogs()`, and the `useRequireAuth()` hook — consumed by Tasks 7–9's pages.

- [ ] **Step 1: Response types**

```typescript
// frontend/types/responses/auth.ts
export interface CurrentUser {
  email: string;
}
```

```typescript
// frontend/types/responses/events.ts
export interface EventSummary {
  event_slug: string;
  event_name: string;
  channel: string | null;
  start_at: string | null;
  capacity: number | null;
}

export interface TimeseriesDataset {
  name: string;
  data: number[];
}

export interface EventTimeseries {
  event: EventSummary;
  labels: string[];
  datasets: TimeseriesDataset[];
  start_marker_label: string | null;
}
```

```typescript
// frontend/types/responses/webhook-logs.ts
export interface WebhookLogEntry {
  id: number;
  method: string;
  channel: string | null;
  headers: string;
  body: string | null;
  created_at: string;
}

export interface WebhookLogsPage {
  items: WebhookLogEntry[];
  total: number;
  limit: number;
  offset: number;
}
```

- [ ] **Step 2: Axios client + API functions**

```typescript
// frontend/apis/client.ts
import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/dashboard/api",
});
```

Same-origin by design (see the spec) — no `withCredentials` needed; the browser sends the session cookie automatically for same-origin requests.

```typescript
// frontend/apis/auth.ts
import { isAxiosError } from "axios";
import { apiClient } from "@/apis/client";
import type { CurrentUser } from "@/types/responses/auth";

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const response = await apiClient.get<CurrentUser>("/me");
    return response.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) {
      return null;
    }
    throw error;
  }
}
```

```typescript
// frontend/apis/events.ts
import { apiClient } from "@/apis/client";
import type { EventSummary, EventTimeseries } from "@/types/responses/events";

export async function listEvents(): Promise<EventSummary[]> {
  const response = await apiClient.get<EventSummary[]>("/events");
  return response.data;
}

export async function getEventTimeseries(
  slug: string,
): Promise<EventTimeseries> {
  const response = await apiClient.get<EventTimeseries>(
    `/events/${encodeURIComponent(slug)}/timeseries`,
  );
  return response.data;
}

export async function deleteEvent(slug: string): Promise<void> {
  await apiClient.delete(`/events/${encodeURIComponent(slug)}`);
}
```

```typescript
// frontend/apis/webhook-logs.ts
import { apiClient } from "@/apis/client";
import type { WebhookLogsPage } from "@/types/responses/webhook-logs";

export async function listWebhookLogs(
  limit: number,
  offset: number,
): Promise<WebhookLogsPage> {
  const response = await apiClient.get<WebhookLogsPage>("/webhook-logs", {
    params: { limit, offset },
  });
  return response.data;
}

export async function deleteWebhookLog(id: number): Promise<void> {
  await apiClient.delete(`/webhook-logs/${id}`);
}

export async function clearWebhookLogs(): Promise<void> {
  await apiClient.delete("/webhook-logs");
}
```

- [ ] **Step 3: Write the failing test for the auth-check hook**

```tsx
// frontend/tests/hooks/use-require-auth.test.tsx
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as authApi from "@/apis/auth";
import { useRequireAuth } from "@/hooks/use-require-auth";

describe("useRequireAuth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- jsdom's location isn't reassignable by default; tests override it directly
    delete window.location;
    window.location = { href: "" } as Location;
  });

  it("returns the authenticated user when the session is valid", async () => {
    vi.spyOn(authApi, "getCurrentUser").mockResolvedValue({
      email: "chester@example.com",
    });

    const { result } = renderHook(() => useRequireAuth());

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "authenticated",
        user: { email: "chester@example.com" },
      }),
    );
  });

  it("navigates to /dashboard/login when there is no session", async () => {
    vi.spyOn(authApi, "getCurrentUser").mockResolvedValue(null);
    window.location = { href: "" } as Location;

    renderHook(() => useRequireAuth());

    await waitFor(() => expect(window.location.href).toBe("/dashboard/login"));
  });
});
```

This needs `@testing-library/react` — check whether it's already a devDependency (the Storybook/Vitest setup may have pulled it in transitively); if not, add it: `pnpm add -D @testing-library/react`.

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run tests/hooks/use-require-auth.test.tsx`
Expected: FAIL — `@/hooks/use-require-auth` doesn't exist yet.

- [ ] **Step 5: Implement the hook**

```typescript
// frontend/hooks/use-require-auth.ts
"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/apis/auth";
import type { CurrentUser } from "@/types/responses/auth";

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: CurrentUser }
  | { status: "unauthenticated" };

export function useRequireAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    getCurrentUser().then((user) => {
      if (cancelled) return;
      if (user) {
        setState({ status: "authenticated", user });
      } else {
        setState({ status: "unauthenticated" });
        window.location.href = "/dashboard/login";
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
```

Note this deliberately does **not** use `useTransition` — that's for marking user-triggered updates (button clicks, pagination, deletes — see Tasks 8–9) as non-urgent; this is a passive on-mount fetch, a different pattern.

Also note: the redirect target is `window.location.href`, not Next's router — `/dashboard/login` is a FastAPI route the Next app doesn't own, so this must be a real browser navigation, not a client-side route transition (see Global Constraints).

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run tests/hooks/use-require-auth.test.tsx`
Expected: PASS (2/2)

- [ ] **Step 7: Format, lint, typecheck**

```bash
cd frontend
pnpm exec prettier . --write
pnpm lint
pnpm exec tsc --noEmit
cd ..
```

- [ ] **Step 8: Commit**

```bash
git add frontend/apis frontend/types frontend/hooks frontend/tests frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(frontend): add API client and session auth-check hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Home / event list page

**Files:**
- Modify: `frontend/app/page.tsx`

**Interfaces:**
- Consumes: `useRequireAuth()`, `listEvents()` (Task 6).
- Produces: the real `/dashboard` home page, replacing the `create-next-app` scaffold.

- [ ] **Step 1: Replace the scaffold page**

```tsx
// frontend/app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listEvents } from "@/apis/events";
import { useRequireAuth } from "@/hooks/use-require-auth";
import type { EventSummary } from "@/types/responses/events";

export default function DashboardHomePage() {
  const auth = useRequireAuth();
  const [events, setEvents] = useState<EventSummary[] | null>(null);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    let cancelled = false;
    listEvents().then((result) => {
      if (!cancelled) setEvents(result);
    });
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  if (auth.status !== "authenticated") {
    return null;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-2xl">Argus Dashboard</h1>
        <span className="text-muted-foreground text-sm">{auth.user.email}</span>
      </div>
      <ul className="mt-6 flex flex-col gap-2">
        {events === null && <li>Loading…</li>}
        {events?.length === 0 && <li>No events yet.</li>}
        {events?.map((event) => (
          <li key={event.event_slug}>
            <Link
              href={`/events?slug=${encodeURIComponent(event.event_slug)}`}
              className="text-primary underline underline-offset-4"
            >
              {event.event_name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

Note the `Link href` is `/events?slug=...`, **not** `/dashboard/events?slug=...` — `basePath` (set in Task 5) auto-prepends `/dashboard` to Next-owned internal links; writing the prefix explicitly here would double it (see Global Constraints).

- [ ] **Step 2: Update the metadata title** (still says "Create Next App" from the scaffold)

```tsx
// frontend/app/layout.tsx — change only the metadata export
export const metadata: Metadata = {
  title: "Argus Dashboard",
  description: "Registration analytics dashboard for Argus",
};
```

- [ ] **Step 3: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier . --write
pnpm lint
pnpm exec tsc --noEmit
pnpm build
cd ..
```

- [ ] **Step 4: End-to-end check against the real backend**

```bash
uv run pytest tests/test_docker_integration.py -v -k serves_frontend_shell
```

Expected: still passes (the shell test from Task 5 now serves this real page instead of the scaffold — confirm the response still comes back 200 `text/html`; it doesn't assert on content, so no change needed there, but this is a good moment to also manually check the built `frontend/out/index.html` contains `Argus Dashboard` somewhere, confirming the real page — not a stale cached scaffold — is what actually got built).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/page.tsx frontend/app/layout.tsx
git commit -m "feat(frontend): build the real event-list home page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: shadcn chart + event detail page

**Files:**
- Modify: `frontend/package.json`, `frontend/components.json`-managed additions (via CLI)
- Create: `frontend/components/ui/chart.tsx` (generated), `frontend/components/event-chart.tsx`
- Create: `frontend/app/events/page.tsx`
- Create: `frontend/stories/components/event-chart.stories.tsx`
- Test: `frontend/tests/components/event-chart.test.tsx`

**Interfaces:**
- Consumes: `getEventTimeseries(slug)` (Task 6), `EventTimeseries` type.
- Produces: `/dashboard/events?slug=<slug>` — the event-detail page with a line chart.

- [ ] **Step 1: Add the chart component via the shadcn CLI**

```bash
cd frontend && pnpm dlx shadcn@latest add chart
cd ..
```

This respects the project's existing `components.json` (`style: "base-sera"`, Base UI primitives, `@/` aliases) and adds `recharts` to `package.json` plus `components/ui/chart.tsx`. Don't hand-author this file — let the CLI generate it, then read what it produced before writing `EventChart` below, since the exact `ChartContainer`/`ChartConfig`/`ChartTooltip` API surface should be read from the real generated file, not assumed. If the CLI's output differs meaningfully from the usage shown in Step 3 below, adapt Step 3 to match what was actually generated rather than forcing the assumed API.

- [ ] **Step 2: Write the failing component test**

```tsx
// frontend/tests/components/event-chart.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventChart } from "@/components/event-chart";
import type { EventTimeseries } from "@/types/responses/events";

const sample: EventTimeseries = {
  event: {
    event_slug: "test-event",
    event_name: "Test Event",
    channel: "SPRINT",
    start_at: "2026-04-25T01:00:00",
    capacity: 30,
  },
  labels: ["2026-04-15", "2026-04-16"],
  datasets: [
    { name: "Total", data: [1, 3] },
    { name: "一般票", data: [1, 2] },
  ],
  start_marker_label: "2026-04-25",
};

describe("EventChart", () => {
  it("renders a line for every dataset", () => {
    render(<EventChart timeseries={sample} />);
    // Recharts renders each Line as an SVG <path>; assert one exists per dataset
    // by checking the chart container rendered at all — refine this assertion
    // once you can see the actual DOM shape ChartContainer produces.
    expect(screen.getByRole("img", { hidden: true })).toBeTruthy();
  });
});
```

This is a starting sketch — Recharts' exact rendered DOM (SVG structure) should be inspected once `EventChart` exists to write a real, specific assertion (e.g. counting rendered `.recharts-line` elements equals `sample.datasets.length`) rather than the placeholder role-based check above. Do not leave a test that merely asserts the component didn't crash — assert on the *dataset count* actually rendering as lines, since that's the behavior this component exists to provide.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/event-chart.test.tsx`
Expected: FAIL — `@/components/event-chart` doesn't exist yet.

- [ ] **Step 3: Implement `EventChart`**

```tsx
// frontend/components/event-chart.tsx
"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { EventTimeseries } from "@/types/responses/events";

interface EventChartProps {
  timeseries: EventTimeseries;
}

export function EventChart({ timeseries }: EventChartProps) {
  const data = timeseries.labels.map((label, index) => {
    const point: Record<string, string | number> = { label };
    for (const dataset of timeseries.datasets) {
      point[dataset.name] = dataset.data[index];
    }
    return point;
  });

  const config: ChartConfig = Object.fromEntries(
    timeseries.datasets.map((dataset, index) => [
      dataset.name,
      { label: dataset.name, color: `var(--chart-${(index % 5) + 1})` },
    ]),
  );

  return (
    <ChartContainer config={config} className="h-80 w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {timeseries.event.capacity !== null && (
          <ReferenceLine
            y={timeseries.event.capacity}
            strokeDasharray="4 4"
            label="Capacity"
          />
        )}
        {timeseries.start_marker_label !== null && (
          <ReferenceLine
            x={timeseries.start_marker_label}
            strokeDasharray="4 4"
            label="Event start"
          />
        )}
        {timeseries.datasets.map((dataset, index) => (
          <Line
            key={dataset.name}
            dataKey={dataset.name}
            stroke={`var(--color-${dataset.name})`}
            strokeWidth={dataset.name === "Total" ? 2 : 1}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
```

Verify this against the actual generated `components/ui/chart.tsx` from Step 1 — adjust prop names/`ChartConfig` shape if the real generated file differs from what's assumed here.

- [ ] **Step 4: Storybook story** (required by `frontend/AGENTS.md` for reusable components)

```tsx
// frontend/stories/components/event-chart.stories.tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { EventChart } from "@/components/event-chart";

const meta: Meta<typeof EventChart> = {
  title: "Components/EventChart",
  component: EventChart,
  tags: ["ai-generated"],
};

export default meta;
type Story = StoryObj<typeof EventChart>;

export const Default: Story = {
  args: {
    timeseries: {
      event: {
        event_slug: "test-event",
        event_name: "Test Event",
        channel: "SPRINT",
        start_at: "2026-04-25T01:00:00",
        capacity: 30,
      },
      labels: ["2026-04-15", "2026-04-16", "2026-04-17"],
      datasets: [
        { name: "Total", data: [1, 3, 5] },
        { name: "一般票", data: [1, 2, 3] },
        { name: "早鳥票", data: [0, 1, 2] },
      ],
      start_marker_label: "2026-04-25",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { hidden: true })).toBeTruthy();
  },
};
```

Match `stories/components/ui/button.stories.tsx`'s established pattern (`tags: ["ai-generated"]`, a smoke-check `play` function) rather than inventing a new story convention.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/event-chart.test.tsx`
Expected: PASS

- [ ] **Step 6: Event detail page**

```tsx
// frontend/app/events/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getEventTimeseries } from "@/apis/events";
import { EventChart } from "@/components/event-chart";
import { useRequireAuth } from "@/hooks/use-require-auth";
import type { EventTimeseries } from "@/types/responses/events";

export default function EventDetailPage() {
  const auth = useRequireAuth();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");
  const [timeseries, setTimeseries] = useState<EventTimeseries | null>(null);

  useEffect(() => {
    if (auth.status !== "authenticated" || !slug) return;
    let cancelled = false;
    getEventTimeseries(slug).then((result) => {
      if (!cancelled) setTimeseries(result);
    });
    return () => {
      cancelled = true;
    };
  }, [auth.status, slug]);

  if (auth.status !== "authenticated") {
    return null;
  }

  if (!slug) {
    return <p className="p-6">No event selected.</p>;
  }

  if (!timeseries) {
    return <p className="p-6">Loading…</p>;
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-heading text-2xl">{timeseries.event.event_name}</h1>
      <EventChart timeseries={timeseries} />
    </main>
  );
}
```

`useSearchParams()` in a static-export app is fine at runtime (client-side reads `window.location.search`) — this is exactly why the query-string approach was chosen over a dynamic path segment (see the spec's "Routing" section).

- [ ] **Step 7: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier . --write
pnpm lint
pnpm exec tsc --noEmit
pnpm build
cd ..
```

- [ ] **Step 8: Extend the Docker integration test**

```python
# tests/test_docker_integration.py — extend test_docker_image_serves_frontend_shell
# or add a sibling assertion
def test_docker_image_serves_event_detail_page(api_url: str) -> None:
    """The event-detail page (query-string based) is served at /dashboard/events."""
    with httpx.Client(base_url=api_url, timeout=5) as client:
        response = client.get("/dashboard/events", params={"slug": "anything"})
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
```

- [ ] **Step 9: Run the full suite**

Run: `uv run pytest tests/ -v` and `cd frontend && pnpm exec vitest run && cd ..`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/components.json \
        frontend/components/ui/chart.tsx frontend/components/event-chart.tsx \
        frontend/app/events frontend/stories/components/event-chart.stories.tsx \
        frontend/tests/components/event-chart.test.tsx \
        tests/test_docker_integration.py
git commit -m "feat(frontend): add event detail page with Recharts-based chart

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Webhook logs page

**Files:**
- Create: `frontend/app/webhook-logs/page.tsx`
- Modify: `tests/test_docker_integration.py`

**Interfaces:**
- Consumes: `listWebhookLogs`, `deleteWebhookLog`, `clearWebhookLogs` (Task 6).
- Produces: `/dashboard/webhook-logs` — paginated log viewer with per-row and bulk delete.

- [ ] **Step 1: Implement the page**

```tsx
// frontend/app/webhook-logs/page.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import {
  clearWebhookLogs,
  deleteWebhookLog,
  listWebhookLogs,
} from "@/apis/webhook-logs";
import { useRequireAuth } from "@/hooks/use-require-auth";
import type { WebhookLogsPage } from "@/types/responses/webhook-logs";

const PAGE_SIZE = 50;

export default function WebhookLogsPage() {
  const auth = useRequireAuth();
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<WebhookLogsPage | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = () => {
    listWebhookLogs(PAGE_SIZE, offset).then(setPage);
  };

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status, offset]);

  if (auth.status !== "authenticated") {
    return null;
  }

  const handleDelete = (id: number) => {
    startTransition(async () => {
      await deleteWebhookLog(id);
      reload();
    });
  };

  const handleClearAll = () => {
    startTransition(async () => {
      await clearWebhookLogs();
      reload();
    });
  };

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-2xl">Webhook Logs</h1>
        <button
          type="button"
          onClick={handleClearAll}
          disabled={isPending}
          className="text-destructive text-sm underline"
        >
          Clear all
        </button>
      </div>
      {page === null && <p className="mt-4">Loading…</p>}
      {page && (
        <>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr>
                <th>Method</th>
                <th>Channel</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.method}</td>
                  <td>{item.channel ?? "—"}</td>
                  <td>{item.created_at}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={isPending}
                      className="text-destructive underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </button>
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} of{" "}
              {page.total}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= page.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
```

Per-row delete and clear-all each get their own `useTransition` call site sharing one `isPending`/`startTransition` pair here since they're mutually exclusive user actions on the same page (not two *independent* concurrent operations) — this matches the spirit of `frontend/AGENTS.md`'s "each independent async operation gets its own `useTransition`" rule without over-splitting a single page's sequential actions into unnecessary separate transitions. If reviewing this, judge whether that reading holds; split into separate `useTransition` pairs if delete and clear-all ever need to be triggerable concurrently.

- [ ] **Step 2: Format, lint, typecheck, build**

```bash
cd frontend
pnpm exec prettier . --write
pnpm lint
pnpm exec tsc --noEmit
pnpm build
cd ..
```

- [ ] **Step 3: Extend the Docker integration test**

```python
# tests/test_docker_integration.py
def test_docker_image_serves_webhook_logs_page(api_url: str) -> None:
    """The webhook-logs page is served at /dashboard/webhook-logs."""
    with httpx.Client(base_url=api_url, timeout=5) as client:
        response = client.get("/dashboard/webhook-logs")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
```

- [ ] **Step 4: Run the full suite**

Run: `uv run pytest tests/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/webhook-logs tests/test_docker_integration.py
git commit -m "feat(frontend): add webhook logs page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Local-dev proxy

**Files:**
- Modify: `frontend/next.config.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `next dev` (typically `localhost:3000`) transparently proxies `/dashboard/api/*` to a locally-running backend (`localhost:8000`), so the browser only ever talks to one origin, in dev exactly as in prod.

- [ ] **Step 1: Add dev-only rewrites**

```typescript
// frontend/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/dashboard",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // `rewrites()` has no effect on `output: "export"` production builds
  // (static export can't proxy at request time) — it only applies to
  // `next dev`, which is exactly where it's needed: `next dev` and
  // `uvicorn` run as separate processes on different ports locally, so
  // without this the browser would see a cross-origin request.
  async rewrites() {
    return [
      {
        source: "/dashboard/api/:path*",
        destination: "http://localhost:8000/dashboard/api/:path*",
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify manually**

```bash
# Terminal 1
uv run uvicorn argus.main:app --host 0.0.0.0 --port 8000
# Terminal 2
cd frontend && pnpm dev
```

Visit `http://localhost:3000/dashboard` — confirm the page loads and, once logged in, its `/dashboard/api/*` calls succeed (check the browser network tab shows requests to `localhost:3000/dashboard/api/*`, proxied server-side to `localhost:8000`, not a direct cross-origin browser request).

- [ ] **Step 3: Format, lint, build** (confirm the dev-only `rewrites()` doesn't affect the static export build)

```bash
cd frontend
pnpm exec prettier . --write
pnpm lint
pnpm build
cd ..
```

- [ ] **Step 4: Commit**

```bash
git add frontend/next.config.ts
git commit -m "feat(frontend): proxy API calls to the backend during next dev

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end verification (merge gate)

**Files:** none — verification only.

**Interfaces:** none.

- [ ] **Step 1: Full test suite**

```bash
uv run ruff check src tests
uv run ruff format --check src tests
uv run pytest tests/ -v
cd frontend
pnpm exec prettier --check .
pnpm lint
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm build
cd ..
```

Expected: everything clean/passing.

- [ ] **Step 2: Fresh-clone, real-container smoke test**

```bash
docker build --tag argus-e2e-check .
docker run --rm -d --name argus-e2e \
  -p 18000:8000 \
  -e SESSION_SECRET=e2e-check-secret \
  -e WEBHOOK_SECRET=e2e-check-webhook \
  -e ALLOWED_EMAILS=e2e@example.com \
  -e DATABASE_URL=sqlite:////tmp/e2e.db \
  argus-e2e-check

sleep 2
curl -sf http://localhost:18000/health
curl -sf http://localhost:18000/dashboard | grep -qi "argus dashboard" && echo "home OK"
curl -sf "http://localhost:18000/dashboard/events?slug=anything" | grep -qi "html" && echo "event detail OK"
curl -sf http://localhost:18000/dashboard/webhook-logs | grep -qi "webhook logs" && echo "webhook logs OK"

docker stop argus-e2e
docker image rm argus-e2e-check
```

Expected: `/health` returns 200, and each grep prints its "OK" line — confirming the real built image serves all three new/swapped pages correctly, not just that the test suite's mocked assertions pass.

- [ ] **Step 3: Confirm nothing else regressed**

Re-read `tests/test_kktix_handler.py`, `tests/test_report.py`, `tests/test_health.py` results from Step 1's full suite run — webhook ingestion and the Discord report feature must be untouched by anything in this plan (nothing in Tasks 1–10 touches `kktix/` or `report.py`). If the full suite passed, this is already confirmed; this step is a sanity re-read, not new test-writing.

- [ ] **Step 4: This is the merge gate**

Only once Steps 1–3 all pass does this branch merge to `main` (per the spec's "Sequencing & Merge Gate"). No commit is made in this task — it's a verification gate, not a code change.

---

## Self-Review

**1. Spec coverage:**
- Repository layout (Task 1) ✓, including the `AGENTS.md`/`CLAUDE.md` discoverability fix agreed on after the spec was written (not in the spec file itself — a refinement made during plan-writing; worth back-porting a note into the spec, but not blocking).
- Docker/CI/package-data (Tasks 2–3) ✓
- `/dashboard/api/me` (Task 4) — the spec left this as "a call for whoever implements the plan"; this plan makes the call to add it, since Task 6's auth-check hook needs *some* endpoint and this is the smallest, most direct one. ✓
- FastAPI static serving + route retirement (Task 5) ✓
- Frontend pages + auth check (Tasks 6–9) ✓
- Local-dev proxy (Task 10) ✓
- Sequencing & merge gate (Task 11) ✓
- Explicitly deferred in the spec (git history preservation, frontend test-suite CI step beyond build/lint, deleting the old `argus-dashboard` dir) — correctly not present anywhere in this plan.

**2. Placeholder scan:** The one intentionally-loose spot is Task 8 Step 1 (shadcn CLI generates `chart.tsx` — its exact contents aren't hand-specified, by design, since it's a real generated file to be read rather than guessed) and the sketch-quality test assertions flagged explicitly as such in Tasks 4 and 8 (both call out, in their own text, exactly what needs filling in once the real API/DOM shape is visible, rather than silently leaving something vague). Every other step has literal, complete code.

**3. Type consistency check:**
- `EventSummary`, `EventTimeseries`, `TimeseriesDataset` (Task 6) match their usage in Tasks 7–8 exactly (same field names, same nullability).
- `CurrentUser` (Task 6) matches `useRequireAuth`'s `AuthState` union and both pages' `auth.user.email` access.
- `WebhookLogsPage`/`WebhookLogEntry` (Task 6) match Task 9's usage (`page.items`, `page.total`, `item.id`/`.method`/`.channel`/`.created_at`).
- `getCurrentUser`, `listEvents`, `getEventTimeseries`, `deleteEvent`, `listWebhookLogs`, `deleteWebhookLog`, `clearWebhookLogs` — every call site in Tasks 7–9 matches the signature defined in Task 6.
- `useRequireAuth()`'s returned `AuthState` shape (`{status: "loading"|"authenticated"|"unauthenticated"}`) is destructured identically in Tasks 7, 8, 9.
- The `basePath` gotcha (Global Constraints) is applied consistently: Task 7's `Link href` and Task 8's route path both omit the `/dashboard` prefix; `useRequireAuth`'s redirect (Task 6) includes it, correctly, since it's a `window.location` navigation, not a Next `Link`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-15-frontend-monorepo-integration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
