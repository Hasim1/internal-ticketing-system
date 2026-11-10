"""Authentication flow tests (CONTRACT §5 "Auth").

Covers the happy path through the three auth endpoints:

* ``POST /api/auth/register`` creates an ``employee`` account (201).
* ``POST /api/auth/login`` returns a bearer token plus the user envelope.
* ``GET  /api/auth/me`` returns the caller's profile when given the token, and
  rejects unauthenticated/garbage-token requests with 401.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

API = "/api"


def test_register_creates_employee(client: TestClient, seed_department) -> None:
    """Registering returns 201 and always assigns the ``employee`` role."""

    response = client.post(
        f"{API}/auth/register",
        json={
            "full_name": "New Hire",
            "email": "newhire@company.com",
            "password": "Password123!",
            "department_id": seed_department.id,
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == "newhire@company.com"
    assert body["full_name"] == "New Hire"
    # Self-registration is always an employee regardless of any client input.
    assert body["role"] == "employee"
    assert body["is_active"] is True
    assert body["department_id"] == seed_department.id
    # The password (or its hash) must never be serialized back to the client.
    assert "password" not in body
    assert "hashed_password" not in body


def test_register_duplicate_email_conflicts(client: TestClient) -> None:
    """A second registration with the same email returns 409."""

    payload = {
        "full_name": "Dup User",
        "email": "dup@company.com",
        "password": "Password123!",
    }
    first = client.post(f"{API}/auth/register", json=payload)
    assert first.status_code == 201, first.text

    second = client.post(f"{API}/auth/register", json=payload)
    assert second.status_code == 409, second.text


def test_login_returns_token_and_user(
    client: TestClient, admin_user, login
) -> None:
    """Valid credentials yield a bearer token and the embedded user."""

    response = client.post(
        f"{API}/auth/login",
        json={"email": "admin@company.com", "password": "Admin123!"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str) and body["access_token"]
    assert body["user"]["email"] == "admin@company.com"
    assert body["user"]["role"] == "admin"


def test_login_wrong_password_unauthorized(client: TestClient, admin_user) -> None:
    """An incorrect password is rejected with 401."""

    response = client.post(
        f"{API}/auth/login",
        json={"email": "admin@company.com", "password": "wrong-password"},
    )
    assert response.status_code == 401, response.text


def test_login_unknown_email_unauthorized(client: TestClient) -> None:
    """An unknown email is rejected with 401 (no account-existence leak)."""

    response = client.post(
        f"{API}/auth/login",
        json={"email": "ghost@company.com", "password": "whatever123"},
    )
    assert response.status_code == 401, response.text


def test_me_with_token_returns_profile(
    client: TestClient, admin_user, auth_headers
) -> None:
    """``GET /me`` with a valid token returns the authenticated user's profile."""

    headers = auth_headers(client, "admin@company.com", "Admin123!")
    response = client.get(f"{API}/auth/me", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == admin_user.id
    assert body["email"] == "admin@company.com"
    assert body["role"] == "admin"


def test_me_without_token_unauthorized(client: TestClient) -> None:
    """``GET /me`` without an Authorization header is rejected with 401."""

    response = client.get(f"{API}/auth/me")
    assert response.status_code == 401, response.text


def test_me_with_invalid_token_unauthorized(client: TestClient) -> None:
    """``GET /me`` with a malformed bearer token is rejected with 401."""

    response = client.get(
        f"{API}/auth/me",
        headers={"Authorization": "Bearer not-a-real-jwt"},
    )
    assert response.status_code == 401, response.text


def test_register_then_login_then_me_roundtrip(
    client: TestClient, seed_department
) -> None:
    """End-to-end: register, log in with those credentials, then read ``/me``."""

    register = client.post(
        f"{API}/auth/register",
        json={
            "full_name": "Round Trip",
            "email": "roundtrip@company.com",
            "password": "Password123!",
            "department_id": seed_department.id,
        },
    )
    assert register.status_code == 201, register.text

    login = client.post(
        f"{API}/auth/login",
        json={"email": "roundtrip@company.com", "password": "Password123!"},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]

    me = client.get(
        f"{API}/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "roundtrip@company.com"
    assert me.json()["role"] == "employee"
