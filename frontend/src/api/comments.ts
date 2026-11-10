/**
 * Comments API (CONTRACT §5 — `app/routers/comments.py`,
 * prefix `/api/tickets/{ticket_id}/comments`).
 *
 * The backend mounts both list and create at the trailing-slash path `/` under
 * that prefix, so the full paths are `/tickets/{id}/comments/`. Visibility is
 * enforced server-side; employees never receive `is_internal=true` comments and
 * cannot create internal comments.
 */

import client from '@/api/client';
import type { Comment } from '@/types/models';

/** Request body for posting a comment. `is_internal` defaults to `false`. */
export interface CommentCreatePayload {
  comment: string;
  is_internal?: boolean;
}

/** List comments on a ticket (filtered by visibility for employees). */
export async function list(ticketId: number): Promise<Comment[]> {
  const { data } = await client.get<Comment[]>(`/tickets/${ticketId}/comments/`);
  return data;
}

/** Post a comment on a ticket. */
export async function create(
  ticketId: number,
  payload: CommentCreatePayload,
): Promise<Comment> {
  const { data } = await client.post<Comment>(
    `/tickets/${ticketId}/comments/`,
    payload,
  );
  return data;
}
