/**
 * Ticket detail page (`/tickets/:id`).
 *
 * Shows the full ticket (header with status/priority badges + metadata,
 * description), a role-gated ACTION panel, and the COMMENTS thread.
 *
 * Action gating mirrors the backend RBAC in CONTRACT §5 so the UI only offers
 * operations the current user can actually perform:
 *   - assign / self-assign: support may self-assign; manager/admin may assign to
 *     any support user; admin/manager may also unassign.
 *   - change status: support/manager/admin may set any status; the employee
 *     creator may `close` a resolved ticket or `cancel` an open one.
 *   - change priority: support/manager/admin.
 *   - delete: admin only.
 *   - comments: support/admin may post internal notes (toggle); employees never
 *     see internal notes nor can create them.
 *
 * After every mutating action the ticket (and, for comments, the thread) is
 * refetched so the view stays consistent, and a toast reports success/failure.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Lock,
  MessageSquare,
  Send,
  Trash2,
  UserCircle2,
  UserPlus,
} from 'lucide-react';
import { clsx } from 'clsx';

import * as ticketsApi from '@/api/tickets';
import * as commentsApi from '@/api/comments';
import * as usersApi from '@/api/users';

import type { Comment, Ticket, UserBrief } from '@/types/models';
import type { TicketPriority, TicketStatus } from '@/types/enums';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '@/types/enums';

import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorState } from '@/components/ErrorState';
import { Loading } from '@/components/Loading';
import { Modal } from '@/components/Modal';
import { PriorityBadge } from '@/components/PriorityBadge';
import { RoleBadge } from '@/components/RoleBadge';
import { Select } from '@/components/Select';
import { StatusBadge } from '@/components/StatusBadge';
import { Textarea } from '@/components/Textarea';

import { categoryLabel } from '@/utils/labels';
import { formatDateTime, relativeTime } from '@/utils/format';

/** Extract a human-readable message from an unknown (likely Axios) error. */
function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null) {
    const maybe = err as {
      response?: { data?: { detail?: unknown } };
      message?: string;
    };
    const detail = maybe.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
    if (typeof maybe.message === 'string') return maybe.message;
  }
  return fallback;
}

/** A labelled metadata row in the ticket header. */
function MetaRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-400" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <div className="mt-0.5 text-sm text-slate-700">{children}</div>
      </div>
    </div>
  );
}

