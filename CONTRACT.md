# Engineering Specification — Internal Ticketing & Support Management System

This document is the **engineering contract** the project is built against: a single,
versioned source of truth shared by the backend and the frontend. It pins down the
enums, database models, exact API endpoints, request/response shapes, authorization
rules, and the frontend structure so the two halves of the stack stay in lock-step.

Throughout the codebase you'll find references such as *"(CONTRACT §5)"* — these point
back to the numbered sections below. Polished, reader-facing documentation lives in
[`docs/`](docs/) (`ARCHITECTURE.md`, `API.md`, `DATABASE.md`); this file is the terse,
authoritative spec.

---

## 1. Tech Stack (pinned)

**Backend:** Python 3.12, FastAPI, SQLAlchemy 2.x (declarative), PostgreSQL (psycopg2-binary),
Pydantic v2 + pydantic-settings, python-jose[cryptography] for JWT, passlib[bcrypt] for hashing,
Alembic (configured; no migration scripts yet — tables are created with `create_all`), uvicorn server, pytest + httpx for tests.

**Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS 3, Axios, React Router v6,
Recharts for charts, lucide-react for icons.

**Pinned versions (backend/requirements.txt):**
```
fastapi==0.111.0
uvicorn[standard]==0.30.1
sqlalchemy==2.0.30
psycopg2-binary==2.9.9
pydantic==2.7.1
pydantic-settings==2.3.1
python-jose[cryptography]==3.3.0
passlib==1.7.4
bcrypt==4.0.1
python-multipart==0.0.9
alembic==1.13.1
email-validator==2.1.1
pytest==8.2.0
httpx==0.27.0
```
NOTE: pin `bcrypt==4.0.1` (passlib 1.7.4 breaks with bcrypt>=4.1).

---

## 2. Enums (EXACT string values — stored in DB, sent over API, used in UI)

Defined once in `backend/app/models/enums.py` as `str, Enum` classes. The frontend mirrors
them in `frontend/src/types/enums.ts`.

**UserRole** (column `users.role`): `employee`, `support`, `manager`, `admin`

**TicketStatus** (column `tickets.status`): `open`, `in_progress`, `waiting_for_user`,
`resolved`, `closed`, `cancelled`

**TicketPriority** (column `tickets.priority`): `low`, `medium`, `high`, `critical`

**TicketCategory** (column `tickets.category`): `hardware`, `software`, `network`, `email`,
`account_access`, `security`, `other`

**AuditAction** (column `audit_logs.action`): `ticket_created`, `ticket_updated`,
`ticket_assigned`, `status_changed`, `priority_changed`, `ticket_deleted`, `comment_added`,
`user_created`, `user_role_changed`, `user_deactivated`, `user_activated`,
`department_created`, `department_updated`, `department_deleted`, `login`

UI labels: convert snake_case → Title Case (`in_progress` → "In Progress",
`account_access` → "Account Access").

---

## 3. Database Models (SQLAlchemy 2.0, `Mapped` / `mapped_column`)

All models inherit from `Base` (in `app/database.py`). Enum columns use
`Enum(EnumClass, native_enum=False, length=...)` so the stored values are the lowercase
strings above (and work unchanged on SQLite in tests). Timestamps are timezone-aware
`DateTime(timezone=True)`; `created_at` defaults to `func.now()`, `updated_at` defaults to
`func.now()` and `onupdate=func.now()`.

### users (`app/models/user.py`, class `User`, table `users`)
`id` PK · `full_name` str(120) · `email` str(255) unique+indexed · `hashed_password` str(255)
· `role` UserRole (default `employee`) · `department_id` FK departments.id (nullable)
· `is_active` bool (default True) · `created_at` · `updated_at`

Relationships: `department` → Department (`back_populates="users"`);
`created_tickets` → Ticket (`foreign_keys="Ticket.created_by_id"`, back_populates `created_by`);
`assigned_tickets` → Ticket (`foreign_keys="Ticket.assigned_to_id"`, back_populates `assigned_to`).

### departments (`app/models/department.py`, class `Department`, table `departments`)
`id` PK · `name` str(100) unique · `description` str(255) nullable · `created_at` · `updated_at`

Relationships: `users` → User; `tickets` → Ticket.

### tickets (`app/models/ticket.py`, class `Ticket`, table `tickets`)
`id` PK · `title` str(200) · `description` Text · `status` TicketStatus (default `open`)
· `priority` TicketPriority (default `medium`) · `category` TicketCategory
· `created_by_id` FK users.id · `assigned_to_id` FK users.id (nullable)
· `department_id` FK departments.id (nullable) · `created_at` · `updated_at`
· `resolved_at` nullable · `closed_at` nullable

