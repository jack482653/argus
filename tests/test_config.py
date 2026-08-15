from argus import config


def test_settings_from_env_parses_frontend_origins_as_tuple(monkeypatch):
    """Split a comma-separated FRONTEND_ORIGINS into a tuple, trimming blanks."""
    monkeypatch.setenv(
        "FRONTEND_ORIGINS", "http://localhost:3000, https://dash.example.com"
    )

    settings = config.Settings.from_env()

    assert settings.frontend_origins == (
        "http://localhost:3000",
        "https://dash.example.com",
    )


def test_settings_from_env_defaults_frontend_origins_to_empty(monkeypatch):
    """No FRONTEND_ORIGINS configured means no cross-origin frontend is allowed."""
    monkeypatch.delenv("FRONTEND_ORIGINS", raising=False)

    settings = config.Settings.from_env()

    assert settings.frontend_origins == ()


def test_settings_from_env_reads_frontend_redirect_url(monkeypatch):
    """FRONTEND_REDIRECT_URL configures where the SPA OAuth callback lands."""
    monkeypatch.setenv(
        "FRONTEND_REDIRECT_URL", "http://localhost:3000/auth/callback"
    )

    settings = config.Settings.from_env()

    assert settings.frontend_redirect_url == "http://localhost:3000/auth/callback"


def test_settings_from_env_defaults_auth_token_ttl_to_one_day(monkeypatch):
    """AUTH_TOKEN_TTL_SECONDS defaults to 86400 seconds (24h) when unset."""
    monkeypatch.delenv("AUTH_TOKEN_TTL_SECONDS", raising=False)

    settings = config.Settings.from_env()

    assert settings.auth_token_ttl_seconds == 86400
