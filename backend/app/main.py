"""FastAPI application entry point (CONTRACT §5, §11).

Wires the whole backend together:

* constructs the :class:`fastapi.FastAPI` app with project metadata and the
  contract-mandated documentation URLs (``/docs``, ``/redoc``, OpenAPI at
  ``/api/openapi.json``);
* configures CORS from :data:`settings.BACKEND_CORS_ORIGINS`;
* mounts **every** resource router under :data:`settings.API_V1_PREFIX`
  (``/api``) — each router declares only its own resource prefix, so the final
  paths look like ``/api/auth/login``;
* on startup (via the :func:`lifespan` async context manager) creates all
  tables from ``Base.metadata`` and idempotently seeds an empty database;
* exposes lightweight ``GET /health`` and ``GET /`` endpoints; and
* installs a couple of global exception handlers so clients always receive a
  clean, consistently-shaped JSON error body.

Run with::

    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.database import Base, engine

# Import every router module. Each module defines an ``APIRouter`` named
# ``router`` carrying its own resource prefix (e.g. ``/auth``, ``/tickets``);
# ``main.py`` is solely responsible for adding the shared ``/api`` prefix.
from app.routers import (
    audit,
    auth,
    comments,
    dashboard,
    departments,
    tickets,
    users,
)

logger = logging.getLogger("app.main")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Application startup/shutdown lifecycle.

    On startup:

    1. Create all tables declared on ``Base.metadata`` (no-op for tables that
       already exist), so a fresh database is usable without running Alembic.
    2. Seed an empty database with the canonical demo data. ``seed_if_empty`` is
       imported lazily here (rather than at module import time) to avoid a
       circular import: the seed module imports models/services that themselves
       depend on the application package.

    Any failure during seeding is logged but not re-raised, so a transient seed
    problem never prevents the API itself from coming up.
    """
    # Ensure the full schema exists before anything tries to query it.
    Base.metadata.create_all(bind=engine)

    try:
        # Imported lazily to dodge import cycles (see docstring above). The seed
        # module is authored by a sibling agent and exposes ``seed_if_empty()``,
        # which opens its own session and returns early on an already-seeded DB.
        from app.seed import seed_if_empty

        seed_if_empty()
    except Exception:  # noqa: BLE001 - never let seeding crash startup
        logger.exception("Database seeding failed during startup; continuing without seed data")

    yield

    # No explicit shutdown work is required: request-scoped sessions are closed
    # by ``get_db`` and the engine's connection pool is torn down by the runtime.


app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "REST API for the Internal Ticketing & Support Management System. "
        "All resource endpoints live under the `/api` prefix."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    lifespan=lifespan,
)


# --- CORS -----------------------------------------------------------------
# Browsers need explicit permission to call the API from the SPA origins. The
# allowed origins come from settings (overridable via the BACKEND_CORS_ORIGINS
# environment variable); credentials, all methods and all headers are allowed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Global exception handlers --------------------------------------------
# Normalise the two most common error families into a consistent JSON envelope
# (``{"detail": ...}``) so the frontend can render errors uniformly.
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    _request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Return a clean JSON body for any raised ``HTTPException``.

    Preserves the original status code, ``detail`` payload and any custom
    headers (e.g. ``WWW-Authenticate`` from the auth routes).
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Return a 422 with both a human-readable message and the raw error list.

    Keeping the structured ``errors`` array lets the frontend surface
    field-level validation feedback, while ``detail`` provides a stable,
    user-facing summary string.
    """
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Request validation failed",
            "errors": exc.errors(),
        },
    )


# --- Routers --------------------------------------------------------------
# Mount every resource router under the shared API prefix. Final paths combine
# this prefix with each router's own resource prefix, e.g. ``/api/auth/login``.
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(users.router, prefix=settings.API_V1_PREFIX)
app.include_router(departments.router, prefix=settings.API_V1_PREFIX)
app.include_router(tickets.router, prefix=settings.API_V1_PREFIX)
app.include_router(comments.router, prefix=settings.API_V1_PREFIX)
app.include_router(audit.router, prefix=settings.API_V1_PREFIX)
app.include_router(dashboard.router, prefix=settings.API_V1_PREFIX)


# --- Service endpoints ----------------------------------------------------
@app.get("/health", tags=["health"], summary="Liveness/readiness probe")
async def health() -> dict[str, str]:
    """Lightweight health check used by Docker/compose and load balancers."""
    return {"status": "ok"}


@app.get("/", tags=["root"], summary="API root / discovery")
async def root() -> dict[str, str]:
    """Root endpoint pointing clients at the interactive documentation."""
    return {"name": settings.PROJECT_NAME, "docs": "/docs"}
