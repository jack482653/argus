from authlib.integrations.starlette_client import OAuth
from fastapi import HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from argus import config


# Module-level OAuth instance, lazily configured
_oauth: OAuth | None = None
_GOOGLE_SERVER_METADATA_URL = (
    "https://accounts.google.com/.well-known/openid-configuration"
)


def get_oauth() -> OAuth:
    """Lazy init so tests can run without the env vars set."""
    global _oauth
    if _oauth is None:
        oauth = OAuth()
        oauth.register(
            name="google",
            server_metadata_url=_GOOGLE_SERVER_METADATA_URL,
            client_id=config.secrets.require_google_oauth_client_id(),
            client_secret=config.secrets.require_google_oauth_client_secret(),
            client_kwargs={"scope": "openid email profile"},
        )
        _oauth = oauth
    return _oauth


def reset_oauth() -> None:
    """For tests."""
    global _oauth
    _oauth = None


_API_TOKEN_SALT = "argus-spa-api-token"


def issue_api_token(email: str) -> str:
    """Mint a signed, time-limited API token for the separated SPA frontend."""
    serializer = URLSafeTimedSerializer(
        config.secrets.require_session_secret(), salt=_API_TOKEN_SALT
    )
    return serializer.dumps({"email": email})


def verify_api_token(token: str) -> str | None:
    """Verify a signed API token and return its email, or None if invalid/expired."""
    serializer = URLSafeTimedSerializer(
        config.secrets.require_session_secret(), salt=_API_TOKEN_SALT
    )
    try:
        data = serializer.loads(token, max_age=config.settings.auth_token_ttl_seconds)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(data, dict):
        return None
    return data.get("email")


def is_email_allowed(email: str) -> bool:
    if not email:
        return False
    return email.lower() in {e.lower() for e in config.settings.allowed_emails}


async def require_login(request: Request) -> str:
    """FastAPI dependency for API routes. Returns email; raises 401 if not authed."""
    user = request.session.get("user")
    if not user or not user.get("email") or not is_email_allowed(user["email"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="login_required"
        )
    return user["email"]
