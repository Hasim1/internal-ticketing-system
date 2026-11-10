/**
 * Users API (CONTRACT §5 — `app/routers/users.py`, prefix `/api/users`).
 *
 * Access is admin/manager for reads and admin for writes; the backend enforces
 * RBAC, so these functions just shape requests/responses. Paths are relative to
 * the axios `baseURL` (which already includes `/api`).
 */

import client from '@/api/client';
import type { Paginated, User } from '@/types/models';
import type { UserRole } from '@/types/enums';

/** Query parameters accepted by `GET /users/` (all optional). */
export interface UserListParams {
  role?: UserRole;
  department_id?: number;
  is_active?: boolean;
  /** Free-text search across name/email. */
  search?: string;
  page?: number;
  page_size?: number;
}

/** Request body for `POST /users/` (admin-created user). */
export interface UserCreatePayload {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
  department_id?: number | null;
  is_active?: boolean;
}

/** Request body for `PUT /users/{id}` (profile fields only). */
export interface UserUpdatePayload {
  full_name?: string;
  email?: string;
  department_id?: number | null;
}

/** List users with optional filters and pagination (admin/manager). */
export async function list(params: UserListParams = {}): Promise<Paginated<User>> {
  const { data } = await client.get<Paginated<User>>('/users/', { params });
  return data;
}

/** Fetch a single user by id (admin/manager). */
export async function get(id: number): Promise<User> {
  const { data } = await client.get<User>(`/users/${id}`);
  return data;
}

/** Create a new user (admin only). */
export async function create(payload: UserCreatePayload): Promise<User> {
  const { data } = await client.post<User>('/users/', payload);
  return data;
}

/** Update a user's profile fields (admin only). */
export async function update(id: number, payload: UserUpdatePayload): Promise<User> {
  const { data } = await client.put<User>(`/users/${id}`, payload);
  return data;
}

/** Change a user's role (admin only) — `PATCH /users/{id}/role`. */
export async function updateRole(id: number, role: UserRole): Promise<User> {
  const { data } = await client.patch<User>(`/users/${id}/role`, { role });
  return data;
}

/** Deactivate a user (admin only) — `PATCH /users/{id}/deactivate`. */
export async function deactivate(id: number): Promise<User> {
  const { data } = await client.patch<User>(`/users/${id}/deactivate`);
  return data;
}

/** Activate a user (admin only) — `PATCH /users/{id}/activate`. */
export async function activate(id: number): Promise<User> {
  const { data } = await client.patch<User>(`/users/${id}/activate`);
  return data;
}
