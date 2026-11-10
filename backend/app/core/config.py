"""Application settings.

Centralised configuration loaded from environment variables (and an optional
``.env`` file) via ``pydantic-settings``. A single module-level ``settings``
instance is exported and imported everywhere else in the backend.
"""

from __future__ import annotations

from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed application configuration.

    Values are read from the process environment first and fall back to the
    defaults defined here. A ``.env`` file (if present at the backend root) is
    also consulted. See ``.env.example`` for the documented variables.
    """

    # --- Project metadata --------------------------------------------------
    PROJECT_NAME: str = "Internal Ticketing & Support Management System"
    API_V1_PREFIX: str = "/api"

    # --- Database ----------------------------------------------------------
    # Default uses the docker-compose service host ``db``. For local runs
    # outside docker, override with ``localhost`` (see .env.example).
    DATABASE_URL: str = "postgresql://postgres:postgres@db:5432/ticketing"

    # --- Security / JWT ----------------------------------------------------
    # Dev-only default secret. MUST be overridden in any real deployment.
    SECRET_KEY: str = "dev-secret-change-me-please-override-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # --- CORS --------------------------------------------------------------
    # Accepts either a JSON/Python list or a comma-separated string from env.
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(
        cls, value: Union[str, List[str]]
    ) -> Union[str, List[str]]:
        """Allow ``BACKEND_CORS_ORIGINS`` to be a comma-separated string.

        Environment variables are always strings, so a value such as
        ``"http://a.com,http://b.com"`` is split into a list. A bracketed
        JSON-style string is left untouched so pydantic can parse it natively,
        and an already-parsed list is returned as-is.
        """
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                # Defer to pydantic's JSON parsing for list-literal strings.
                return stripped
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value


# Module-level singleton imported throughout the application.
settings = Settings()
