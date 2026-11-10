"""Shared pytest fixtures for the backend test-suite.

The fixtures here build a fully self-contained FastAPI application backed by an
in-memory SQLite database so the tests never touch PostgreSQL and never depend on
external state. Each test gets a freshly-created schema (``Base.metadata.create_all``
on a single shared in-memory connection), guaranteeing isolation and determinism.

Design notes
------------
* **Self-contained app.** Rather than importing ``app.main`` (which may be owned by
  a sibling agent and which runs Postgres-oriented startup/seed logic), we assemble
  an equivalent app from the same routers, mounting every router under
  ``settings.API_V1_PREFIX`` ("/api") exactly as the contract specifies. This keeps
  the request paths identical to production (e.g. ``/api/auth/login``) while keeping
  the tests hermetic.
* **SQLite + StaticPool.** A single in-memory connection is shared across the whole
  app via ``StaticPool`` with ``check_same_thread=False`` so the schema created in
  the fixture is visible to every request handled by the ``TestClient``.
* **Enum columns.** All enum columns are declared with ``native_enum=False`` in the
  models, so they store/read plain lowercase strings and work unchanged on SQLite.
* **Dependency override.** ``app.database.get_db`` is overridden to yield sessions
  bound to the test engine; the same callable object that the routers depend on is
  used as the override key so every router (which imports ``get_db`` from
  ``app.dependencies.auth``, re-exported from ``app.database``) is redirected.
"""

from __future__ import annotations

from typing import Callable, Dict, Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Importing the models package registers every model on ``Base.metadata`` so that
# ``create_all`` builds the full schema and string-based relationships resolve.
import app.models  # noqa: F401  (import for side effects: model registration)
from app.core.security import hash_password
from app.database import Base, get_db
from app.models.department import Department
from app.models.enums import UserRole
from app.models.user import User

# Every router that the production app mounts. Imported individually so the test
# app mirrors the real routing table without importing ``app.main``.
from app.routers import (
    audit,
    auth,
    comments,
    dashboard,
    departments,
    tickets,
    users,
)

# The contract mounts all routers under this prefix; keep it in lock-step with prod.
API_PREFIX = "/api"

# Canonical passwords used by the seeded fixture users. Exposed so tests can log in.
ADMIN_PASSWORD = "Admin123!"
MANAGER_PASSWORD = "Manager123!"
SUPPORT_PASSWORD = "Support123!"
EMPLOYEE_PASSWORD = "Employee123!"


# --------------------------------------------------------------------------- #
# Engine / session: one in-memory SQLite database shared for a single test.    #
# --------------------------------------------------------------------------- #
@pytest.fixture()
def engine():
    """Create a fresh in-memory SQLite engine with the full schema.

    ``StaticPool`` + ``check_same_thread=False`` ensure the single underlying
    connection (and therefore the created tables) is shared across every session
    and across the TestClient's request thread. The schema is dropped at the end
    so each test starts from a clean slate.
    """

    test_engine = create_engine(
        "sqlite://",  # pure in-memory database
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=test_engine)
    try:
        yield test_engine
    finally:
        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()


@pytest.fixture()
def TestingSessionLocal(engine) -> sessionmaker:
    """A session factory bound to the per-test in-memory engine."""

    return sessionmaker(
        bind=engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        class_=Session,
        future=True,
    )


@pytest.fixture()
def db_session(TestingSessionLocal) -> Generator[Session, None, None]:
    """A direct session for arranging/asserting DB state inside tests."""

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


# --------------------------------------------------------------------------- #
# Application + client with the get_db dependency overridden.                  #
# --------------------------------------------------------------------------- #
@pytest.fixture()
def app(TestingSessionLocal) -> FastAPI:
    """Assemble the test FastAPI app with every router mounted under ``/api``.

    The real ``get_db`` dependency is overridden to yield sessions from the test
    engine, so all request handling runs against the in-memory database.
    """

    test_app = FastAPI(title="Ticketing API (test)")

    for router in (
        auth.router,
        users.router,
        departments.router,
        tickets.router,
        comments.router,
        audit.router,
        dashboard.router,
    ):
        test_app.include_router(router, prefix=API_PREFIX)

    def override_get_db() -> Generator[Session, None, None]:
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    test_app.dependency_overrides[get_db] = override_get_db
    return test_app


