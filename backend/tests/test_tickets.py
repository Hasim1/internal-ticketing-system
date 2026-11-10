"""Ticket lifecycle and RBAC-visibility tests (CONTRACT §5 "Tickets").

Scenarios covered:

* An employee creates a ticket (201) which they own.
* An employee cannot read another employee's ticket — visibility is enforced as a
  404 so the ticket's existence is not leaked.
* An admin can read every ticket regardless of owner/assignee.
* A support user can change the status of a ticket they handle (any transition),
  and the change is reflected on read-back.
"""

from __future__ import annotations

from typing import Dict

from fastapi.testclient import TestClient

API = "/api"


def _create_ticket(
    client: TestClient,
    headers: Dict[str, str],
    *,
    title: str = "Laptop will not boot",
    description: str = "My laptop shows a black screen on startup.",
    category: str = "hardware",
    priority: str = "high",
) -> dict:
    """Create a ticket via the API and return the response body (asserting 201)."""

    response = client.post(
        f"{API}/tickets",
        headers=headers,
        json={
            "title": title,
            "description": description,
            "category": category,
            "priority": priority,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_employee_creates_ticket(
    client: TestClient, employee_user, auth_headers
) -> None:
    """An employee can open a ticket; it starts ``open`` and is owned by them."""

    headers = auth_headers(client, "employee1@company.com", "Employee123!")
    body = _create_ticket(client, headers)

    assert body["status"] == "open"
    assert body["priority"] == "high"
    assert body["category"] == "hardware"
    assert body["assigned_to"] is None
    # ``created_by`` is the compact UserBrief of the authenticated employee.
    assert body["created_by"]["id"] == employee_user.id
    assert body["created_by"]["email"] == "employee1@company.com"
    assert body["resolved_at"] is None
    assert body["closed_at"] is None


def test_employee_sees_only_own_ticket_in_list(
    client: TestClient, employee_user, other_employee_user, auth_headers
) -> None:
    """The list endpoint is RBAC-scoped: an employee sees only their own tickets."""

    owner_headers = auth_headers(client, "employee1@company.com", "Employee123!")
    other_headers = auth_headers(client, "employee2@company.com", "Employee123!")

    _create_ticket(client, owner_headers, title="Owner's ticket")

    # The owner sees exactly their one ticket.
    owner_list = client.get(f"{API}/tickets", headers=owner_headers)
    assert owner_list.status_code == 200, owner_list.text
    owner_body = owner_list.json()
    assert owner_body["total"] == 1
    assert len(owner_body["items"]) == 1
    assert owner_body["items"][0]["title"] == "Owner's ticket"

    # The other employee sees none of the owner's tickets.
    other_list = client.get(f"{API}/tickets", headers=other_headers)
    assert other_list.status_code == 200, other_list.text
    assert other_list.json()["total"] == 0


def test_employee_cannot_read_other_employees_ticket(
    client: TestClient, employee_user, other_employee_user, auth_headers
) -> None:
    """Reading another employee's ticket by id returns 404 (existence hidden)."""

    owner_headers = auth_headers(client, "employee1@company.com", "Employee123!")
    other_headers = auth_headers(client, "employee2@company.com", "Employee123!")

    ticket = _create_ticket(client, owner_headers)
    ticket_id = ticket["id"]

    # The owner can read it...
    owner_read = client.get(f"{API}/tickets/{ticket_id}", headers=owner_headers)
    assert owner_read.status_code == 200, owner_read.text

    # ...but an unrelated employee gets a 404, not the ticket.
    other_read = client.get(f"{API}/tickets/{ticket_id}", headers=other_headers)
    assert other_read.status_code == 404, other_read.text


def test_admin_can_see_all_tickets(
    client: TestClient,
    admin_user,
    employee_user,
    other_employee_user,
    auth_headers,
) -> None:
    """An admin's visibility spans every ticket, regardless of creator."""

    emp1_headers = auth_headers(client, "employee1@company.com", "Employee123!")
    emp2_headers = auth_headers(client, "employee2@company.com", "Employee123!")
    admin_headers = auth_headers(client, "admin@company.com", "Admin123!")

    t1 = _create_ticket(client, emp1_headers, title="Ticket from employee 1")
    t2 = _create_ticket(client, emp2_headers, title="Ticket from employee 2")

    # List: admin sees both tickets.
    listing = client.get(f"{API}/tickets", headers=admin_headers)
    assert listing.status_code == 200, listing.text
    body = listing.json()
    assert body["total"] == 2
    seen_ids = {item["id"] for item in body["items"]}
    assert seen_ids == {t1["id"], t2["id"]}

    # Single read: admin can fetch either ticket by id.
    for ticket_id in (t1["id"], t2["id"]):
        read = client.get(f"{API}/tickets/{ticket_id}", headers=admin_headers)
        assert read.status_code == 200, read.text


def test_support_can_change_status_of_handled_ticket(
    client: TestClient,
    admin_user,
    support_user,
    employee_user,
    auth_headers,
) -> None:
    """A support user assigned to a ticket can drive its status through transitions."""

    emp_headers = auth_headers(client, "employee1@company.com", "Employee123!")
    admin_headers = auth_headers(client, "admin@company.com", "Admin123!")
    support_headers = auth_headers(client, "support1@company.com", "Support123!")

    ticket = _create_ticket(client, emp_headers)
    ticket_id = ticket["id"]

    # Admin assigns the ticket to the support user; assigning an open ticket
    # auto-transitions it to ``in_progress`` (per the service).
    assign = client.patch(
        f"{API}/tickets/{ticket_id}/assign",
        headers=admin_headers,
        json={"assigned_to_id": support_user.id},
    )
    assert assign.status_code == 200, assign.text
    assigned_body = assign.json()
    assert assigned_body["assigned_to"]["id"] == support_user.id
    assert assigned_body["status"] == "in_progress"

    # The support user resolves the ticket; ``resolved_at`` gets stamped.
    resolve = client.patch(
        f"{API}/tickets/{ticket_id}/status",
        headers=support_headers,
        json={"status": "resolved"},
    )
    assert resolve.status_code == 200, resolve.text
    resolved_body = resolve.json()
    assert resolved_body["status"] == "resolved"
    assert resolved_body["resolved_at"] is not None

    # Read-back through support confirms the persisted status.
    read = client.get(f"{API}/tickets/{ticket_id}", headers=support_headers)
    assert read.status_code == 200, read.text
    assert read.json()["status"] == "resolved"


def test_employee_cannot_change_arbitrary_status(
    client: TestClient, employee_user, auth_headers
) -> None:
    """A creating employee may not perform an arbitrary status transition (403).

    Employees are limited to ``open -> cancelled`` and ``resolved -> closed``; any
    other transition (here ``open -> in_progress``) must be rejected.
    """

    headers = auth_headers(client, "employee1@company.com", "Employee123!")
    ticket = _create_ticket(client, headers)

    response = client.patch(
        f"{API}/tickets/{ticket['id']}/status",
        headers=headers,
        json={"status": "in_progress"},
    )
    assert response.status_code == 403, response.text


def test_employee_can_cancel_own_open_ticket(
    client: TestClient, employee_user, auth_headers
) -> None:
    """The creating employee may cancel their own ticket while it is ``open``."""

    headers = auth_headers(client, "employee1@company.com", "Employee123!")
    ticket = _create_ticket(client, headers)

    response = client.patch(
        f"{API}/tickets/{ticket['id']}/status",
        headers=headers,
        json={"status": "cancelled"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"
