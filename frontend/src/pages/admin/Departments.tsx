/**
 * Admin · Departments management page (CONTRACT §9 — route `/admin/departments`,
 * admin only).
 *
 * Lists departments with their user/ticket counts and exposes admin actions:
 * create (modal), edit (modal), and delete. Deletion is blocked client-side
 * (and server-side, 409) while a department still has users or tickets — the
 * delete control is disabled with an explanatory tooltip in that case, and a
 * confirmation modal guards the action when it is allowed.
 *
 * All access goes through the typed `@/api/departments` module.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Building2, Pencil, Plus, Trash2, Users as UsersIcon, Ticket as TicketIcon } from 'lucide-react';

import * as departmentsApi from '@/api/departments';
import type { DepartmentCreatePayload, DepartmentUpdatePayload } from '@/api/departments';
import type { Department } from '@/types/models';
import { useToast } from '@/context/ToastContext';
import { formatDate } from '@/utils/format';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { Textarea } from '@/components/Textarea';
import { DataTable, type Column } from '@/components/DataTable';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Pull a human-readable message out of an unknown (usually Axios) error. */
function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/** A department can be deleted only when it has neither users nor tickets. */
function canDelete(dept: Department): boolean {
  return (dept.user_count ?? 0) === 0 && (dept.ticket_count ?? 0) === 0;
}

/* -------------------------------------------------------------------------- */
/* Form state                                                                 */
/* -------------------------------------------------------------------------- */

interface DepartmentFormState {
  name: string;
  description: string;
}

const EMPTY_FORM: DepartmentFormState = { name: '', description: '' };

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function AdminDepartments() {
  const toast = useToast();

  // ---- Data ----------------------------------------------------------------
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Create / edit modal -------------------------------------------------
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null); // null => create
  const [form, setForm] = useState<DepartmentFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ---- Delete confirmation modal ------------------------------------------
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  /** Fetch the full list of departments. */
  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await departmentsApi.list();
      // Stable alphabetical ordering for a predictable admin view.
      setDepartments([...data].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(errorMessage(err, 'Failed to load departments.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDepartments();
  }, [fetchDepartments]);

  // ---- Create / edit handlers ---------------------------------------------
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditing(dept);
    setForm({ name: dept.name, description: dept.description ?? '' });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const name = form.name.trim();
    if (!name) {
      setFormError('Department name is required.');
      return;
    }
    const description = form.description.trim() || null;

    setSaving(true);
    try {
      if (editing) {
        const payload: DepartmentUpdatePayload = { name, description };
        const updated = await departmentsApi.update(editing.id, payload);
        toast.success(`Updated ${updated.name}.`);
      } else {
        const payload: DepartmentCreatePayload = { name, description };
        const created = await departmentsApi.create(payload);
        toast.success(`Created ${created.name}.`);
      }
      setModalOpen(false);
      await fetchDepartments();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to save department.'));
    } finally {
      setSaving(false);
    }
  };

  // ---- Delete handlers -----------------------------------------------------
  const openDelete = (dept: Department) => {
    setDeleting(dept);
    setDeleteError(null);
  };

  const closeDelete = () => {
    if (deletingBusy) return;
    setDeleting(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    setDeletingBusy(true);
    try {
      await departmentsApi.remove(deleting.id);
      toast.success(`Deleted ${deleting.name}.`);
      setDeleting(null);
      await fetchDepartments();
    } catch (err) {
      // 409 means the server found dependent users/tickets after our check.
      setDeleteError(errorMessage(err, 'Failed to delete department.'));
    } finally {
      setDeletingBusy(false);
    }
  };

  const updateField = <K extends keyof DepartmentFormState>(
    key: K,
    value: DepartmentFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ---- Table columns -------------------------------------------------------
  const columns: Column<Department>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Department',
        render: (d) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{d.name}</p>
            {d.description ? (
              <p className="truncate text-xs text-slate-500">{d.description}</p>
            ) : (
              <p className="text-xs italic text-slate-400">No description</p>
            )}
          </div>
        ),
      },
      {
        key: 'user_count',
        header: 'Users',
        align: 'center',
        widthClassName: 'w-28',
        render: (d) => (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">
            <UsersIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {d.user_count ?? 0}
          </span>
        ),
      },
      {
        key: 'ticket_count',
        header: 'Tickets',
        align: 'center',
        widthClassName: 'w-28',
        render: (d) => (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-100">
            <TicketIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {d.ticket_count ?? 0}
          </span>
        ),
      },
      {
        key: 'created_at',
        header: 'Created',
        widthClassName: 'w-36',
        render: (d) => <span className="text-slate-600">{formatDate(d.created_at)}</span>,
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        widthClassName: 'w-40',
        render: (d) => {
          const deletable = canDelete(d);
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openEdit(d)}
                leftIcon={<Pencil className="h-3.5 w-3.5" />}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={!deletable}
                title={
                  deletable
                    ? undefined
                    : 'Cannot delete: department still has users or tickets.'
                }
                onClick={() => openDelete(d)}
                leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              >
                Delete
              </Button>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Building2 className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            Departments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Organize users and tickets into departments.
          </p>
        </div>
        <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
          New department
        </Button>
      </div>

      {/* Table */}
      <DataTable<Department>
        columns={columns}
        rows={departments}
        rowKey={(d) => d.id}
        loading={loading}
        error={error}
        onRetry={fetchDepartments}
        emptyTitle="No departments yet"
        emptyMessage="Create your first department to start organizing the workspace."
        emptyAction={
          <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
            New department
          </Button>
        }
      />

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        size="md"
        title={editing ? 'Edit department' : 'Create department'}
        description={
          editing
            ? 'Update the department name or description.'
            : 'Add a new department for users and tickets.'
        }
        disableBackdropClose={saving}
        disableEscClose={saving}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="department-form" loading={saving}>
              {editing ? 'Save changes' : 'Create department'}
            </Button>
          </>
        }
      >
        <form id="department-form" onSubmit={submitForm} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {formError}
            </div>
          )}

          <Input
            label="Name"
            required
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="e.g. Engineering"
            autoComplete="off"
          />

          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Optional summary of what this department handles."
            rows={3}
          />
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={deleting !== null}
        onClose={closeDelete}
        size="sm"
        title="Delete department"
        disableBackdropClose={deletingBusy}
        disableEscClose={deletingBusy}
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete} disabled={deletingBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deletingBusy}>
              Delete department
            </Button>
          </>
        }
      >
        {deleteError && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {deleteError}
          </div>
        )}
        <p className="text-sm text-slate-600">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-slate-900">{deleting?.name}</span>? This action
          cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