Relationships (MUST set `foreign_keys` to disambiguate the two user FKs):
`created_by` → User (foreign_keys=[created_by_id], back_populates `created_tickets`);
`assigned_to` → User (foreign_keys=[assigned_to_id], back_populates `assigned_tickets`);
`department` → Department; `comments` → TicketComment (cascade all/delete-orphan, ordered by created_at);
`status_history` → TicketStatusHistory (cascade, ordered by created_at).

### ticket_comments (`app/models/comment.py`, class `TicketComment`)
`id` PK · `ticket_id` FK · `user_id` FK · `comment` Text · `is_internal` bool (default False)
· `created_at`. Relationships: `ticket`, `user`.

### ticket_status_history (`app/models/status_history.py`, class `TicketStatusHistory`)
`id` PK · `ticket_id` FK · `changed_by_id` FK users.id · `old_status` TicketStatus (nullable)
· `new_status` TicketStatus · `created_at`. Relationships: `ticket`, `changed_by`.

### audit_logs (`app/models/audit.py`, class `AuditLog`)
`id` PK · `user_id` FK users.id (nullable) · `action` AuditAction · `entity_type` str(50)
· `entity_id` int (nullable) · `old_value` Text (nullable) · `new_value` Text (nullable)
· `created_at`. Relationship: `user`.

`app/models/__init__.py` imports `Base` + every model so metadata is complete.

---

## 4. Auth & Security

- Hashing: `CryptContext(schemes=["bcrypt"], deprecated="auto")` in `app/core/security.py`
  (`hash_password`, `verify_password`).
- JWT: HS256. `create_access_token(subject, role, expires_delta)`; payload
  `{"sub": str(user.id), "role": user.role, "exp": <int>}`. Secret + expiry from settings.
- Settings (`app/core/config.py`, pydantic-settings) from env: `DATABASE_URL`, `SECRET_KEY`,
  `ACCESS_TOKEN_EXPIRE_MINUTES` (1440), `ALGORITHM`="HS256", `BACKEND_CORS_ORIGINS`,
  `PROJECT_NAME`, `API_V1_PREFIX`="/api".
- Dependencies (`app/dependencies/auth.py`): `get_db`, `get_current_user` (decode JWT, load
  user by id, 401 invalid / 403 inactive), `require_roles(*roles)` factory plus convenience
  `require_admin`, `require_manager_or_admin`, `require_support_or_admin`.

---

## 5. API — all routes under prefix `/api`. Swagger `/docs`, ReDoc `/redoc`, health `/health`.

Routers declare a resource prefix (`/auth`, `/users`, …); `main.py` includes each with
`prefix=settings.API_V1_PREFIX`. List endpoints return
`{ "items": [...], "total", "page", "page_size", "pages" }`.

### Auth (`/api/auth`)
- `POST /register` → 201 `UserRead` (role forced `employee`; 409 on duplicate email).
- `POST /login` `{email,password}` → `TokenResponse{access_token, token_type:"bearer", user}` (writes a `login` audit log).
- `GET /me` → `UserRead`.

### Users (`/api/users`)
- `GET /` (admin/manager; manager scoped to own department) filters `role`,`department_id`,`is_active`,`search` + pagination.
- `GET /{id}` (admin/manager). `POST /` (admin). `PUT /{id}` (admin: name/email/department).
- `PATCH /{id}/role` (admin, audit `user_role_changed`). `PATCH /{id}/deactivate` (admin, not self).
  `PATCH /{id}/activate` (admin).

### Departments (`/api/departments`)
- `GET /` (any, with counts). `GET /{id}`. `POST /` (admin). `PUT /{id}` (admin).
  `DELETE /{id}` (admin; 409 if referenced by users/tickets).

### Tickets (`/api/tickets`)
Visibility — employee: own; support: assigned-to-me OR unassigned OR created-by-me;
manager: own department (+ own); admin: all.
- `GET /` filters `status`,`priority`,`category`,`department_id`,`assigned_to_id`,`created_by_id`,
  `search`,`date_from`,`date_to`,`sort` (default `-created_at`) + pagination.
- `GET /{id}` (404 if not visible). `POST /` (create → `open` + status_history null→open + audit).
- `PUT /{id}` (creator-while-open OR support/manager/admin).
- `PATCH /{id}/assign` (support self-assign only; manager/admin any support user; open→in_progress; audit).
- `PATCH /{id}/status` (employee creator: close-from-resolved / cancel-from-open; staff: any; stamps
  resolved_at/closed_at; writes status_history + audit).
- `PATCH /{id}/priority` (support/manager/admin). `DELETE /{id}` (admin, 204).

### Comments (`/api/tickets/{ticket_id}/comments`)
- `GET /` (auth + visibility; employees never see `is_internal=true`).
- `POST /` (auth + visibility; employees forced `is_internal=false`; audit `comment_added`).