export function TicketDetails() {
  const params = useParams<{ id: string }>();
  const ticketId = Number(params.id);
  const navigate = useNavigate();
  const toast = useToast();
  const { user, hasRole } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  // Per-action in-flight flags so individual controls can show their own
  // spinner / disabled state without freezing the whole panel.
  const [statusSaving, setStatusSaving] = useState(false);
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);

  const [supportUsers, setSupportUsers] = useState<UserBrief[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Comment composer state.
  const [commentText, setCommentText] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);

  /* ---------------------------------------------------------------------- */
  /* Role helpers                                                            */
  /* ---------------------------------------------------------------------- */

  const isAdmin = hasRole('admin');
  const isSupport = hasRole('support');
  const isManager = hasRole('manager');
  const isStaff = hasRole('support', 'manager', 'admin');
  const isCreator = Boolean(ticket && user && ticket.created_by.id === user.id);

  // Support/admin can write internal notes; employees and managers post public
  // comments only (CONTRACT §5: employees cannot set is_internal).
  const canPostInternal = isSupport || isAdmin;

  // Statuses an employee creator may set themselves (CONTRACT §5).
  const employeeStatusTransition = useMemo<TicketStatus | null>(() => {
    if (!ticket) return null;
    if (ticket.status === 'resolved') return 'closed';
    if (ticket.status === 'open') return 'cancelled';
    return null;
  }, [ticket]);

  const canChangeStatus = isStaff || (isCreator && employeeStatusTransition !== null);
  const canChangePriority = isStaff;
  const canAssign = isSupport || isManager || isAdmin;
  const canDelete = isAdmin;

  /* ---------------------------------------------------------------------- */
  /* Data loading                                                           */
  /* ---------------------------------------------------------------------- */

  const fetchTicket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ticketsApi.get(ticketId);
      setTicket(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load this ticket.'));
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  const fetchComments = useCallback(async () => {
    setCommentsError(null);
    try {
      const data = await commentsApi.list(ticketId);
      setComments(data);
    } catch (err) {
      setCommentsError(errorMessage(err, 'Failed to load comments.'));
      setComments([]);
    }
  }, [ticketId]);

  useEffect(() => {
    if (!Number.isFinite(ticketId)) {
      setError('Invalid ticket id.');
      setLoading(false);
      return;
    }
    void fetchTicket();
    void fetchComments();
  }, [ticketId, fetchTicket, fetchComments]);

  // Load the support roster for the assignment selector (staff only).
  useEffect(() => {
    if (!canAssign) return;
    let cancelled = false;
    async function loadSupport() {
      try {
        const page = await usersApi.list({ role: 'support', page: 1, page_size: 100 });
        if (!cancelled) setSupportUsers(page.items);
      } catch {
        if (!cancelled) setSupportUsers([]);
      }
    }
    void loadSupport();
    return () => {
      cancelled = true;
    };
  }, [canAssign]);

  /* ---------------------------------------------------------------------- */
  /* Action handlers                                                        */
  /* ---------------------------------------------------------------------- */

  const handleStatusChange = useCallback(
    async (next: TicketStatus) => {
      if (!ticket || next === ticket.status) return;
      setStatusSaving(true);
      try {
        const updated = await ticketsApi.updateStatus(ticket.id, next);
        setTicket(updated);
        toast.success(`Status changed to "${STATUS_LABELS[next]}".`);
      } catch (err) {
        toast.error(errorMessage(err, 'Failed to change status.'));
      } finally {
        setStatusSaving(false);
      }
    },
    [ticket, toast],
  );

  const handlePriorityChange = useCallback(
    async (next: TicketPriority) => {
      if (!ticket || next === ticket.priority) return;
      setPrioritySaving(true);
      try {
        const updated = await ticketsApi.updatePriority(ticket.id, next);
        setTicket(updated);
        toast.success(`Priority changed to "${PRIORITY_LABELS[next]}".`);
      } catch (err) {
        toast.error(errorMessage(err, 'Failed to change priority.'));
      } finally {
        setPrioritySaving(false);
      }
    },
    [ticket, toast],
  );

  const handleAssign = useCallback(
    async (assignedToId: number | null) => {
      if (!ticket) return;
      setAssignSaving(true);
      try {
        const updated = await ticketsApi.assign(ticket.id, assignedToId);
        setTicket(updated);
        toast.success(
          assignedToId === null ? 'Ticket unassigned.' : 'Ticket assigned.',
        );
      } catch (err) {
        toast.error(errorMessage(err, 'Failed to assign ticket.'));
      } finally {
        setAssignSaving(false);
      }
    },
    [ticket, toast],
  );

  const handleSelfAssign = useCallback(() => {
    if (user) void handleAssign(user.id);
  }, [user, handleAssign]);

  const handleDelete = useCallback(async () => {
    if (!ticket) return;
    setDeleting(true);
    try {
      await ticketsApi.remove(ticket.id);
      toast.success('Ticket deleted.');
      navigate('/tickets');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete ticket.'));
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }, [ticket, toast, navigate]);

  const handleAddComment = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const body = commentText.trim();
      if (!body) return;
      setCommentSaving(true);
      try {
        await commentsApi.create(ticketId, {
          comment: body,
          is_internal: canPostInternal ? commentInternal : false,
        });
        setCommentText('');
        setCommentInternal(false);
        await fetchComments();
        toast.success('Comment added.');
      } catch (err) {
        toast.error(errorMessage(err, 'Failed to add comment.'));
      } finally {
        setCommentSaving(false);
      }
    },
    [commentText, commentInternal, canPostInternal, ticketId, fetchComments, toast],
  );

  /* ---------------------------------------------------------------------- */
  /* Derived option lists                                                   */
  /* ---------------------------------------------------------------------- */

  const statusOptions = useMemo(
    () => TICKET_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
    [],
  );
  const priorityOptions = useMemo(
    () => TICKET_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
    [],
  );
  const assigneeOptions = useMemo(
    () => [
      { value: '', label: 'Unassigned' },
      ...supportUsers.map((u) => ({ value: String(u.id), label: u.full_name })),
    ],
    [supportUsers],
  );

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  if (loading) {
    return <Loading message="Loading ticket…" />;
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate('/tickets')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tickets
        </button>
        <Card>
          <ErrorState message={error ?? 'Ticket not found.'} onRetry={fetchTicket} />
        </Card>
      </div>
    );
  }

  const hasAnyActions = canChangeStatus || canChangePriority || canAssign || canDelete;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate('/tickets')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tickets
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Header card */}
          <Card>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-slate-400">#{ticket.id}</span>
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} withIcon />
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                  {categoryLabel(ticket.category)}
                </span>
              </div>

              <h1 className="text-2xl font-semibold text-slate-900">{ticket.title}</h1>

              <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                <MetaRow icon={<UserCircle2 className="h-4 w-4" />} label="Created by">
                  {ticket.created_by.full_name}
                </MetaRow>
                <MetaRow icon={<UserPlus className="h-4 w-4" />} label="Assigned to">
                  {ticket.assigned_to ? (
                    ticket.assigned_to.full_name
                  ) : (
                    <span className="text-slate-400">Unassigned</span>
                  )}
                </MetaRow>
                <MetaRow icon={<Building2 className="h-4 w-4" />} label="Department">
                  {ticket.department ? (
                    ticket.department.name
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </MetaRow>
                <MetaRow icon={<CalendarClock className="h-4 w-4" />} label="Created">
                  <span title={formatDateTime(ticket.created_at)}>
                    {relativeTime(ticket.created_at)}
                  </span>
                </MetaRow>
                {ticket.resolved_at && (
                  <MetaRow icon={<CalendarClock className="h-4 w-4" />} label="Resolved">
                    <span title={formatDateTime(ticket.resolved_at)}>
                      {relativeTime(ticket.resolved_at)}
                    </span>
                  </MetaRow>
                )}
                {ticket.closed_at && (
                  <MetaRow icon={<CalendarClock className="h-4 w-4" />} label="Closed">
                    <span title={formatDateTime(ticket.closed_at)}>
                      {relativeTime(ticket.closed_at)}
                    </span>
                  </MetaRow>
                )}
              </div>
            </div>
          </Card>

          {/* Description */}
          <Card title="Description">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {ticket.description}
            </p>
          </Card>

          {/* Comments */}
          <Card
            title="Comments"
            subtitle={`${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`}
          >
            <div className="space-y-4">
              {commentsError ? (
                <ErrorState message={commentsError} onRetry={fetchComments} />
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <MessageSquare className="h-6 w-6 text-slate-300" aria-hidden="true" />
                  <p className="text-sm text-slate-500">No comments yet.</p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {comments.map((c) => (
                    <li
                      key={c.id}
                      className={clsx(
                        'rounded-xl border p-4',
                        c.is_internal
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-slate-200 bg-white',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar name={c.user.full_name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-slate-900">
                              {c.user.full_name}
                            </span>
                            <RoleBadge role={c.user.role} />
                            {c.is_internal && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                                <Lock className="h-3 w-3" aria-hidden="true" />
                                Internal note
                              </span>
                            )}
                            <span
                              className="text-xs text-slate-400"
                              title={formatDateTime(c.created_at)}
                            >
                              {relativeTime(c.created_at)}
                            </span>
                          </div>
                          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                            {c.comment}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Composer */}
              <form
                onSubmit={handleAddComment}
                className="space-y-3 border-t border-slate-100 pt-4"
              >
                <Textarea
                  label="Add a comment"
                  rows={3}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a reply…"
                  disabled={commentSaving}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {canPostInternal ? (
                    <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={commentInternal}
                        onChange={(e) => setCommentInternal(e.target.checked)}
                        disabled={commentSaving}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="inline-flex items-center gap-1">
                        <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        Internal note (hidden from employees)
                      </span>
                    </label>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    loading={commentSaving}
                    disabled={!commentText.trim()}
                    leftIcon={<Send className="h-4 w-4" />}
                  >
                    Comment
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>

        {/* Action sidebar */}
        <div className="space-y-6">
          {hasAnyActions ? (
            <Card title="Actions">
              <div className="space-y-5">
                {/* Status */}
                {canChangeStatus &&
                  (isStaff ? (
                    <Select
                      label="Status"
                      value={ticket.status}
                      onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                      options={statusOptions}
                      disabled={statusSaving}
                    />
                  ) : (
                    // Employee creator: a single allowed transition button.
                    employeeStatusTransition && (
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-slate-700">Status</p>
                        <Button
                          variant={
                            employeeStatusTransition === 'cancelled' ? 'danger' : 'primary'
                          }
                          fullWidth
                          loading={statusSaving}
                          onClick={() => handleStatusChange(employeeStatusTransition)}
                        >
                          {employeeStatusTransition === 'closed'
                            ? 'Close ticket'
                            : 'Cancel ticket'}
                        </Button>
                      </div>
                    )
                  ))}

                {/* Priority */}
                {canChangePriority && (
                  <Select
                    label="Priority"
                    value={ticket.priority}
                    onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
                    options={priorityOptions}
                    disabled={prioritySaving}
                  />
                )}

                {/* Assignment */}
                {canAssign && (
                  <div className="space-y-2">
                    {isManager || isAdmin ? (
                      <Select
                        label="Assignee"
                        value={ticket.assigned_to ? String(ticket.assigned_to.id) : ''}
                        onChange={(e) =>
                          handleAssign(e.target.value ? Number(e.target.value) : null)
                        }
                        options={assigneeOptions}
                        disabled={assignSaving}
                        hint="Assign to a support agent."
                      />
                    ) : (
                      // Support can self-assign (or release) only.
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-slate-700">Assignment</p>
                        {user && ticket.assigned_to?.id === user.id ? (
                          <Button
                            variant="secondary"
                            fullWidth
                            loading={assignSaving}
                            onClick={() => handleAssign(null)}
                          >
                            Release ticket
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            fullWidth
                            loading={assignSaving}
                            leftIcon={<UserPlus className="h-4 w-4" />}
                            onClick={handleSelfAssign}
                          >
                            Assign to me
                          </Button>
                        )}
                        {ticket.assigned_to && (
                          <p className="text-xs text-slate-500">
                            Currently assigned to{' '}
                            <span className="font-medium text-slate-700">
                              {ticket.assigned_to.full_name}
                            </span>
                            .
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Delete (admin only) */}
                {canDelete && (
                  <div className="border-t border-slate-100 pt-5">
                    <Button
                      variant="danger"
                      fullWidth
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      onClick={() => setConfirmDeleteOpen(true)}
                    >
                      Delete ticket
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card title="Actions">
              <p className="text-sm text-slate-500">
                You don&apos;t have actions available for this ticket.
              </p>
            </Card>
          )}

          {/* People summary */}
          <Card title="People">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={ticket.created_by.full_name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {ticket.created_by.full_name}
                  </p>
                  <p className="text-xs text-slate-500">Reporter</p>
                </div>
              </div>
              {ticket.assigned_to && (
                <div className="flex items-center gap-3">
                  <Avatar name={ticket.assigned_to.full_name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {ticket.assigned_to.full_name}
                    </p>
                    <p className="text-xs text-slate-500">Assignee</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Delete confirmation */}
      <Modal
        open={confirmDeleteOpen}
        onClose={() => (deleting ? undefined : setConfirmDeleteOpen(false))}
        title="Delete ticket"
        description={`This permanently removes ticket #${ticket.id} and all of its comments. This cannot be undone.`}
        size="sm"
        disableBackdropClose={deleting}
        disableEscClose={deleting}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete{' '}
          <span className="font-medium text-slate-900">{ticket.title}</span>?
        </p>
      </Modal>
    </div>
  );
}

export default TicketDetails;
