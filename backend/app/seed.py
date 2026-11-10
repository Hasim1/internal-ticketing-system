"""Idempotent database seeding for the Internal Ticketing System.

This module populates a fresh database with a realistic, self-consistent set of
demo data per CONTRACT §8: departments, users (one per role), and ten tickets
spread across every status / priority / category, together with their status
history, comments (including internal-only notes), and audit-log entries.

Two public entry points are exposed:

* :func:`run_seed` — given an open session, create all demo rows and commit.
* :func:`seed_if_empty` — open a fresh :class:`SessionLocal`, return early if the
  canonical admin user already exists, otherwise call :func:`run_seed`.

The lifespan handler in ``app.main`` calls :func:`seed_if_empty` after
``Base.metadata.create_all``. The file is also runnable directly::

    python -m app.seed

which creates the tables and then seeds an empty database.

All timestamps are derived deterministically from a single fixed anchor using
``datetime`` arithmetic (``timedelta``) — never random — so repeated seeds and
test runs are reproducible.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models.audit import AuditLog
from app.models.comment import TicketComment
from app.models.department import Department
from app.models.enums import (
    AuditAction,
    TicketCategory,
    TicketPriority,
    TicketStatus,
    UserRole,
)
from app.models.status_history import TicketStatusHistory
from app.models.ticket import Ticket
from app.models.user import User
from app.services.audit_service import log_action

# The canonical admin email. Its presence is the idempotency guard: if this
# user already exists we assume the database has been seeded.
ADMIN_EMAIL = "admin@company.com"

# A single fixed "now" anchor so every relative timestamp below is deterministic
# and reproducible across runs. Using a concrete instant (rather than
# ``datetime.now``) keeps seeded data stable for tests and demos.
NOW = datetime(2026, 6, 1, 9, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Department definitions
# ---------------------------------------------------------------------------

_DEPARTMENTS: List[Dict[str, str]] = [
    {"name": "IT", "description": "Information Technology and internal support."},
    {"name": "HR", "description": "Human Resources and people operations."},
    {"name": "Finance", "description": "Accounting, payroll, and budgeting."},
    {"name": "Engineering", "description": "Product engineering and development."},
    {"name": "Sales", "description": "Revenue, accounts, and customer acquisition."},
    {"name": "Operations", "description": "Facilities, logistics, and day-to-day ops."},
]


def _seed_departments(db: Session) -> Dict[str, Department]:
    """Create the six departments and return a name -> Department map."""
    departments: Dict[str, Department] = {}
    for spec in _DEPARTMENTS:
        dept = Department(name=spec["name"], description=spec["description"])
        db.add(dept)
        departments[spec["name"]] = dept
    # Flush so every department receives its primary key before users/tickets
    # reference it.
    db.flush()
    return departments


# ---------------------------------------------------------------------------
# User definitions
# ---------------------------------------------------------------------------

_USERS: List[Dict[str, object]] = [
    {
        "key": "admin",
        "full_name": "Alice Administrator",
        "email": "admin@company.com",
        "password": "Admin123!",
        "role": UserRole.ADMIN,
        "department": "IT",
    },
    {
        "key": "manager",
        "full_name": "Marcus Manager",
        "email": "manager@company.com",
        "password": "Manager123!",
        "role": UserRole.MANAGER,
        "department": "IT",
    },
    {
        "key": "support1",
        "full_name": "Sam Support",
        "email": "support1@company.com",
        "password": "Support123!",
        "role": UserRole.SUPPORT,
        "department": "IT",
    },
    {
        "key": "support2",
        "full_name": "Sara Support",
        "email": "support2@company.com",
        "password": "Support123!",
        "role": UserRole.SUPPORT,
        "department": "IT",
    },
    {
        "key": "employee1",
        "full_name": "Evan Engineer",
        "email": "employee1@company.com",
        "password": "Employee123!",
        "role": UserRole.EMPLOYEE,
        "department": "Engineering",
    },
    {
        "key": "employee2",
        "full_name": "Hana Hughes",
        "email": "employee2@company.com",
        "password": "Employee123!",
        "role": UserRole.EMPLOYEE,
        "department": "HR",
    },
    {
        "key": "employee3",
        "full_name": "Felix Ford",
        "email": "employee3@company.com",
        "password": "Employee123!",
        "role": UserRole.EMPLOYEE,
        "department": "Finance",
    },
]


def _seed_users(
    db: Session, departments: Dict[str, Department]
) -> Dict[str, User]:
    """Create all demo users and return a stable key -> User map.

    Each user's password is hashed via :func:`app.core.security.hash_password`.
    A ``user_created`` audit log is recorded for every user (attributed to the
    admin, who is created first).
    """
    users: Dict[str, User] = {}
    for spec in _USERS:
        dept = departments[spec["department"]]  # type: ignore[index]
        user = User(
            full_name=spec["full_name"],  # type: ignore[arg-type]
            email=spec["email"],  # type: ignore[arg-type]
            hashed_password=hash_password(spec["password"]),  # type: ignore[arg-type]
            role=spec["role"],  # type: ignore[arg-type]
            department_id=dept.id,
            is_active=True,
        )
        db.add(user)
        users[spec["key"]] = user  # type: ignore[index]

    # Flush so every user has a primary key before audit logs / tickets
    # reference them.
    db.flush()

    admin = users["admin"]
    for spec in _USERS:
        user = users[spec["key"]]  # type: ignore[index]
        log_action(
            db,
            user_id=admin.id,
            action=AuditAction.USER_CREATED,
            entity_type="user",
            entity_id=user.id,
            old_value=None,
            new_value=f"{user.email} ({user.role.value})",
        )

    return users


# ---------------------------------------------------------------------------
# Ticket definitions
# ---------------------------------------------------------------------------
#
# Each entry is a fully-specified, internally-consistent ticket. Offsets are
# expressed in hours relative to ``NOW`` and converted to absolute timestamps in
# :func:`_seed_tickets`. ``resolved_at`` / ``closed_at`` are only provided for
# tickets that actually reached those lifecycle states.
#
# ``history`` is the ordered list of status transitions; the first transition
# always starts from ``None`` (creation -> open). Each transition carries the
# actor key and an hour offset so the timeline is realistic.
#
# ``comments`` may be public (visible to everyone with ticket access) or
# internal (``is_internal=True``; hidden from employees).

_TICKETS: List[Dict[str, object]] = [
    {
        # 1 — open, unassigned, critical hardware issue.
        "title": "Laptop won't boot after Windows update",
        "description": (
            "After last night's automatic update my laptop is stuck on a black "
            "screen with a spinning cursor and never reaches the login prompt. "
            "I've tried a hard reboot three times with no luck. I have a client "
            "demo at 2pm and need this resolved urgently."
        ),
        "category": TicketCategory.HARDWARE,
        "priority": TicketPriority.CRITICAL,
        "status": TicketStatus.OPEN,
        "department": "Engineering",
        "created_by": "employee1",
        "assigned_to": None,
        "created_offset_h": -6,
        "history": [
            {"old": None, "new": TicketStatus.OPEN, "by": "employee1", "offset_h": -6},
        ],
        "comments": [
            {
                "by": "employee1",
                "text": "Adding that the laptop is a Dell Latitude 7430, asset tag ENG-204.",
                "internal": False,
                "offset_h": -5,
            },
        ],
    },
    {
        # 2 — in_progress, assigned, high software issue.
        "title": "VPN client disconnects every few minutes",
        "description": (
            "The corporate VPN drops roughly every five minutes, interrupting "
            "remote desktop sessions and file transfers. Reconnecting works but "
            "the constant drops make remote work almost unusable."
        ),
        "category": TicketCategory.SOFTWARE,
        "priority": TicketPriority.HIGH,
        "status": TicketStatus.IN_PROGRESS,
        "department": "Engineering",
        "created_by": "employee1",
        "assigned_to": "support1",
        "created_offset_h": -52,
        "history": [
            {"old": None, "new": TicketStatus.OPEN, "by": "employee1", "offset_h": -52},
            {
                "old": TicketStatus.OPEN,
                "new": TicketStatus.IN_PROGRESS,
                "by": "support1",
                "offset_h": -48,
            },
        ],
        "comments": [
            {
                "by": "support1",
                "text": "Picking this up — can you tell me which VPN region you connect to?",
                "internal": False,
                "offset_h": -47,
            },
            {
                "by": "support1",
                "text": "Suspect the EU-West gateway; ticketing networking to confirm packet loss.",
                "internal": True,
                "offset_h": -46,
            },
            {
                "by": "employee1",
                "text": "I connect to EU-West. Thanks for looking into it.",
                "internal": False,
                "offset_h": -45,
            },
        ],
    },
    {
        # 3 — waiting_for_user, assigned, medium account_access.
        "title": "Cannot access shared Finance drive",
        "description": (
            "I'm getting an 'access denied' error when opening the shared "
            "Finance drive (F:). I need it to close out the monthly reports."
        ),
        "category": TicketCategory.ACCOUNT_ACCESS,
        "priority": TicketPriority.MEDIUM,
        "status": TicketStatus.WAITING_FOR_USER,
        "department": "Finance",
        "created_by": "employee3",
        "assigned_to": "support2",
        "created_offset_h": -30,
        "history": [
            {"old": None, "new": TicketStatus.OPEN, "by": "employee3", "offset_h": -30},
            {
                "old": TicketStatus.OPEN,
                "new": TicketStatus.IN_PROGRESS,
                "by": "support2",
                "offset_h": -28,
            },
            {
                "old": TicketStatus.IN_PROGRESS,
                "new": TicketStatus.WAITING_FOR_USER,
                "by": "support2",
                "offset_h": -26,
            },
        ],
        "comments": [
            {
                "by": "support2",
                "text": (
                    "I've requested you be added to the Finance-RW security group. "
                    "Please sign out and back in, then let me know if access works."
                ),
                "internal": False,
                "offset_h": -26,
            },
            {
                "by": "support2",
                "text": "Group change submitted to AD; propagation can take ~30 min.",
                "internal": True,
                "offset_h": -26,
            },
        ],
    },
    {
        # 4 — resolved, assigned, high network issue.
        "title": "Office Wi-Fi extremely slow in east wing",
        "description": (
            "Wi-Fi speeds in the east wing have dropped to under 2 Mbps since "
            "Monday. Video calls are unusable and large uploads time out."
        ),
        "category": TicketCategory.NETWORK,
        "priority": TicketPriority.HIGH,
        "status": TicketStatus.RESOLVED,
        "department": "HR",
        "created_by": "employee2",
        "assigned_to": "support1",
        "created_offset_h": -120,
        "resolved_offset_h": -96,
        "history": [
            {"old": None, "new": TicketStatus.OPEN, "by": "employee2", "offset_h": -120},
            {
                "old": TicketStatus.OPEN,
                "new": TicketStatus.IN_PROGRESS,
                "by": "support1",
                "offset_h": -116,
            },
            {
                "old": TicketStatus.IN_PROGRESS,
                "new": TicketStatus.RESOLVED,
                "by": "support1",
                "offset_h": -96,
            },
        ],
        "comments": [
            {
                "by": "support1",
                "text": (
                    "Found a failing access point (AP-EAST-3). Replaced the unit "
                    "and confirmed speeds back to ~300 Mbps. Marking resolved — "
                    "please reopen if it recurs."
                ),
                "internal": False,
                "offset_h": -96,
            },
            {
                "by": "support1",
                "text": "Faulty AP RMA'd to vendor under warranty; tracking #RMA-88231.",
                "internal": True,
                "offset_h": -95,
            },
        ],
    },
    {
        # 5 — closed, assigned, medium email issue (resolved then closed).
        "title": "Not receiving emails from external domains",
        "description": (
            "Since yesterday I stopped receiving any email from outside the "
            "company. Internal mail works fine. I may be missing important "
            "vendor correspondence."
        ),
        "category": TicketCategory.EMAIL,
        "priority": TicketPriority.MEDIUM,
        "status": TicketStatus.CLOSED,
        "department": "Finance",
        "created_by": "employee3",
        "assigned_to": "support2",
        "created_offset_h": -200,
        "resolved_offset_h": -180,
        "closed_offset_h": -168,
        "history": [
            {"old": None, "new": TicketStatus.OPEN, "by": "employee3", "offset_h": -200},
            {
                "old": TicketStatus.OPEN,
                "new": TicketStatus.IN_PROGRESS,
                "by": "support2",
                "offset_h": -196,
            },
            {
                "old": TicketStatus.IN_PROGRESS,
                "new": TicketStatus.RESOLVED,
                "by": "support2",
                "offset_h": -180,
            },
            {
                "old": TicketStatus.RESOLVED,
                "new": TicketStatus.CLOSED,
                "by": "employee3",
                "offset_h": -168,
            },
        ],
        "comments": [
            {
                "by": "support2",
                "text": (
                    "Your address had been caught by an overly aggressive spam "
                    "rule. I've whitelisted external delivery and replayed the "
                    "quarantined messages to your inbox."
                ),
                "internal": False,
                "offset_h": -180,
            },
            {
                "by": "employee3",
                "text": "All my missing emails came through. Thanks — closing this out.",
                "internal": False,
                "offset_h": -168,
            },
        ],
    },
    {
        # 6 — cancelled, unassigned, low other (cancelled by creator).
        "title": "Request for a second monitor",
        "description": (
            "I'd like a second monitor for my desk to improve productivity when "
            "working with spreadsheets."
        ),
        "category": TicketCategory.OTHER,
        "priority": TicketPriority.LOW,
        "status": TicketStatus.CANCELLED,
        "department": "HR",
        "created_by": "employee2",
        "assigned_to": None,
        "created_offset_h": -72,
        "history": [
            {"old": None, "new": TicketStatus.OPEN, "by": "employee2", "offset_h": -72},
            {
                "old": TicketStatus.OPEN,
                "new": TicketStatus.CANCELLED,
                "by": "employee2",
                "offset_h": -60,
            },
        ],
        "comments": [
            {
                "by": "employee2",
                "text": "Cancelling — facilities already provided a monitor from spare stock.",
                "internal": False,
                "offset_h": -60,
            },
        ],
    },
    {
        # 7 — open, assigned, critical security issue.
        "title": "Suspicious phishing email impersonating the CEO",
        "description": (
            "I received an email that appears to be from our CEO asking me to "
            "purchase gift cards urgently. The sender domain looks spoofed. I "
            "have not clicked anything but wanted to report it immediately."
        ),
        "category": TicketCategory.SECURITY,
        "priority": TicketPriority.CRITICAL,
        "status": TicketStatus.OPEN,
        "department": "Finance",
        "created_by": "employee3",
        "assigned_to": "support1",
        "created_offset_h": -3,
        "history": [
            {"old": None, "new": TicketStatus.OPEN, "by": "employee3", "offset_h": -3},
        ],
        "comments": [
            {
                "by": "support1",
                "text": (
                    "Thanks for reporting — do NOT reply or purchase anything. "
                    "Please forward the original email as an attachment so we can "
                    "analyze the headers."
                ),
                "internal": False,
                "offset_h": -2,
            },
            {
                "by": "support1",
                "text": "Escalating to security team; blocking sender domain at the gateway now.",
                "internal": True,
                "offset_h": -2,
            },
        ],
    },
    {
        # 8 — in_progress, assigned, medium software issue.
        "title": "Design software license expired",
        "description": (
            "Our design suite is showing a 'license expired' banner and switched "
            "to read-only mode. The whole team is blocked from editing assets."
        ),
        "category": TicketCategory.SOFTWARE,
        "priority": TicketPriority.MEDIUM,
        "status": TicketStatus.IN_PROGRESS,
        "department": "Engineering",
        "created_by": "employee1",
        "assigned_to": "support2",
        "created_offset_h": -28,
        "history": [
            {"old": None, "new": TicketStatus.OPEN, "by": "employee1", "offset_h": -28},
            {
                "old": TicketStatus.OPEN,
                "new": TicketStatus.IN_PROGRESS,
                "by": "support2",
                "offset_h": -24,
            },
        ],
        "comments": [
            {
                "by": "support2",
                "text": "Renewal PO is being processed with procurement; expect keys within 24h.",
                "internal": True,
                "offset_h": -22,
            },
        ],
    },
    {
        # 9 — resolved, assigned, low hardware issue.
        "title": "Keyboard has several sticky keys",
        "description": (
            "A few keys on my keyboard (E, R, and spacebar) stick intermittently "
            "and require a firm press. It's slowing down my typing."
        ),
        "category": TicketCategory.HARDWARE,
        "priority": TicketPriority.LOW,
        "status": TicketStatus.RESOLVED,
        "department": "HR",
        "created_by": "employee2",
        "assigned_to": "support1",
        "created_offset_h": -90,
        "resolved_offset_h": -66,
        "history": [
            {"old": None, "new": TicketStatus.OPEN, "by": "employee2", "offset_h": -90},
            {
                "old": TicketStatus.OPEN,
                "new": TicketStatus.IN_PROGRESS,
                "by": "support1",
                "offset_h": -84,
            },
            {
                "old": TicketStatus.IN_PROGRESS,
                "new": TicketStatus.RESOLVED,
                "by": "support1",
                "offset_h": -66,
            },
        ],
        "comments": [
            {
                "by": "support1",
                "text": "Swapped in a new mechanical keyboard from stock. Old one binned.",
                "internal": False,
                "offset_h": -66,
            },
        ],
    },
    {
        # 10 — open, unassigned, high network issue.
        "title": "Printer on 3rd floor offline",
        "description": (
            "The shared printer on the 3rd floor (PRN-3F-02) shows as offline "
            "for everyone and no jobs are printing. Several people need to print "
            "signed documents today."
        ),
        "category": TicketCategory.NETWORK,
        "priority": TicketPriority.HIGH,
        "status": TicketStatus.OPEN,
        "department": "Operations",
        "created_by": "employee1",
        "assigned_to": None,
        "created_offset_h": -10,
        "history": [
            {"old": None, "new": TicketStatus.OPEN, "by": "employee1", "offset_h": -10},
        ],
        "comments": [],
    },
]


def _ts(offset_h: float) -> datetime:
    """Return the absolute timestamp ``offset_h`` hours from the fixed anchor."""
    return NOW + timedelta(hours=offset_h)


def _seed_tickets(
    db: Session,
    users: Dict[str, User],
    departments: Dict[str, Department],
) -> List[Ticket]:
    """Create all demo tickets with history, comments, and audit logs.

    For each ticket this writes:
      * the :class:`Ticket` row (with deterministic created/updated timestamps
        and, where applicable, ``resolved_at`` / ``closed_at``),
      * one :class:`TicketStatusHistory` row per declared transition,
      * a ``ticket_created`` audit log, plus ``ticket_assigned`` /
        ``status_changed`` audit logs mirroring the lifecycle,
      * each declared :class:`TicketComment` with a ``comment_added`` audit log.
    """
    created_tickets: List[Ticket] = []

    for spec in _TICKETS:
        creator = users[spec["created_by"]]  # type: ignore[index]
        assignee_key = spec["assigned_to"]
        assignee = users[assignee_key] if assignee_key else None  # type: ignore[index]
        dept = departments[spec["department"]]  # type: ignore[index]

        created_at = _ts(spec["created_offset_h"])  # type: ignore[arg-type]

        resolved_at = (
            _ts(spec["resolved_offset_h"])  # type: ignore[arg-type]
            if "resolved_offset_h" in spec
            else None
        )
        closed_at = (
            _ts(spec["closed_offset_h"])  # type: ignore[arg-type]
            if "closed_offset_h" in spec
            else None
        )

        # ``updated_at`` reflects the most recent lifecycle touch: the latest of
        # creation, resolution, closure, and the final status transition.
        history: List[Dict[str, object]] = spec["history"]  # type: ignore[assignment]
        last_history_at = _ts(history[-1]["offset_h"])  # type: ignore[arg-type]
        updated_at = max(
            [t for t in (created_at, resolved_at, closed_at, last_history_at) if t]
        )

        ticket = Ticket(
            title=spec["title"],  # type: ignore[arg-type]
            description=spec["description"],  # type: ignore[arg-type]
            status=spec["status"],  # type: ignore[arg-type]
            priority=spec["priority"],  # type: ignore[arg-type]
            category=spec["category"],  # type: ignore[arg-type]
            created_by_id=creator.id,
            assigned_to_id=assignee.id if assignee else None,
            department_id=dept.id,
            created_at=created_at,
            updated_at=updated_at,
            resolved_at=resolved_at,
            closed_at=closed_at,
        )
        db.add(ticket)
        db.flush()  # assign ticket.id for child rows / audit logs
        created_tickets.append(ticket)

        # --- Audit: ticket creation ---------------------------------------
        log_action(
            db,
            user_id=creator.id,
            action=AuditAction.TICKET_CREATED,
            entity_type="ticket",
            entity_id=ticket.id,
            old_value=None,
            new_value=ticket.title,
        )

        # --- Status history + per-transition audit logs -------------------
        assignment_logged = False
        for transition in history:
            actor = users[transition["by"]]  # type: ignore[index]
            old_status = transition["old"]
            new_status = transition["new"]
            transition_at = _ts(transition["offset_h"])  # type: ignore[arg-type]

            db.add(
                TicketStatusHistory(
                    ticket_id=ticket.id,
                    changed_by_id=actor.id,
                    old_status=old_status,  # type: ignore[arg-type]
                    new_status=new_status,  # type: ignore[arg-type]
                    created_at=transition_at,
                )
            )

            # The initial ``None -> open`` transition is implied by creation and
            # is not separately audited as a status change.
            if old_status is None:
                continue

            # If the ticket was assigned and this is the first move off ``open``,
            # record the assignment audit immediately before the status change so
            # the trail reads naturally.
            if assignee is not None and not assignment_logged:
                log_action(
                    db,
                    user_id=actor.id,
                    action=AuditAction.TICKET_ASSIGNED,
                    entity_type="ticket",
                    entity_id=ticket.id,
                    old_value=None,
                    new_value=assignee.email,
                )
                assignment_logged = True

            log_action(
                db,
                user_id=actor.id,
                action=AuditAction.STATUS_CHANGED,
                entity_type="ticket",
                entity_id=ticket.id,
                old_value=old_status.value,  # type: ignore[union-attr]
                new_value=new_status.value,  # type: ignore[union-attr]
            )

        # --- Comments + audit logs ----------------------------------------
        comments: List[Dict[str, object]] = spec.get("comments", [])  # type: ignore[assignment]
        for comment_spec in comments:
            author = users[comment_spec["by"]]  # type: ignore[index]
            comment_at = _ts(comment_spec["offset_h"])  # type: ignore[arg-type]

            db.add(
                TicketComment(
                    ticket_id=ticket.id,
                    user_id=author.id,
                    comment=comment_spec["text"],  # type: ignore[arg-type]
                    is_internal=bool(comment_spec["internal"]),
                    created_at=comment_at,
                )
            )
            log_action(
                db,
                user_id=author.id,
                action=AuditAction.COMMENT_ADDED,
                entity_type="comment",
                entity_id=ticket.id,
                old_value=None,
                new_value=f"comment on ticket #{ticket.id}",
            )

    db.flush()
    return created_tickets


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------


def run_seed(db: Session) -> None:
    """Populate ``db`` with the full demo dataset and commit.

    Creates departments, users, and tickets (with status history, comments, and
    audit logs) in dependency order. The caller is responsible for ensuring the
    database is empty (see :func:`seed_if_empty`); this function does not guard
    against duplicates and will raise on a unique-constraint violation if run
    against an already-seeded database.

    Args:
        db: An open SQLAlchemy session. This function commits the transaction.
    """
    departments = _seed_departments(db)
    users = _seed_users(db, departments)
    _seed_tickets(db, users, departments)
    db.commit()


def seed_if_empty() -> None:
    """Seed the database only if it has not been seeded yet.

    Opens its own :class:`SessionLocal`, returns early (a no-op) when a user with
    email ``admin@company.com`` already exists, and otherwise calls
    :func:`run_seed`. Safe to call on every application startup.
    """
    db = SessionLocal()
    try:
        existing = (
            db.query(User).filter(User.email == ADMIN_EMAIL).first()
        )
        if existing is not None:
            # Already seeded — nothing to do.
            return
        run_seed(db)
    finally:
        db.close()


def main() -> None:
    """Script entry point: create all tables, then seed an empty database."""
    Base.metadata.create_all(bind=engine)
    seed_if_empty()


if __name__ == "__main__":
    main()
