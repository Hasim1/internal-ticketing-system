# API Reference

Detailed reference for every endpoint in the **Internal Ticketing & Support Management System** backend.

- **Base URL (dev):** `http://localhost:8000`
- **API prefix:** all resource routes are mounted under `/api`.
- **Interactive docs:** Swagger UI at `/docs`, ReDoc at `/redoc`, OpenAPI JSON at `/api/openapi.json`.
- **Auth:** send `Authorization: Bearer <access_token>` on every protected request. Tokens are obtained
  from `POST /api/auth/login`.

## Conventions

**Enums** (exact string values stored and transmitted):

| Enum | Values |
|---|---|
| `UserRole` | `employee`, `support`, `manager`, `admin` |
| `TicketStatus` | `open`, `in_progress`, `waiting_for_user`, `resolved`, `closed`, `cancelled` |
| `TicketPriority` | `low`, `medium`, `high`, `critical` |
| `TicketCategory` | `hardware`, `software`, `network`, `email`, `account_access`, `security`, `other` |
| `AuditAction` | `ticket_created`, `ticket_updated`, `ticket_assigned`, `status_changed`, `priority_changed`, `ticket_deleted`, `comment_added`, `user_created`, `user_role_changed`, `user_deactivated`, `user_activated`, `department_created`, `department_updated`, `department_deleted`, `login` |

**Pagination envelope** — list endpoints return:

```json
{ "items": [ /* ... */ ], "total": 0, "page": 1, "page_size": 20, "pages": 0 }
```

**Common nested objects**

```jsonc
// UserBrief
{ "id": 1, "full_name": "Admin User", "email": "admin@company.com", "role": "admin" }

// DepartmentBrief
{ "id": 1, "name": "IT" }
```

**Common error responses**

| Status | When |
|---|---|
| `400 Bad Request` | Disallowed operation (e.g. self-deactivation, illegal status transition). |
| `401 Unauthorized` | Missing/invalid/expired token, or bad login credentials. |
| `403 Forbidden` | Authenticated but role/visibility forbids the action. |
| `404 Not Found` | Resource does not exist or is not visible to the caller. |
| `409 Conflict` | Uniqueness/integrity conflict (duplicate email or department name, department in use). |
| `422 Unprocessable Entity` | Request body/query fails validation (`detail` + `errors[]`). |

Errors are returned as `{"detail": "<message>"}` (422 additionally includes a structured `errors` array).

---

## Table of Contents

