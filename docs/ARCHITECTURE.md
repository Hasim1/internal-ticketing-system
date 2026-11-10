# Architecture

This document explains how the **Internal Ticketing & Support Management System** is put together: how
a request flows from the browser to the database and back, how authentication and authorisation work,
how audit logging is wired in, and why the codebase is organised the way it is.

- [High-level topology](#high-level-topology)
- [Request flow](#request-flow)
- [Authentication & JWT flow](#authentication--jwt-flow)
- [RBAC model](#rbac-model)
- [Audit logging](#audit-logging)
- [Folder structure rationale](#folder-structure-rationale)
- [Cross-cutting concerns](#cross-cutting-concerns)

---

## High-level topology

Three containers, orchestrated by `docker-compose.yml`:

```
┌──────────────┐      HTTP       ┌────────────────────┐     SQL      ┌──────────────┐
│   Frontend   │  ───────────▶   │      Backend       │  ─────────▶  │  PostgreSQL  │
│ React + Vite │   (Axios,       │   FastAPI / ASGI   │  (SQLAlchemy │   (db:5432)  │
│  served by   │   Bearer JWT)   │   uvicorn :8000    │   + psycopg2)│              │
│ Nginx :5173  │  ◀───────────   │                    │  ◀─────────  │              │
└──────────────┘    JSON         └────────────────────┘    rows      └──────────────┘
```

- **Frontend** — a static React/TypeScript single-page app built by Vite and served by Nginx (which
  falls back to `index.html` for client-side routing). It never talks to the database directly; all
  data comes from the backend over HTTP/JSON.
- **Backend** — a FastAPI application run by uvicorn. It owns all business logic, authentication, and
  authorisation, and is the only component that touches the database.
- **Database** — PostgreSQL 16 with a named volume for persistence and a healthcheck so the backend
  waits for it before starting.

---

## Request flow

Every authenticated data request follows the same path. The layers are deliberately thin and
single-purpose:

```
Browser (React component)
   │  user interaction (e.g. submit "Create Ticket")
   ▼
src/api/*.ts  (typed Axios wrapper)
   │  axios instance attaches  Authorization: Bearer <tms_token>
   ▼
FastAPI router  (app/routers/*.py)
   │  validates request body with a Pydantic schema
   │  resolves dependencies:  get_db()  +  get_current_user()  +  require_roles(...)
   ▼
Service layer  (app/services/*.py)
   │  business rules, RBAC visibility queries, side effects
   ▼
SQLAlchemy ORM  (app/models/*.py)  ──▶  PostgreSQL
   │  rows mapped back to ORM objects
   ▼
Pydantic response model  (from_attributes=True)  serialises to JSON
   ▲
   └── Axios resolves the typed promise → React state updates → UI re-renders
```

**Concrete example — creating a ticket**

1. The `CreateTicket` page calls `createTicket(payload)` from `src/api/tickets.ts`.
2. The shared Axios instance (`src/api/client.ts`) injects the `Authorization` header from
   `localStorage["tms_token"]` and `POST`s to `/api/tickets`.
3. The tickets router validates the body against the `TicketCreate` schema and resolves
   `get_current_user` (who becomes the ticket's creator).
4. `ticket_service` creates the ticket (`status=open`), writes a `ticket_status_history` row
   (`null → open`), and calls `audit_service.log_action(... ticket_created ...)` — all in one
   transaction.
5. The ORM object is returned and serialised by the `TicketRead` schema (nested `created_by`,
   `assigned_to`, `department`), and the SPA renders the new ticket.

If anything fails, routers/services raise `HTTPException` with a meaningful status code; global handlers
in `main.py` normalise errors into a consistent `{"detail": ...}` JSON envelope (422 also includes a
structured `errors` array for field-level frontend feedback).

---

## Authentication & JWT flow

Authentication is **stateless** and based on JSON Web Tokens (HS256).

```
┌─────────┐   POST /api/auth/login {email,password}   ┌──────────────────────────┐
│ Browser │  ───────────────────────────────────────▶ │ auth router              │
│         │                                            │  verify_password(...)    │
│         │   200 { access_token, token_type,          │  create_access_token(    │
│         │ ◀──────  user }                            │     sub=user.id,         │
└─────────┘                                            │     role=user.role)      │
     │   store token in localStorage["tms_token"]      │  audit: login            │
     │                                                 └──────────────────────────┘
     │   every subsequent request:
     │   Authorization: Bearer <token>
     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ get_current_user()  (app/dependencies/auth.py)                                 │
│   1. extract bearer token (OAuth2PasswordBearer, tokenUrl="api/auth/login")    │
│   2. jwt.decode(token, SECRET_KEY, HS256)  → 401 on invalid/expired            │
│   3. load User by id (sub)                 → 401 if missing                     │
│   4. reject if user.is_active is False     → 400/403                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Password hashing** — `passlib` `CryptContext(schemes=["bcrypt"])` in `app/core/security.py`
  (`hash_password`, `verify_password`). bcrypt is pinned to `4.0.1` for passlib 1.7.4 compatibility.
- **Token creation** — `create_access_token(subject, role, expires_delta)` builds a payload of
  `{"sub": str(user.id), "role": user.role, "exp": <int>}`, signed with `SECRET_KEY` from settings.
- **Token lifetime** — `ACCESS_TOKEN_EXPIRE_MINUTES` (default 1440 = 24h).
- **Frontend handling** — `AuthContext` stores the token under `tms_token`, calls `GET /api/auth/me` on
  mount to rehydrate the user, and the Axios response interceptor clears the token and redirects to
  `/login` on any `401`.

There are no refresh tokens or server-side sessions: the JWT is self-contained, so the API scales
horizontally without shared session state.

---

## RBAC model

Authorisation has **two layers** that must agree: route-level role gates and row-level visibility.

### 1. Route-level role gates

Reusable dependency factories in `app/dependencies/auth.py`:

- `require_roles(*roles)` — generic factory; returns a dependency that raises `403` unless
  `current_user.role` is in the allowed set.
- Convenience wrappers: `require_admin`, `require_manager_or_admin`, `require_support_or_admin`.

Routers declare these as dependencies, so the gate runs **before** the handler body. Example: the audit
router depends on `require_admin`; user-management writes depend on `require_admin`; the
support-performance report depends on `require_manager_or_admin`.

### 2. Row-level visibility

Coarse role gates aren't enough — a support agent may call `GET /api/tickets`, but should only see a
subset of rows. This is enforced in the service layer via a single query builder,
`ticket_service.visible_tickets_query(db, user)`, applied to **every** ticket read (list and detail) and
reused by the dashboard:

| Role | Tickets visible |
|---|---|
| `employee` | `created_by_id == me` |
| `support` | assigned to me **or** unassigned **or** created by me |
| `manager` | `department_id == my department_id` (plus own) |
| `admin` | all |

Centralising the rule means list endpoints, the detail endpoint, comment access, and dashboard
aggregates all share one definition of "what this user can see" — there is no place for the rules to
drift apart.

### 3. Action-specific rules

Some operations layer extra checks on top of the role gate, enforced in services:

- **Assignment** — support may only self-assign; manager/admin may assign any support user; assigning an
  `open` ticket auto-transitions it to `in_progress`.
- **Status changes** — support/manager/admin may make any transition; an employee (the creator) may only
  `close` (from `resolved`) or `cancel` (from `open`).
- **Internal comments** — employees can neither see nor create `is_internal=true` comments.

The frontend mirrors these rules in `ProtectedRoute`/`RoleRoute` and in conditional UI, but the backend
is the source of truth — the UI guards are purely for UX.

---

## Audit logging

Accountability is a first-class concern. The `audit_logs` table is **append-only**: rows are written but
never updated or deleted by application code.

- **Single entry point** — `audit_service.log_action(db, user_id, action, entity_type, entity_id=None,
  old_value=None, new_value=None)`. Every router/service that mutates state calls it.
- **What's captured** — the acting user, the `AuditAction` (e.g. `ticket_assigned`, `status_changed`,
  `user_role_changed`, `department_deleted`, `login`), the entity type and id, and string-encoded
  before/after values where relevant (e.g. old role → new role).
- **Side effects belong to services, not routers** — routers stay thin; services own the audit write and
  any related side effects (status-history rows, timestamp stamping) so they happen atomically inside
  the same transaction as the primary change.
- **Exposure** — read-only and admin-only via `GET /api/audit-logs`, with filters (user, action,
  entity type, date range) and pagination, surfaced in the admin **Audit Logs** page.

This gives administrators a tamper-evident trail of who changed what and when — useful for security
reviews, incident investigation, and compliance.

---

## Folder structure rationale

The backend follows a **layered architecture** so each concern has exactly one home:

| Layer | Directory | Responsibility |
|---|---|---|
| Configuration | `app/core/config.py` | Typed settings from env (pydantic-settings); one `settings` singleton. |
| Security | `app/core/security.py` | Hashing + JWT primitives, isolated from web concerns. |
| Models | `app/models/` | SQLAlchemy 2.0 ORM (`Mapped`/`mapped_column`) + the canonical `enums.py`. |
| Schemas | `app/schemas/` | Pydantic v2 request/response contracts (`from_attributes=True`). |
| Dependencies | `app/dependencies/` | DI providers: `get_db`, `get_current_user`, role gates. |
| Routers | `app/routers/` | HTTP surface only — validate, delegate, return. Kept thin. |
| Services | `app/services/` | Business logic, RBAC queries, audit + history side effects. |
| Utils | `app/utils/` | Cross-cutting helpers (e.g. pagination envelope). |

**Why this split?**

- **Thin routers, fat services** keep HTTP concerns (status codes, request parsing) separate from
  business rules, which makes the rules unit-testable without a web client and reusable across endpoints
  (e.g. the visibility query feeds both tickets and the dashboard).
- **Schemas ≠ models** decouples the wire format from the storage format: the API can expose nested
  briefs (`UserBrief`, `DepartmentBrief`) and hide internals without leaking ORM objects.
- **Enums defined once** (`app/models/enums.py`, mirrored in `frontend/src/types/enums.ts`) prevent the
  string values stored in the DB, sent over the API, and rendered in the UI from ever disagreeing.

The frontend mirrors the same separation of concerns:

| Concern | Directory |
|---|---|
| HTTP clients | `src/api/` (one typed module per resource, sharing `client.ts`). |
| Types | `src/types/` (`enums.ts`, `models.ts`). |
| Global state | `src/context/` (`AuthContext`, `ToastContext`). |
| Reusable logic | `src/hooks/` (`useAuth`, `useDebounce`, `usePagination`). |
| Route guards | `src/routes/` (`ProtectedRoute`, `RoleRoute`). |
| Layout / chrome | `src/layouts/`, plus `Sidebar`/`Topbar` components. |
| UI primitives | `src/components/` (badges, table, modal, inputs, …). |
| Screens | `src/pages/` (with `pages/admin/` for admin-only views). |

---

## Cross-cutting concerns

- **CORS** — configured in `main.py` from `settings.BACKEND_CORS_ORIGINS` (default: the Vite dev server
  and a common alt port), overridable via environment variable.
- **Pagination** — every list endpoint returns a uniform envelope
  `{items, total, page, page_size, pages}` via `app/utils/pagination.py`, so the frontend's `Pagination`
  component and `usePagination` hook work identically everywhere.
- **Startup lifecycle** — the FastAPI `lifespan` handler runs `Base.metadata.create_all` and then
  idempotently seeds an empty database, so a fresh `docker compose up` yields a working, populated app
  with no manual migration step. Seed failures are logged but never block the API from starting.
- **Error shape** — global exception handlers guarantee a consistent JSON error body so the SPA can
  render failures uniformly (and surface field-level validation errors from the 422 `errors` array).
- **Configuration & secrets** — all secrets come from the environment; only `.env.example` templates are
  committed. `SECRET_KEY` ships with an obvious dev default that the README instructs you to override.
