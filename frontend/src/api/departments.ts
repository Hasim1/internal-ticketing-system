/**
 * Departments API (CONTRACT §5 — `app/routers/departments.py`, prefix `/api/departments`).
 *
 * Reads are available to any authenticated user; writes are admin-only (enforced
 * server-side). The list endpoint returns a plain array (not paginated).
 */

import client from '@/api/client';
import type { Department } from '@/types/models';

/** Request body for `POST /departments`. */
export interface DepartmentCreatePayload {
  name: string;
  description?: string | null;
}

/** Request body for `PUT /departments/{id}` (all fields optional). */
export interface DepartmentUpdatePayload {
  name?: string;
  description?: string | null;
}

/** List all departments (any authenticated user). */
export async function list(): Promise<Department[]> {
  const { data } = await client.get<Department[]>('/departments');
  return data;
}

/** Fetch a single department by id (any authenticated user). */
export async function get(id: number): Promise<Department> {
  const { data } = await client.get<Department>(`/departments/${id}`);
  return data;
}

/** Create a department (admin only). */
export async function create(payload: DepartmentCreatePayload): Promise<Department> {
  const { data } = await client.post<Department>('/departments', payload);
  return data;
}

/** Update a department (admin only). */
export async function update(
  id: number,
  payload: DepartmentUpdatePayload,
): Promise<Department> {
  const { data } = await client.put<Department>(`/departments/${id}`, payload);
  return data;
}

/**
 * Delete a department (admin only) — `DELETE /departments/{id}`.
 * Returns `204 No Content`; the backend rejects deletion (409) when the
 * department still has users or tickets.
 */
export async function remove(id: number): Promise<void> {
  await client.delete(`/departments/${id}`);
}
