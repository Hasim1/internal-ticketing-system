"""Role-based access-control tests for admin-only surfaces (CONTRACT §4/§5).

These assert the *negative* and *positive* sides of two privileged endpoints:

* ``GET  /api/audit-logs/`` — admin only.
* ``POST /api/users/``      — admin only (user creation).

An employee must be forbidden (403) from both, while an admin is allowed. We also
confirm unauthenticated access is rejected with 401 (authentication precedes
authorization).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

API = "/api"

# These two routes are declared with a trailing slash in their routers
# (``@router.get("/")`` / ``@router.post("/")``), so the full paths include it.
AUDIT_LOGS_PATH = f"{API}/audit-logs/"
USERS_PATH = f"{API}/users/"


def test_employee_forbidden_from_audit_logs(
    client: TestClient, employee_user, auth_headers
) -> None:
    """An employee hitting the admin-only audit-log endpoint receives 403."""

    headers = auth_headers(client, "employee1@company.com", "Employee123!")
    response = client.get(AUDIT_LOGS_PATH, headers=headers)
    assert response.status_code == 403, response.text


def test_manager_forbidden_from_audit_logs(
    client: TestClient, manager_user, auth_headers
) -> None:
    """A manager is also denied the audit log (admin-only, not manager-or-admin)."""

    headers = auth_headers(client, "manager@company.com", "Manager123!")
    response = client.get(AUDIT_LOGS_PATH, headers=headers)
    assert response.status_code == 403, response.text


def test_admin_allowed_audit_logs(
    client: TestClient, admin_user, auth_headers
) -> None:
    """An admin can read the audit log and gets the paginated envelope."""

    headers = auth_headers(client, "admin@company.com", "Admin123!")
    response = client.get(AUDIT_LOGS_PATH, headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    # Standard pagination envelope (CONTRACT §5).
    for key in ("items", "total", "page", "page_size", "pages"):
        assert key in body, f"missing pagination key: {key}"
    assert isinstance(body["items"], list)


def test_audit_logs_unauthenticated_is_401(client: TestClient) -> None:
    """Without a token the audit-log endpoint returns 401, not 403."""

    response = client.get(AUDIT_LOGS_PATH)
    assert response.status_code == 401, response.text


def test_employee_forbidden_from_creating_user(
    client: TestClient, employee_user, seed_department, auth_headers
) -> None:
    """An employee cannot create users (admin-only) — expects 403."""

    headers = auth_headers(client, "employee1@company.com", "Employee123!")
    response = client.post(
        USERS_PATH,
        headers=headers,
        json={
            "full_name": "Should Not Exist",
            "email": "blocked@company.com",
            "password": "Password123!",
            "role": "support",
            "department_id": seed_department.id,
        },
    )
    assert response.status_code == 403, response.text


def test_support_forbidden_from_creating_user(
    client: TestClient, support_user, seed_department, auth_headers
) -> None:
    """A support user likewise cannot create users (admin-only) — expects 403."""

    headers = auth_headers(client, "support1@company.com", "Support123!")
    response = client.post(
        USERS_PATH,
        headers=headers,
        json={
            "full_name": "Should Not Exist",
            "email": "blocked2@company.com",
            "password": "Password123!",
            "role": "employee",
            "department_id": seed_department.id,
        },
    )
    assert response.status_code == 403, response.text


def test_admin_allowed_to_create_user(
    client: TestClient, admin_user, seed_department, auth_headers
) -> None:
    """An admin can create a user with an explicit privileged role (201)."""

    headers = auth_headers(client, "admin@company.com", "Admin123!")
    response = client.post(
        USERS_PATH,
        headers=headers,
        json={
            "full_name": "Created Support",
            "email": "created-support@company.com",
            "password": "Password123!",
            "role": "support",
            "department_id": seed_department.id,
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == "created-support@company.com"
    # Unlike self-registration, admins set the role explicitly.
    assert body["role"] == "support"
    assert "hashed_password" not in body


def test_create_user_unauthenticated_is_401(
    client: TestClient, seed_department
) -> None:
    """Creating a user without a token returns 401 (auth before authz)."""

    response = client.post(
        USERS_PATH,
        json={
            "full_name": "No Auth",
            "email": "noauth@company.com",
            "password": "Password123!",
            "role": "employee",
            "department_id": seed_department.id,
        },
    )
    assert response.status_code == 401, response.text
