# Argus

KKTIX webhook receiver with daily Discord reports and a Google-OAuth-protected dashboard for visualizing registration trends.

## Installation

```bash
git clone https://github.com/sciwork/argus
cd argus
uv sync
```

## Environment Variables

### Secrets

| Variable | Required | Description |
|----------|----------|-------------|
| `WEBHOOK_SECRET` | Yes | KKTIX auth header value |
| `DISCORD_WEBHOOK_<CHANNEL>` | Yes (≥1) | Discord webhook URL per channel, e.g. `DISCORD_WEBHOOK_SPRINT` |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | Google OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | Google OAuth 2.0 client secret |
| `SESSION_SECRET` | Yes | Random ≥32-byte hex string for signing session cookies |

### Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `KKTIX_ORGANIZATION` | — | KKTIX organizer subdomain, e.g. `example` for `example.kktix.cc`; required to auto-fetch event start time and capacity |
| `REPORT_HOUR` | `9` | Report hour |
| `REPORT_MINUTE` | `0` | Report minute |
| `REPORT_TIMEZONE` | `Asia/Taipei` | Report timezone |
| `DATABASE_URL` | `sqlite:///argus.db` | SQLAlchemy SQLite database URL |
| `HEALTHCHECK_DB_TIMEOUT` | `1.0` | `/health` endpoint DB connect timeout in seconds |
| `LOG_LEVEL` | `INFO` | Python application log level |
| `ALLOWED_EMAILS` | — | Comma-separated email allowlist for dashboard access |
| `ARGUS_HTTPS_ONLY` | `0` | Set to `1` to mark session cookies as Secure |
| `FRONTEND_ORIGINS` | — | Comma-separated list of frontend origins allowed to call the API cross-origin (e.g. `http://localhost:3000,https://dashboard.example.com`) |
| `FRONTEND_REDIRECT_URL` | — | Where the SPA OAuth callback redirects after login (with the API token appended as a URL fragment) |
| `AUTH_TOKEN_TTL_SECONDS` | `86400` | Lifetime in seconds of tokens issued to the SPA frontend (default: 24h) |

## Usage

```bash
uv run uvicorn argus.main:app --host 0.0.0.0 --port 8000
```

### Docker Compose

Docker Compose uses SQLite persisted in the `argus-data` volume:

```bash
docker compose up -d
```

## KKTIX Webhook Setup

Configure one endpoint per channel. The channel name (case-insensitive) maps to a `DISCORD_WEBHOOK_<CHANNEL>` env var.

| Field | Value |
|-------|-------|
| URL | `https://your-domain/webhook/kktix/<channel>` |
| Auth header name | `x-kktix-secret` |
| Auth header value | value of `WEBHOOK_SECRET` |

Example: sending to the `sprint` channel →
URL: `https://your-domain/webhook/kktix/sprint`, env var: `DISCORD_WEBHOOK_SPRINT`

## Dashboard

A Google-OAuth-protected web UI for viewing per-event registration time series.

- **Event list:** `/dashboard`
- **Per-event chart:** `/dashboard/events/{slug}` — line chart of Total + each ticket type, with capacity (horizontal dashed) and event start (vertical dashed) reference lines.

### One-time Google OAuth setup

1. Open [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (Application type: **Web application**).
3. Under **Authorized redirect URIs**, add:
   - `http://localhost:8000/dashboard/oauth/callback` (for local dev)
   - `http://localhost:8000/dashboard/oauth/callback/spa` (for local dev, separated SPA frontend)
   - `https://<your-deploy-domain>/dashboard/oauth/callback` (for production)
   - `https://<your-deploy-domain>/dashboard/oauth/callback/spa` (for production, separated SPA frontend)
4. Copy the **Client ID** and **Client secret** into `.env` as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.
5. Generate a session secret:
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```
   Put the output into `.env` as `SESSION_SECRET`.
6. List allowed users in `.env` as `ALLOWED_EMAILS=alice@example.com,bob@example.com`.

### Try it locally

```bash
set -a && source .env && set +a
uv run uvicorn argus.main:app --host 0.0.0.0 --port 8000
# open http://localhost:8000/dashboard
```

You will be redirected to Google to sign in. Only emails in `ALLOWED_EMAILS` are granted access.

### Separated frontend (SPA)

The `argus-dashboard` project (a statically-exported Next.js app, pure
client-side rendering) consumes this backend's `/dashboard/api/*` JSON API
directly, authenticating via a Bearer token instead of the session cookie
used above. See [SPEC.md → SPA Authentication](SPEC.md#spa-authentication-separated-frontend)
for the full flow. Configure `FRONTEND_ORIGINS` and `FRONTEND_REDIRECT_URL`
to enable it.

The legacy server-rendered pages (`/dashboard`, `/dashboard/events/{slug}`,
`/dashboard/webhook-logs`) keep working unchanged and will be removed once
the separated frontend reaches parity.

## Production / Deployment

When deploying (e.g. to Railway):

- **Railway builds the Dockerfile** using `python:3.12-slim-bookworm`, installs the package with `pip install .`, and starts uvicorn via `railway.json` `startCommand`. Railway injects `$PORT` and the start command binds to it.
- **For SQLite, mount a persistent volume** at `/data` and set `DATABASE_URL=sqlite:////data/argus.db`. SQLite written to the container's local filesystem will be wiped on every redeploy.
- **`SESSION_SECRET` is required** — the app refuses to boot without it. Generate with `python -c "import secrets; print(secrets.token_hex(32))"`.
- **Port:** the Dockerfile's `CMD` binds to a fixed port 8000. Railway overrides this via `railway.json`'s `startCommand`, which substitutes its injected `$PORT`. To change the port in non-Railway environments, override the container command (e.g. `docker run … argus-image uvicorn argus.main:app --host 0.0.0.0 --port 9000`).
- **`ARGUS_HTTPS_ONLY=1`** — set this once the deploy URL is HTTPS-only, to add the `Secure` flag to session cookies.
- **Google OAuth redirect URI** must be added in Cloud Console: `https://<your-domain>/dashboard/oauth/callback`.

See [SPEC.md → Deployment](SPEC.md#deployment-railway) for the full Railway walkthrough.

## Development

Copy `.env.example` to `.env` and fill in the values, then source it before running any command:

```bash
uv sync --group dev               # create .venv and install all dependencies
set -a && source .env && set +a

uv run uvicorn argus.main:app --host 0.0.0.0 --port 8000  # start server
uv run pytest tests/              # run tests, including clean Docker builds
uv run ruff check src tests       # lint
uv run ruff format src tests      # format

# Visual inspection of Discord report (sends a real webhook):
ARGUS_MANUAL_TEST=1 uv run pytest tests/test_discord_format_manual.py -v -s
```