- [Auth](#auth)
- [Users](#users)
- [Departments](#departments)
- [Tickets](#tickets)
- [Comments](#comments)
- [Audit Logs](#audit-logs)
- [Dashboard](#dashboard)
- [Service endpoints](#service-endpoints)

---

## Auth

Prefix `/api/auth` · tag `auth`.

### POST `/api/auth/register`
Register a new account. The role is **always** `employee`.

- **Auth:** public
- **Request body** (`RegisterRequest`):
  ```json
  { "full_name": "Jane Doe", "email": "jane@company.com", "password": "Secret123!", "department_id": 2 }
  ```
  `department_id` is optional.
- **Response:** `201 Created` → `UserRead`
- **Errors:** `409` if the email already exists.

### POST `/api/auth/login`
Authenticate and receive a JWT. Writes a `login` audit log.

- **Auth:** public
- **Request body** (`LoginRequest`):
  ```json
  { "email": "admin@company.com", "password": "Admin123!" }
  ```
- **Response:** `200 OK` → `TokenResponse`
  ```json
  {
    "access_token": "<jwt>",
    "token_type": "bearer",
    "user": { "id": 1, "full_name": "Admin User", "email": "admin@company.com", "role": "admin",
              "department_id": 1, "department": { "id": 1, "name": "IT" },
              "is_active": true, "created_at": "...", "updated_at": "..." }
  }
  ```
- **Errors:** `401` on bad credentials or inactive account.

### GET `/api/auth/me`
Return the currently authenticated user.

- **Auth:** any authenticated user
- **Response:** `200 OK` → `UserRead`
- **Errors:** `401` if unauthenticated.

---

## Users

Prefix `/api/users` · tag `users`.

### GET `/api/users`
Paginated, filterable list of users. Managers only see users in their own department.

- **Auth:** admin **or** manager
- **Query params:** `role?`, `department_id?`, `is_active?`, `search?` (matches name/email),
  `page` (default 1), `page_size` (default 20)
- **Response:** `200 OK` → paginated `UserRead`
- **Errors:** `403` for non-admin/manager.

### GET `/api/users/{id}`
Fetch a single user.

- **Auth:** admin or manager
- **Response:** `200 OK` → `UserRead`
- **Errors:** `403`; `404` if not found.

### POST `/api/users`
Create a user. Writes a `user_created` audit log.

- **Auth:** admin
- **Request body** (`UserCreate`):
  ```json
  { "full_name": "New Agent", "email": "agent@company.com", "password": "Secret123!",
    "role": "support", "department_id": 1, "is_active": true }
  ```
  `department_id` and `is_active` are optional.
- **Response:** `201 Created` → `UserRead`
- **Errors:** `403`; `409` on duplicate email.

### PUT `/api/users/{id}`
Update a user's name, email, and/or department.

- **Auth:** admin
- **Request body** (`UserUpdate`): `{ "full_name?": "...", "email?": "...", "department_id?": 2 }`
- **Response:** `200 OK` → `UserRead`
- **Errors:** `403`; `404`; `409` on duplicate email.

### PATCH `/api/users/{id}/role`
Change a user's role. Writes a `user_role_changed` audit log (old/new role).

- **Auth:** admin
- **Request body** (`RoleUpdate`): `{ "role": "manager" }`
- **Response:** `200 OK` → `UserRead`
- **Errors:** `403`; `404`.

### PATCH `/api/users/{id}/deactivate`
Deactivate a user. Writes a `user_deactivated` audit log. **Cannot deactivate yourself.**

- **Auth:** admin
- **Response:** `200 OK` → `UserRead`
- **Errors:** `400` if targeting self; `403`; `404`.

### PATCH `/api/users/{id}/activate`
Reactivate a user. Writes a `user_activated` audit log.

- **Auth:** admin
- **Response:** `200 OK` → `UserRead`
- **Errors:** `403`; `404`.

---

## Departments

Prefix `/api/departments` · tag `departments`.

### GET `/api/departments`
List all departments (with `user_count` and `ticket_count` where available).

- **Auth:** any authenticated user
- **Response:** `200 OK` → `DepartmentRead[]`

### GET `/api/departments/{id}`
Fetch a department.

- **Auth:** any authenticated user
- **Response:** `200 OK` → `DepartmentRead`
- **Errors:** `404`.

### POST `/api/departments`
Create a department. Writes a `department_created` audit log.

- **Auth:** admin
- **Request body** (`DepartmentCreate`): `{ "name": "Legal", "description": "Legal team" }`
  (`description` optional)
- **Response:** `201 Created` → `DepartmentRead`
- **Errors:** `403`; `409` on duplicate name.

### PUT `/api/departments/{id}`
Update a department. Writes a `department_updated` audit log.

- **Auth:** admin
- **Request body** (`DepartmentUpdate`): `{ "name?": "...", "description?": "..." }`
- **Response:** `200 OK` → `DepartmentRead`
- **Errors:** `403`; `404`; `409` on duplicate name.

### DELETE `/api/departments/{id}`
Delete a department. Writes a `department_deleted` audit log.

- **Auth:** admin
- **Response:** `204 No Content`
- **Errors:** `403`; `404`; `409` if the department still has users or tickets.

---

## Tickets

Prefix `/api/tickets` · tag `tickets`. All reads are RBAC-scoped (see
[ARCHITECTURE.md](ARCHITECTURE.md#rbac-model)): employees see their own; support sees assigned/unassigned
+ own; managers see their department; admins see all.

### GET `/api/tickets`
Paginated, filterable list of visible tickets.

- **Auth:** any authenticated user (results scoped by role)
- **Query params:** `status?`, `priority?`, `category?`, `department_id?`, `assigned_to_id?`,
  `created_by_id?`, `search?` (title/description ILIKE), `date_from?`, `date_to?`,
  `page` (default 1), `page_size` (default 20), `sort?` (default `-created_at`)
- **Response:** `200 OK` → paginated `TicketRead`

### GET `/api/tickets/{id}`
Fetch a single ticket with nested `created_by` / `assigned_to` (`UserBrief`) and `department`
(`DepartmentBrief`).

- **Auth:** any authenticated user **+ visibility**
- **Response:** `200 OK` → `TicketRead`
  ```jsonc
  {
    "id": 1, "title": "Laptop won't boot", "description": "...",
    "status": "in_progress", "priority": "high", "category": "hardware",
    "created_by": { "id": 5, "full_name": "Employee One", "email": "employee1@company.com", "role": "employee" },
    "assigned_to": { "id": 3, "full_name": "Support One", "email": "support1@company.com", "role": "support" },
    "department": { "id": 1, "name": "IT" },
    "created_at": "...", "updated_at": "...", "resolved_at": null, "closed_at": null
  }
  ```
- **Errors:** `403`/`404` if not visible.

### POST `/api/tickets`
Create a ticket. `created_by` is the caller; status defaults to `open`. Writes a `ticket_created` audit
log and a `ticket_status_history` row (`null → open`).

- **Auth:** any authenticated user
- **Request body** (`TicketCreate`):
  ```json
  { "title": "VPN keeps dropping", "description": "Disconnects every few minutes",
    "category": "network", "priority": "high", "department_id": 1 }
  ```
  `priority` (default `medium`) and `department_id` are optional.
- **Response:** `201 Created` → `TicketRead`

### PUT `/api/tickets/{id}`
Update ticket fields.

- **Auth:** the creator **while the ticket is `open`**, or any support/manager/admin
- **Request body** (`TicketUpdate`): `{ "title?": "...", "description?": "...", "category?": "software", "department_id?": 2 }`
- **Response:** `200 OK` → `TicketRead`. Writes a `ticket_updated` audit log.
- **Errors:** `403`; `404`.

### PATCH `/api/tickets/{id}/assign`
Assign or self-assign a ticket. If the ticket is `open` it auto-transitions to `in_progress`. Writes a
`ticket_assigned` audit log.

- **Auth:** support (self only) · manager/admin (any support user)
- **Request body** (`AssignRequest`): `{ "assigned_to_id": 3 }` (`null` to unassign)
- **Response:** `200 OK` → `TicketRead`
- **Errors:** `403` (support assigning to someone other than self); `404`.

### PATCH `/api/tickets/{id}/status`
Transition a ticket's status. Sets `resolved_at` when → `resolved` and `closed_at` when → `closed`.
Writes a `ticket_status_history` row and a `status_changed` audit log.

- **Auth:** support/manager/admin (any transition); employee creator (`closed` from `resolved`, or
  `cancelled` from `open`)
- **Request body** (`StatusUpdate`): `{ "status": "resolved" }`
- **Response:** `200 OK` → `TicketRead`
- **Errors:** `400` on a disallowed transition; `403`; `404`.

### PATCH `/api/tickets/{id}/priority`
Change a ticket's priority. Writes a `priority_changed` audit log.

- **Auth:** support/manager/admin
- **Request body** (`PriorityUpdate`): `{ "priority": "critical" }`
- **Response:** `200 OK` → `TicketRead`
- **Errors:** `403`; `404`.

### DELETE `/api/tickets/{id}`
Delete a ticket (cascades comments + status history). Writes a `ticket_deleted` audit log.

- **Auth:** admin only
- **Response:** `204 No Content`
- **Errors:** `403`; `404`.

---

## Comments

Prefix `/api/tickets/{ticket_id}/comments` · tag `comments`. Access requires visibility of the parent
ticket.

### GET `/api/tickets/{ticket_id}/comments`
List comments for a ticket, ordered chronologically, with nested `user` (`UserBrief`). **Employees do
not see `is_internal=true` comments.**

- **Auth:** any authenticated user **+ ticket visibility**
- **Response:** `200 OK` → `CommentRead[]`
  ```jsonc
  [
    { "id": 1, "ticket_id": 1,
      "user": { "id": 3, "full_name": "Support One", "email": "support1@company.com", "role": "support" },
      "comment": "Looking into this now.", "is_internal": false, "created_at": "..." }
  ]
  ```
- **Errors:** `403`/`404` if the ticket isn't visible.

### POST `/api/tickets/{ticket_id}/comments`
Add a comment or internal note. Employees **cannot** set `is_internal=true` (it is forced to `false`).
Writes a `comment_added` audit log.

- **Auth:** any authenticated user **+ ticket visibility**
- **Request body** (`CommentCreate`): `{ "comment": "Fixed by reinstalling driver.", "is_internal": false }`
  (`is_internal` defaults to `false`)
- **Response:** `201 Created` → `CommentRead`
- **Errors:** `403`/`404` if the ticket isn't visible.

---

## Audit Logs

Prefix `/api/audit-logs` · tag `audit`.

### GET `/api/audit-logs`
Paginated, filterable audit trail with nested `user` (`UserBrief`, nullable).

- **Auth:** admin only
- **Query params:** `user_id?`, `action?` (an `AuditAction` value), `entity_type?`
  (e.g. `ticket`, `user`, `department`, `comment`), `date_from?`, `date_to?`,
  `page` (default 1), `page_size` (default 20)
- **Response:** `200 OK` → paginated `AuditLogRead`
  ```jsonc
  {
    "items": [
      { "id": 42,
        "user": { "id": 1, "full_name": "Admin User", "email": "admin@company.com", "role": "admin" },
        "action": "user_role_changed", "entity_type": "user", "entity_id": 5,
        "old_value": "employee", "new_value": "support", "created_at": "..." }
    ],
    "total": 1, "page": 1, "page_size": 20, "pages": 1
  }
  ```
- **Errors:** `403` for non-admins.

---

## Dashboard

Prefix `/api/dashboard` · tag `dashboard`. All metrics are role-scoped using the same visibility rules as
tickets (admin = all, manager = department, support = assigned/unassigned, employee = own).

### GET `/api/dashboard/stats`
Aggregate KPI summary.

- **Auth:** any authenticated user (scoped)
- **Response:** `200 OK` → `DashboardStats`
  ```json
  {
    "total_tickets": 10, "open": 3, "in_progress": 2, "waiting_for_user": 1,
    "resolved": 2, "closed": 1, "cancelled": 1, "critical": 1, "unassigned": 2,
    "avg_resolution_hours": 18.5, "my_open_assigned": 2
  }
  ```
  `my_open_assigned` is included where relevant (e.g. for support agents).

### GET `/api/dashboard/tickets-by-status`
- **Auth:** any authenticated user (scoped)
- **Response:** `200 OK` → `ChartPoint[]` where `label` is a status value.
  ```json
  [ { "label": "open", "value": 3 }, { "label": "in_progress", "value": 2 } ]
  ```

### GET `/api/dashboard/tickets-by-priority`
- **Auth:** any authenticated user (scoped)
- **Response:** `200 OK` → `ChartPoint[]` (`label` is a priority value).

### GET `/api/dashboard/tickets-by-category`
- **Auth:** any authenticated user (scoped)
- **Response:** `200 OK` → `ChartPoint[]` (`label` is a category value).

### GET `/api/dashboard/support-performance`
Per-agent performance metrics.

- **Auth:** manager **or** admin
- **Response:** `200 OK` → `SupportPerformance[]`
  ```json
  [ { "user_id": 3, "full_name": "Support One", "assigned": 4, "resolved": 3, "avg_resolution_hours": 12.0 } ]
  ```
- **Errors:** `403` for employee/support.

---

## Service endpoints

These live **outside** the `/api` prefix.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Liveness/readiness probe → `{ "status": "ok" }`. |
| `GET` | `/` | Public | API root → `{ "name": "...", "docs": "/docs" }`. |
| `GET` | `/docs` | Public | Swagger UI. |
| `GET` | `/redoc` | Public | ReDoc. |
| `GET` | `/api/openapi.json` | Public | OpenAPI schema. |
