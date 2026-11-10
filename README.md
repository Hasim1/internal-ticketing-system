# Internal Ticketing & Support Management System

[![Backend](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20TS-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Database](https://img.shields.io/badge/database-PostgreSQL%2016-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Python](https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](#license)

> A full-stack internal help desk. Employees raise support tickets, a support team
> triages and resolves them, managers track their department, and admins run the whole platform — all
> with role-based access control, an append-only audit trail, and analytics dashboards.

---

## Table of Contents

- [Overview](#overview)
- [Why this is useful in companies](#why-this-is-useful-in-companies)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Screenshots](#screenshots)
- [User Roles & Permissions](#user-roles--permissions)
- [Ticket Lifecycle](#ticket-lifecycle)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
  - [Option A — Docker (recommended)](#option-a--docker-recommended)
  - [Option B — Manual (no Docker)](#option-b--manual-no-docker)
- [Default Login Accounts](#default-login-accounts)
- [Running Tests](#running-tests)
- [Future Improvements](#future-improvements)
- [License](#license)

---

## Overview

The **Internal Ticketing & Support Management System** is a self-contained help desk application that
companies can run internally to manage IT, HR, Finance, and operational support requests. It pairs a
**FastAPI** REST backend (PostgreSQL + SQLAlchemy 2.0) with a **React 18 + TypeScript** single-page
application styled with **Tailwind CSS**.

Every action that matters — creating a ticket, reassigning it, changing its status or priority,
promoting a user, deleting a department — is authorised against a four-tier role model and recorded in
an append-only audit log. Managers and admins get Recharts-powered dashboards summarising volume,
priority mix, category breakdown, and support-agent performance.

The whole stack boots from a single `docker compose up --build`, ships with an idempotent seed of
realistic demo data (7 users across 6 departments and 10 tickets with comments, status history, and
audit entries), and exposes interactive Swagger docs out of the box.

---

## Why this is useful in companies

Most organisations drown support requests in shared inboxes and chat threads, where issues get lost,
ownership is ambiguous, and there is no record of who did what or how long anything took. This system
replaces that chaos with a structured, auditable workflow: every request becomes a tracked ticket with
a clear owner, priority, category, and status; internal support staff can collaborate using private
notes invisible to the requester; managers can see their department's backlog at a glance; and
administrators get an append-only audit trail for compliance and accountability. The result is faster
resolution times, measurable SLAs, clear accountability, and the operational visibility leadership needs
to staff and prioritise a support function — all from an app that costs nothing to self-host.

---

## Features

### Authentication & RBAC
- JWT (HS256) authentication with bcrypt-hashed passwords.
- Self-service registration (always provisioned as `employee`) and login.
- Four roles — **employee**, **support**, **manager**, **admin** — enforced server-side via reusable
  FastAPI dependencies (`require_admin`, `require_manager_or_admin`, `require_support_or_admin`).
- Active/inactive account gating: deactivated users are rejected at the auth layer.
- Frontend route guards (`ProtectedRoute`, `RoleRoute`) mirror the backend rules so the UI only ever
  shows what a user is allowed to do.

### Ticket Workflow
- Create, read, update, assign, re-prioritise, transition, and delete tickets.
- Six-state lifecycle (`open → in_progress → waiting_for_user → resolved → closed`, plus `cancelled`).
- Self-assignment for support agents; managers/admins can assign to any support user.
- Automatic side effects: assigning an `open` ticket moves it to `in_progress`; resolving stamps
  `resolved_at`; closing stamps `closed_at`.
- Full status-history trail recorded on every transition.

### Comments & Internal Notes
- Threaded comments on each ticket, ordered chronologically.
- **Internal notes** (`is_internal=true`) visible only to support/manager/admin — employees never see
  them and cannot create them.

### Audit Logs
- Append-only audit trail covering ticket, user, department, and comment events plus logins.
- Captures actor, action, entity type/id, and before/after values.
- Admin-only, filterable browser (by user, action, entity type, and date range) with pagination.

### Dashboard Analytics
- Role-scoped KPI cards (total, open, in progress, waiting, resolved, closed, cancelled, critical,
  unassigned, average resolution hours).
- Recharts visualisations: tickets by status, by priority, and by category.
- Manager/admin **support performance** report (assigned vs. resolved vs. average resolution time per
  agent).

### Admin Management
- User management: create users, edit profiles, change roles, activate/deactivate (cannot self-deactivate).
- Department management: create, update, and delete departments (delete blocked while users or tickets
  reference them).

### Search, Filter & Pagination
- Server-side filtering on tickets (status, priority, category, department, assignee, creator, free-text
  search, date range) with configurable sorting.
- Consistent paginated envelope (`items`, `total`, `page`, `page_size`, `pages`) on every list endpoint.
- Debounced search and reusable pagination controls on the frontend.

---

## Tech Stack

| Layer            | Technology |
|------------------|------------|
| **Backend**      | Python 3.12, FastAPI 0.111, SQLAlchemy 2.0 (declarative `Mapped`), Pydantic v2 + pydantic-settings |
| **Auth**         | python-jose (JWT, HS256), passlib + bcrypt |
| **Database**     | PostgreSQL 16, psycopg2-binary. Tables are created at startup with SQLAlchemy `create_all`; Alembic is configured but no migration scripts exist yet |
| **Server**       | Uvicorn (ASGI) |
| **Testing**      | pytest + httpx |
| **Frontend**     | React 18, TypeScript, Vite 5, Tailwind CSS 3 |
| **Frontend libs**| Axios, React Router v6, Recharts, lucide-react |
| **Infra**        | Docker, Docker Compose, Nginx (SPA serving) |

---

## Screenshots

No screenshots have been added yet. To see the interface, run the stack locally
(see [Local Setup](#local-setup)) and sign in with one of the
[default accounts](#default-login-accounts).

---

## User Roles & Permissions

| Capability | Employee | Support | Manager | Admin |
|---|:---:|:---:|:---:|:---:|
| Register / log in | ✅ | ✅ | ✅ | ✅ |
| Create tickets | ✅ | ✅ | ✅ | ✅ |
| View **own** tickets | ✅ | ✅ | ✅ | ✅ |
| View tickets assigned to me / unassigned | — | ✅ | ✅ | ✅ |
| View **department** tickets | — | — | ✅ | ✅ |
| View **all** tickets | — | — | — | ✅ |
| Comment on visible tickets | ✅ | ✅ | ✅ | ✅ |
| Create / read **internal** notes | — | ✅ | ✅ | ✅ |
| Assign / self-assign tickets | — | ✅ (self) | ✅ (any support) | ✅ |
| Change ticket priority | — | ✅ | ✅ | ✅ |
| Change ticket status | creator: close/cancel | ✅ any | ✅ any | ✅ any |
| Edit ticket details | creator (while open) | ✅ | ✅ | ✅ |
| Delete tickets | — | — | — | ✅ |
| Manage users (CRUD, roles, activation) | — | — | — | ✅ |
| Manage departments | — | — | — | ✅ |
| List users (own department) | — | — | ✅ | ✅ (all) |
| View audit logs | — | — | — | ✅ |
| Support-performance report | — | — | ✅ | ✅ |

**Visibility rules in brief**

- **Employee** — only tickets they created.
- **Support** — tickets assigned to them, unassigned tickets, and tickets they created.
- **Manager** — all tickets in their own department (plus their own).
- **Admin** — everything.

---

## Ticket Lifecycle

Tickets move through **six statuses**. New tickets always start at `open`.

| Status | Meaning |
|---|---|
| `open` | Newly created, not yet picked up. |
| `in_progress` | A support agent is actively working it (set automatically on first assignment). |
| `waiting_for_user` | Blocked pending information from the requester. |
| `resolved` | Fix applied; `resolved_at` timestamped. Awaiting requester confirmation. |
| `closed` | Confirmed done; `closed_at` timestamped. Terminal. |
| `cancelled` | Withdrawn / not actioned. Terminal. |

**Typical workflow**

1. **Employee** creates a ticket → `open` (status-history row `null → open`, audit `ticket_created`).
2. **Support** self-assigns (or a manager/admin assigns) → ticket flips to `in_progress`
   (audit `ticket_assigned`).
3. Agent and requester collaborate via comments; internal notes stay private to staff.
4. If more info is needed → `waiting_for_user`; once unblocked → back to `in_progress`.
5. Agent applies a fix → `resolved` (`resolved_at` set).
6. Requester confirms → `closed` (`closed_at` set), **or** an unwanted request is `cancelled`.

Every transition writes a `ticket_status_history` row and a `status_changed` audit entry.

```
 open ──assign──▶ in_progress ──▶ waiting_for_user ──▶ in_progress ──▶ resolved ──▶ closed
   │                                                                                  ▲
   └──────────────────────────── cancelled                  (requester confirms) ────┘
```

---

## Database Schema

The schema has **six tables**. A full ER diagram and column-level reference live in
[`docs/DATABASE.md`](docs/DATABASE.md).

| Table | Purpose | Key relationships |
|---|---|---|
| `users` | Accounts with role, department, and active flag. | `department_id → departments.id`; one-to-many to `tickets` as both creator and assignee. |
| `departments` | Organisational units (IT, HR, Finance, …). | one-to-many to `users` and `tickets`. |
| `tickets` | The core work item. | `created_by_id → users.id`, `assigned_to_id → users.id`, `department_id → departments.id`. |
| `ticket_comments` | Conversation + internal notes on a ticket. | `ticket_id → tickets.id`, `user_id → users.id`. |
| `ticket_status_history` | One row per status transition. | `ticket_id → tickets.id`, `changed_by_id → users.id`. |
| `audit_logs` | Append-only record of significant actions. | `user_id → users.id` (nullable). |

**Relationships at a glance**

- A **user** belongs to one **department** and can create or be assigned many **tickets**.
- A **ticket** has one creator, an optional assignee, an optional department, many **comments**, and
  many **status-history** rows (comments/history cascade-delete with the ticket).
- **Audit logs** reference an optional acting user and an arbitrary entity by `entity_type` + `entity_id`.

> A visual ERD (mermaid `erDiagram`) is included in [`docs/DATABASE.md`](docs/DATABASE.md). Export it to
> `docs/database-erd.png` if you want it embedded as an image.

---

## API Endpoints

All routes are served under the `/api` prefix. Interactive docs: **Swagger `/docs`**, **ReDoc `/redoc`**.
A full request/response reference is in [`docs/API.md`](docs/API.md).

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new `employee`. |
| `POST` | `/api/auth/login` | Public | Obtain a JWT + user profile. |
| `GET`  | `/api/auth/me` | Any | Current authenticated user. |

### Users
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`   | `/api/users` | Admin / Manager | Paginated, filterable user list (managers see own dept). |
| `GET`   | `/api/users/{id}` | Admin / Manager | Fetch a single user. |
| `POST`  | `/api/users` | Admin | Create a user. |
| `PUT`   | `/api/users/{id}` | Admin | Update name/email/department. |
| `PATCH` | `/api/users/{id}/role` | Admin | Change role. |
| `PATCH` | `/api/users/{id}/deactivate` | Admin | Deactivate (not self). |
| `PATCH` | `/api/users/{id}/activate` | Admin | Reactivate. |

### Departments
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/api/departments` | Any | List departments (with counts). |
| `GET`    | `/api/departments/{id}` | Any | Fetch a department. |
| `POST`   | `/api/departments` | Admin | Create a department. |
| `PUT`    | `/api/departments/{id}` | Admin | Update a department. |
| `DELETE` | `/api/departments/{id}` | Admin | Delete (blocked if referenced). |

### Tickets
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/api/tickets` | Any (RBAC-scoped) | Paginated, filterable ticket list. |
| `GET`    | `/api/tickets/{id}` | Any (+ visibility) | Ticket detail with nested actors. |
| `POST`   | `/api/tickets` | Any | Create a ticket. |
| `PUT`    | `/api/tickets/{id}` | Creator/Support/Manager/Admin | Edit ticket fields. |
| `PATCH`  | `/api/tickets/{id}/assign` | Support/Manager/Admin | Assign / self-assign. |
| `PATCH`  | `/api/tickets/{id}/status` | Role-dependent | Transition status. |
| `PATCH`  | `/api/tickets/{id}/priority` | Support/Manager/Admin | Change priority. |
| `DELETE` | `/api/tickets/{id}` | Admin | Delete a ticket. |

### Comments
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`  | `/api/tickets/{ticket_id}/comments` | Any (+ visibility) | List comments (internal hidden from employees). |
| `POST` | `/api/tickets/{ticket_id}/comments` | Any (+ visibility) | Add a comment / internal note. |

### Audit Logs
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/audit-logs` | Admin | Paginated, filterable audit trail. |

### Dashboard
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/dashboard/stats` | Any (RBAC-scoped) | KPI summary. |
| `GET` | `/api/dashboard/tickets-by-status` | Any | Status breakdown chart data. |
| `GET` | `/api/dashboard/tickets-by-priority` | Any | Priority breakdown chart data. |
| `GET` | `/api/dashboard/tickets-by-category` | Any | Category breakdown chart data. |
| `GET` | `/api/dashboard/support-performance` | Manager / Admin | Per-agent performance metrics. |

### Service endpoints (no `/api` prefix)
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness/readiness probe. |
| `GET` | `/` | API root / docs discovery. |
| `GET` | `/docs`, `/redoc` | Swagger UI / ReDoc. |

---

## Project Structure

```
internal-ticketing-system/
├── docker-compose.yml            # db + backend + frontend services
├── .env.example                  # root compose environment template
├── .gitignore
├── README.md
├── LICENSE
├── CONTRACT.md                   # engineering specification (enums, schema, API, RBAC)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DATABASE.md
│   └── screenshots/              # (empty) UI captures go here
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── pytest.ini
│   ├── .env.example
│   ├── app/
│   │   ├── main.py               # FastAPI app, CORS, lifespan, routers
│   │   ├── database.py           # engine, SessionLocal, Base, get_db
│   │   ├── seed.py               # idempotent demo-data seeding
│   │   ├── core/
│   │   │   ├── config.py         # pydantic-settings configuration
│   │   │   └── security.py       # hashing + JWT helpers
│   │   ├── dependencies/
│   │   │   └── auth.py           # get_current_user, require_roles, …
│   │   ├── models/               # SQLAlchemy 2.0 models + enums
│   │   │   ├── enums.py
│   │   │   ├── user.py
│   │   │   ├── department.py
│   │   │   ├── ticket.py
│   │   │   ├── comment.py
│   │   │   ├── status_history.py
│   │   │   └── audit.py
│   │   ├── schemas/              # Pydantic v2 request/response models
│   │   │   ├── auth.py  user.py  department.py  ticket.py
│   │   │   ├── comment.py  audit.py  dashboard.py  common.py
│   │   ├── routers/              # API route handlers (thin)
│   │   │   ├── auth.py  users.py  departments.py  tickets.py
│   │   │   ├── comments.py  audit.py  dashboard.py
│   │   ├── services/             # business logic + side effects
│   │   │   ├── audit_service.py  ticket_service.py  user_service.py
│   │   │   ├── department_service.py  dashboard_service.py
│   │   └── utils/
│   │       └── pagination.py
│   └── tests/                    # pytest suite (httpx client)
│       ├── conftest.py
│       ├── test_auth.py  test_rbac.py  test_tickets.py  test_audit.py
└── frontend/
    ├── Dockerfile  nginx.conf
    ├── package.json  vite.config.ts  tailwind.config.js  tsconfig.json
    ├── .env.example
    ├── index.html
    └── src/
        ├── main.tsx  App.tsx  index.css
        ├── api/                  # typed axios clients per resource
        │   ├── client.ts  auth.ts  users.ts  departments.ts
        │   ├── tickets.ts  comments.ts  audit.ts  dashboard.ts
        ├── types/                # enums.ts, models.ts
        ├── context/              # AuthContext, ToastContext
        ├── hooks/                # useAuth, useDebounce, usePagination
        ├── routes/               # ProtectedRoute, RoleRoute
        ├── layouts/              # DashboardLayout
        ├── components/           # StatusBadge, DataTable, Modal, …
        ├── pages/                # Login, Dashboard, Tickets, Reports, …
        │   └── admin/            # Users, Departments, AuditLogs
        └── utils/                # format.ts, labels.ts
```

---

## Local Setup

### Option A — Docker (recommended)

Prerequisites: Docker and Docker Compose.

```bash
# 1. Clone and enter the project
git clone <your-repo-url>
cd internal-ticketing-system

# 2. Create the compose env file from the template
cp .env.example .env
#    (optionally edit SECRET_KEY and DB credentials)

# 3. Build and start everything
docker compose up --build
```

Once the containers are healthy:

| Service | URL |
|---|---|
| Frontend (SPA) | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| Health check | http://localhost:8000/health |

The backend automatically creates the schema and seeds demo data on first boot (only when the database
is empty), so you can log in immediately with one of the [default accounts](#default-login-accounts).

### Option B — Manual (no Docker)

You'll need Python 3.12, Node.js 20+, and a running PostgreSQL 16 instance.

**Backend**

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Configure environment (point DATABASE_URL at your local Postgres, e.g. localhost)
cp .env.example .env
# edit .env: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ticketing

# Run the API (schema is created and demo data seeded on startup)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> To (re)seed manually against an empty database: `python -m app.seed`.

**Frontend**

```bash
cd frontend
npm install

# Point the SPA at your backend
cp .env.example .env
# .env: VITE_API_URL=http://localhost:8000/api

npm run dev          # serves on http://localhost:5173
```

---

## Default Login Accounts

The seed creates the following accounts (idempotent — skipped if `admin@company.com` already exists).
**These are demo credentials; never ship them to production.**

| Email | Password | Role | Department |
|---|---|---|---|
| `admin@company.com` | `Admin123!` | admin | IT |
| `manager@company.com` | `Manager123!` | manager | IT |
| `support1@company.com` | `Support123!` | support | IT |
| `support2@company.com` | `Support123!` | support | IT |
| `employee1@company.com` | `Employee123!` | employee | Engineering |
| `employee2@company.com` | `Employee123!` | employee | HR |
| `employee3@company.com` | `Employee123!` | employee | Finance |

Departments seeded: **IT, HR, Finance, Engineering, Sales, Operations**, plus **10 demo tickets** with
comments (including internal notes), status history, and audit entries.

---

## Running Tests

The backend ships a pytest suite (auth, RBAC, ticket workflow, audit logging) using an httpx test client.

```bash
cd backend
source .venv/bin/activate           # if not already active
pip install -r requirements.txt     # ensures pytest + httpx are installed
pytest                              # run the whole suite
pytest -v                           # verbose
pytest tests/test_rbac.py           # a single module
```

Configuration lives in `backend/pytest.ini`. Tests use an isolated test database/session (see
`tests/conftest.py`) so they never touch your development data.

---

## Future Improvements

- **Email / Slack notifications** on assignment, status change, and new comments.
- **File attachments** on tickets and comments (object storage + signed URLs).
- **SLA timers & escalations** with configurable per-priority deadlines.
- **Saved views & bulk actions** in the ticket list (multi-assign, multi-close).
- **Full-text search** (Postgres `tsvector` or OpenSearch) across tickets and comments.
- **Refresh tokens & token revocation** for longer, safer sessions.
- **WebSocket live updates** so dashboards and ticket threads update in real time.
- **CSV / PDF exports** of reports and audit logs for compliance.
- **CI/CD pipeline** (lint, type-check, test, build, deploy) and frontend test coverage (Vitest + RTL).

---

## License

Released under the MIT License. See `LICENSE` for details.