@pytest.fixture()
def client(app: FastAPI) -> Generator[TestClient, None, None]:
    """A FastAPI ``TestClient`` for issuing HTTP requests against the test app."""

    with TestClient(app) as test_client:
        yield test_client


# --------------------------------------------------------------------------- #
# Seed data: a department and one user per role, inserted directly via the ORM.#
# --------------------------------------------------------------------------- #
@pytest.fixture()
def seed_department(db_session: Session) -> Department:
    """Insert and return a single ``IT`` department used by seeded users."""

    department = Department(name="IT", description="Information Technology")
    db_session.add(department)
    db_session.commit()
    db_session.refresh(department)
    return department


def _make_user(
    db_session: Session,
    *,
    full_name: str,
    email: str,
    password: str,
    role: UserRole,
    department_id: int | None,
) -> User:
    """Create, persist, and return a user with a hashed password."""

    user = User(
        full_name=full_name,
        email=email,
        hashed_password=hash_password(password),
        role=role,
        department_id=department_id,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def admin_user(db_session: Session, seed_department: Department) -> User:
    """A seeded admin account (``admin@company.com`` / ``Admin123!``)."""

    return _make_user(
        db_session,
        full_name="Admin User",
        email="admin@company.com",
        password=ADMIN_PASSWORD,
        role=UserRole.ADMIN,
        department_id=seed_department.id,
    )


@pytest.fixture()
def manager_user(db_session: Session, seed_department: Department) -> User:
    """A seeded manager account (``manager@company.com`` / ``Manager123!``)."""

    return _make_user(
        db_session,
        full_name="Manager User",
        email="manager@company.com",
        password=MANAGER_PASSWORD,
        role=UserRole.MANAGER,
        department_id=seed_department.id,
    )


@pytest.fixture()
def support_user(db_session: Session, seed_department: Department) -> User:
    """A seeded support account (``support1@company.com`` / ``Support123!``)."""

    return _make_user(
        db_session,
        full_name="Support One",
        email="support1@company.com",
        password=SUPPORT_PASSWORD,
        role=UserRole.SUPPORT,
        department_id=seed_department.id,
    )


@pytest.fixture()
def employee_user(db_session: Session, seed_department: Department) -> User:
    """A seeded employee account (``employee1@company.com`` / ``Employee123!``)."""

    return _make_user(
        db_session,
        full_name="Employee One",
        email="employee1@company.com",
        password=EMPLOYEE_PASSWORD,
        role=UserRole.EMPLOYEE,
        department_id=seed_department.id,
    )


@pytest.fixture()
def other_employee_user(db_session: Session, seed_department: Department) -> User:
    """A second, unrelated employee account used for cross-tenant isolation tests."""

    return _make_user(
        db_session,
        full_name="Employee Two",
        email="employee2@company.com",
        password=EMPLOYEE_PASSWORD,
        role=UserRole.EMPLOYEE,
        department_id=seed_department.id,
    )


# --------------------------------------------------------------------------- #
# Auth helpers: log a user in and build the Authorization header.              #
# --------------------------------------------------------------------------- #
@pytest.fixture()
def login() -> Callable[[TestClient, str, str], str]:
    """Return a helper that logs in via ``POST /api/auth/login`` and returns the JWT.

    Usage::

        token = login(client, "admin@company.com", "Admin123!")
    """

    def _login(client: TestClient, email: str, password: str) -> str:
        response = client.post(
            f"{API_PREFIX}/auth/login",
            json={"email": email, "password": password},
        )
        assert response.status_code == 200, response.text
        return response.json()["access_token"]

    return _login


@pytest.fixture()
def auth_headers(
    login: Callable[[TestClient, str, str], str],
) -> Callable[[TestClient, str, str], Dict[str, str]]:
    """Return a helper producing a ``Bearer`` Authorization header for a user.

    Usage::

        headers = auth_headers(client, "admin@company.com", "Admin123!")
        client.get("/api/auth/me", headers=headers)
    """

    def _headers(client: TestClient, email: str, password: str) -> Dict[str, str]:
        token = login(client, email, password)
        return {"Authorization": f"Bearer {token}"}

    return _headers