### Audit Logs (`/api/audit-logs`)
- `GET /` (admin) filters `user_id`,`action`,`entity_type`,`date_from`,`date_to` + pagination.

### Dashboard (`/api/dashboard`) — role-scoped via the ticket visibility rules
- `GET /stats` → `DashboardStats`. `GET /tickets-by-status|priority|category` → `[{label,value}]`.
- `GET /support-performance` (manager/admin) → per-agent assigned/resolved/avg-resolution.

---

## 6. Pydantic Schemas (`app/schemas/*.py`, Pydantic v2, `from_attributes=True`)

`UserBrief`, `UserRead`, `RegisterRequest`, `LoginRequest`, `TokenResponse`, `UserCreate`,
`UserUpdate`, `RoleUpdate` · `DepartmentBrief`, `DepartmentRead` (+ `user_count`/`ticket_count`),
`DepartmentCreate`, `DepartmentUpdate` · `TicketRead` (nested `created_by`/`assigned_to` UserBrief,
`department` DepartmentBrief), `TicketCreate`, `TicketUpdate`, `AssignRequest`, `StatusUpdate`,
`PriorityUpdate` · `CommentRead`, `CommentCreate` · `AuditLogRead` · `DashboardStats`,
`ChartPoint`, `SupportPerformance` · paginated wrappers (`PaginatedUsers`, `PaginatedTickets`,
`PaginatedAuditLogs`) with `{items,total,page,page_size,pages}`.

---

## 7. Services (`app/services/*.py`) — business logic; routers stay thin

`audit_service.log_action(...)`; `ticket_service` (visibility query builder + create/update/
assign/change_status/change_priority that also write status history + audit); `user_service`,
`department_service`, `dashboard_service`. Services perform `db.commit()`/`db.refresh()` and
return ORM models; routers serialize via response schemas.

---

## 8. Seed Data (`app/seed.py`, `run_seed(db)` + `seed_if_empty()`)

Departments: IT, HR, Finance, Engineering, Sales, Operations.
Users (hashed passwords): `admin@company.com`/`Admin123!` (admin, IT),
`manager@company.com`/`Manager123!` (manager, IT), `support1@company.com` &
`support2@company.com`/`Support123!` (support, IT), `employee1@company.com`/`Employee123!`
(employee, Engineering), `employee2@company.com`/`Employee123!` (employee, HR),
`employee3@company.com`/`Employee123!` (employee, Finance). Plus 10 varied tickets across all
statuses/priorities/categories (some assigned, some resolved/closed with timestamps), comments
(including internal notes), status-history rows, and audit logs. Idempotent: `seed_if_empty()`
returns early if `admin@company.com` exists. `main.py` lifespan runs `create_all` then `seed_if_empty()`.

---

## 9. Frontend

`frontend/.env.example`: `VITE_API_URL=http://localhost:8000/api`. Axios instance
(`src/api/client.ts`) attaches `Authorization: Bearer <token>` from localStorage `tms_token`
and redirects to `/login` on 401. Typed API modules per resource in `src/api/`. Types in
`src/types/` (`enums.ts` with label + badge-color maps, `models.ts` with `Paginated<T>`).

Auth: `src/context/AuthContext.tsx` (user/token/login/logout/loading, hydrates via `GET /auth/me`).
Guards: `src/routes/ProtectedRoute.tsx`, `RoleRoute.tsx`. Routing (`src/App.tsx`): public
`/login`, `/register`; protected (inside `DashboardLayout`) `/dashboard`, `/tickets`,
`/tickets/new`, `/tickets/:id`, `/profile`; admin `/admin/users|departments|audit-logs`;
manager+admin `/reports`; `/403`; `*` → NotFound.

UI: Tailwind, professional slate/indigo palette, reusable components (badges, `DataTable`,
`Modal`, `Pagination`, `StatCard`, …), Recharts on dashboard/reports, loading/error/empty states
everywhere. Badge colors — status: open=blue, in_progress=amber, waiting_for_user=purple,
resolved=green, closed=gray, cancelled=rose; priority: low=slate, medium=blue, high=orange,
critical=red.

---

## 10. Docker

`backend/Dockerfile` (python:3.12-slim → uvicorn), `frontend/Dockerfile` (multi-stage node build →
nginx serving the SPA with `nginx.conf`), root `docker-compose.yml` (postgres:16-alpine with
healthcheck + backend + frontend), root `.env.example`. `docker compose up --build` →
frontend :5173, backend :8000, Swagger :8000/docs.

---

## 11. Conventions

Backend: full type hints, docstrings on routers/services, meaningful HTTP status codes,
`HTTPException` with clear `detail`, CORS from settings. Frontend: functional components + hooks,
typed throughout, API access only through `src/api/*`. No secrets committed (`.env.example` only);
`.gitignore` covers venvs, `__pycache__`, `node_modules`, `dist`, `.env`, `*.db`.
