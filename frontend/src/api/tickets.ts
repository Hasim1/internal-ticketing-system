/**
 * Tickets API (CONTRACT §5 — `app/routers/tickets.py`, prefix `/api/tickets`).
 *
 * Visibility/RBAC is enforced server-side; the list endpoint returns whatever
 * the current user is allowed to see. Paths are relative to the axios `baseURL`.
 */

import client from '@/api/client';
import type { Paginated, Ticket } from '@/types/models';
import type { TicketCategory, TicketPriority, TicketStatus } from '@/types/enums';

/**
 * Query parameters accepted by `GET /tickets` (all optional).
 *
 * Note: the backend exposes the status filter under the query key `status`
 * (aliased internally), so this field is named `status` accordingly.
 * `sort` defaults to `-created_at` server-side.
 */
export interface TicketListParams {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  department_id?: number;
  assigned_to_id?: number;
  created_by_id?: number;
  /** Free-text search across title/description. */
  search?: string;
  /** ISO-8601 lower bound on `created_at`. */
  date_from?: string;
  /** ISO-8601 upper bound on `created_at`. */
  date_to?: string;
  page?: number;
  page_size?: number;
  /** Sort spec, e.g. `-created_at` (desc) or `priority` (asc). */
  sort?: string;
}

/** Request body for `POST /tickets`. `priority` defaults to `medium` server-side. */
export interface TicketCreatePayload {
  title: string;
  description: string;
  category: TicketCategory;
  priority?: TicketPriority;
  department_id?: number | null;
}

/** Request body for `PUT /tickets/{id}` (all fields optional). */
export interface TicketUpdatePayload {
  title?: string;
  description?: string;
  category?: TicketCategory;
  department_id?: number | null;
}

/** List tickets visible to the current user, with filters and pagination. */
export async function list(params: TicketListParams = {}): Promise<Paginated<Ticket>> {
  const { data } = await client.get<Paginated<Ticket>>('/tickets', { params });
  return data;
}

/** Fetch a single ticket by id (subject to visibility rules). */
export async function get(id: number): Promise<Ticket> {
  const { data } = await client.get<Ticket>(`/tickets/${id}`);
  return data;
}

/** Create a new ticket (any authenticated user). `created_by` is the caller. */
export async function create(payload: TicketCreatePayload): Promise<Ticket> {
  const { data } = await client.post<Ticket>('/tickets', payload);
  return data;
}

/** Update a ticket's core fields (creator while open, or support/manager/admin). */
export async function update(id: number, payload: TicketUpdatePayload): Promise<Ticket> {
  const { data } = await client.put<Ticket>(`/tickets/${id}`, payload);
  return data;
}

/**
 * Assign (or unassign) a ticket — `PATCH /tickets/{id}/assign`.
 * Pass `null` to unassign. Assigning an `open` ticket moves it to `in_progress`.
 */
export async function assign(
  id: number,
  assigned_to_id: number | null,
): Promise<Ticket> {
  const { data } = await client.patch<Ticket>(`/tickets/${id}/assign`, {
    assigned_to_id,
  });
  return data;
}

/** Change a ticket's status — `PATCH /tickets/{id}/status`. */
export async function updateStatus(id: number, status: TicketStatus): Promise<Ticket> {
  const { data } = await client.patch<Ticket>(`/tickets/${id}/status`, { status });
  return data;
}

/** Change a ticket's priority — `PATCH /tickets/{id}/priority` (support/manager/admin). */
export async function updatePriority(
  id: number,
  priority: TicketPriority,
): Promise<Ticket> {
  const { data } = await client.patch<Ticket>(`/tickets/${id}/priority`, { priority });
  return data;
}

/** Delete a ticket (admin only) — `DELETE /tickets/{id}`. Returns `204 No Content`. */
export async function remove(id: number): Promise<void> {
  await client.delete(`/tickets/${id}`);
}
