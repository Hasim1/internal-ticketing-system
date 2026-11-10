"""Audit-trail tests (CONTRACT §5 "Audit Logs", §7 services).

The audit side-effects live inside the service layer and are committed atomically
with the mutation they describe. Here we drive a real status change through the API
and assert that a ``status_changed`` audit row is created — verified both through
the admin audit-log API (filtered by action) and directly against the database.
"""

from __future__ import annotations

from typing import Dict

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.enums import AuditAction

API = "/api"


def _open_and_assign_ticket(
    client: TestClient,
    *,
    employee_headers: Dict[str, str],
    admin_headers: Dict[str, str],
    support_user_id: int,
) -> int:
    """Create a ticket as the employee, assign it to support, return its id."""

    create = client.post(
        f"{API}/tickets",
        headers=employee_headers,
        json={
            "title": "Cannot access shared drive",
            "description": "Permission denied when opening the shared drive.",
            "category": "account_access",
            "priority": "medium",
        },
    )
    assert create.status_code == 201, create.text
    ticket_id = create.json()["id"]

    assign = client.patch(
        f"{API}/tickets/{ticket_id}/assign",
        headers=admin_headers,
        json={"assigned_to_id": support_user_id},
    )
    assert assign.status_code == 200, assign.text
    return ticket_id


def test_status_change_writes_status_changed_audit_via_api(
    client: TestClient,
    admin_user,
    support_user,
    employee_user,
    auth_headers,
) -> None:
    """After a status change, the admin audit API exposes a ``status_changed`` row."""

    employee_headers = auth_headers(client, "employee1@company.com", "Employee123!")
    admin_headers = auth_headers(client, "admin@company.com", "Admin123!")
    support_headers = auth_headers(client, "support1@company.com", "Support123!")

    ticket_id = _open_and_assign_ticket(
        client,
        employee_headers=employee_headers,
        admin_headers=admin_headers,
        support_user_id=support_user.id,
    )

    # Support transitions the ticket to ``resolved`` — this is the status change
    # whose audit row we are asserting on.
    status_change = client.patch(
        f"{API}/tickets/{ticket_id}/status",
        headers=support_headers,
        json={"status": "resolved"},
    )
    assert status_change.status_code == 200, status_change.text

    # Query the admin audit-log API filtered to the status_changed action.
    audit_resp = client.get(
        f"{API}/audit-logs/",
        headers=admin_headers,
        params={"action": "status_changed", "entity_type": "ticket"},
    )
    assert audit_resp.status_code == 200, audit_resp.text
    body = audit_resp.json()

    assert body["total"] >= 1
    matching = [
        row
        for row in body["items"]
        if row["action"] == "status_changed" and row["entity_id"] == ticket_id
    ]
    assert matching, f"no status_changed audit row for ticket {ticket_id}: {body}"

    entry = matching[0]
    # The acting user is the support engineer who made the change.
    assert entry["user"] is not None
    assert entry["user"]["id"] == support_user.id
    # old/new values capture the transition (in_progress -> resolved). The audit
    # service stringifies the status; assert on the meaningful status token in a
    # representation-agnostic way (it may render as "resolved" or "TicketStatus.RESOLVED").
    assert "resolved" in entry["new_value"].lower()
    assert "in_progress" in entry["old_value"].lower()


def test_status_change_writes_status_changed_audit_in_db(
    client: TestClient,
    db_session: Session,
    admin_user,
    support_user,
    employee_user,
    auth_headers,
) -> None:
    """The same status change persists a ``status_changed`` row in the database."""

    employee_headers = auth_headers(client, "employee1@company.com", "Employee123!")
    admin_headers = auth_headers(client, "admin@company.com", "Admin123!")
    support_headers = auth_headers(client, "support1@company.com", "Support123!")

    ticket_id = _open_and_assign_ticket(
        client,
        employee_headers=employee_headers,
        admin_headers=admin_headers,
        support_user_id=support_user.id,
    )

    change = client.patch(
        f"{API}/tickets/{ticket_id}/status",
        headers=support_headers,
        json={"status": "resolved"},
    )
    assert change.status_code == 200, change.text

    # Read the audit trail directly: exactly one status_changed row for this ticket.
    rows = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.action == AuditAction.STATUS_CHANGED,
            AuditLog.entity_type == "ticket",
            AuditLog.entity_id == ticket_id,
        )
        .all()
    )
    assert len(rows) == 1
    row = rows[0]
    assert row.user_id == support_user.id
    # The audit service stores the status as text; match the status token in a
    # representation-agnostic way (rendered as either the bare value or
    # "TicketStatus.<MEMBER>").
    assert "in_progress" in row.old_value.lower()
    assert "resolved" in row.new_value.lower()


def test_no_status_change_means_no_status_changed_audit(
    client: TestClient,
    db_session: Session,
    employee_user,
    auth_headers,
) -> None:
    """Merely creating a ticket records ``ticket_created`` but no ``status_changed``.

    This guards against false positives in the audit assertions above by confirming
    a ``status_changed`` row only appears once an actual status transition occurs.
    """

    employee_headers = auth_headers(client, "employee1@company.com", "Employee123!")

    create = client.post(
        f"{API}/tickets",
        headers=employee_headers,
        json={
            "title": "Printer offline",
            "description": "The 3rd-floor printer is not responding.",
            "category": "hardware",
            "priority": "low",
        },
    )
    assert create.status_code == 201, create.text
    ticket_id = create.json()["id"]

    # A ticket_created audit row exists for the new ticket...
    created_rows = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.action == AuditAction.TICKET_CREATED,
            AuditLog.entity_id == ticket_id,
        )
        .all()
    )
    assert len(created_rows) == 1

    # ...but no status_changed row, since no transition has happened yet.
    status_rows = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.action == AuditAction.STATUS_CHANGED,
            AuditLog.entity_id == ticket_id,
        )
        .all()
    )
    assert status_rows == []
