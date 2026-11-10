/**
 * Admin · Users management page (CONTRACT §9 — route `/admin/users`, admin only).
 *
 * Lists users with role/department/active status, supports filtering (role,
 * search, active state), and exposes admin actions: create (modal form), edit
 * profile (modal), change role (inline select), and activate/deactivate.
 *
 * Data access goes exclusively through the typed `@/api/users` and
 * `@/api/departments` modules; the backend enforces RBAC (admin-only writes),
 * so this page assumes it is only ever reached behind a `RoleRoute` guard.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Pencil, Power, ShieldCheck, UserPlus } from 'lucide-react';

import * as usersApi from '@/api/users';
import * as departmentsApi from '@/api/departments';
import type { UserCreatePayload, UserListParams, UserUpdatePayload } from '@/api/users';
import type { Department, Paginated, User } from '@/types/models';
import type { UserRole } from '@/types/enums';
import { ROLE_LABELS, USER_ROLES } from '@/types/enums';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { usePagination } from '@/hooks/usePagination';
import { formatDate } from '@/utils/format';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { RoleBadge } from '@/components/RoleBadge';
import { SearchBar } from '@/components/SearchBar';
import { Select } from '@/components/Select';
import { FilterBar } from '@/components/FilterBar';
import { Pagination } from '@/components/Pagination';
import { DataTable, type Column } from '@/components/DataTable';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** "all" sentinel used by select filters that map to "no filter". */
const ALL = 'all';

/** Active-status filter values. */
type ActiveFilter = 'all' | 'active' | 'inactive';

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

/** Options for the role `<Select>` controls (shared by filter + forms). */
const ROLE_OPTIONS = USER_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/* -------------------------------------------------------------------------- */
/* Create / Edit modal form state                                             */
/* -------------------------------------------------------------------------- */

interface UserFormState {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
  department_id: string; // '' means "no department"
  is_active: boolean;
}

const EMPTY_FORM: UserFormState = {
  full_name: '',
  email: '',
  password: '',
  role: 'employee',
  department_id: '',
  is_active: true,
};

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function AdminUsers() {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const pagination = usePagination({ pageSize: 20 });
  const { page, pageSize, total, pageCount, setPage, setTotal, reset } = pagination;

  // ---- Filters -------------------------------------------------------------
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | typeof ALL>(ALL);
  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');

  // ---- Data ----------------------------------------------------------------
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Modal / mutation state ---------------------------------------------
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null); // null => create mode
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Ids with an in-flight row action (role change / activate / deactivate). */
  const [busyRows, setBusyRows] = useState<Set<number>>(new Set());

  const hasActiveFilters =
    search.trim() !== '' || roleFilter !== ALL || departmentFilter !== ALL || activeFilter !== 'all';

  /** Build the query params for the current filter state. */
  const params = useMemo<UserListParams>(() => {
    const next: UserListParams = { page, page_size: pageSize };
    if (search.trim()) next.search = search.trim();
    if (roleFilter !== ALL) next.role = roleFilter;
    if (departmentFilter !== ALL) next.department_id = Number(departmentFilter);
    if (activeFilter !== 'all') next.is_active = activeFilter === 'active';
    return next;
  }, [page, pageSize, search, roleFilter, departmentFilter, activeFilter]);

  /** Fetch the current page of users. */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: Paginated<User> = await usersApi.list(params);
      setUsers(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load users.'));
    } finally {
      setLoading(false);
    }
  }, [params, setTotal]);

  // Load departments once (used in filters and the create/edit form).
  useEffect(() => {
    let cancelled = false;
    departmentsApi
      .list()
      .then((data) => {
        if (!cancelled) setDepartments(data);
      })
      .catch(() => {
        // Non-fatal: the form/filter can still operate without department names.
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  // Reset to page 1 whenever a filter changes (page is part of `params`, so we
  // reset before the param-driven fetch by keying on the filter values).
  useEffect(() => {
    reset();
  }, [search, roleFilter, departmentFilter, activeFilter, reset]);

  // ---- Filter handlers -----------------------------------------------------
  const resetFilters = () => {
    setSearch('');
    setRoleFilter(ALL);
    setDepartmentFilter(ALL);
    setActiveFilter('all');
  };

  // ---- Modal handlers ------------------------------------------------------
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (target: User) => {
    setEditing(target);
    setForm({
      full_name: target.full_name,
      email: target.email,
      password: '',
      role: target.role,
      department_id: target.department_id != null ? String(target.department_id) : '',
      is_active: target.is_active,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const updateField = <K extends keyof UserFormState>(key: K, value: UserFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** Submit the create/edit form. */
  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const trimmedName = form.full_name.trim();
    const trimmedEmail = form.email.trim();
    if (!trimmedName) {
      setFormError('Full name is required.');
      return;
    }
    if (!trimmedEmail) {
      setFormError('Email is required.');
      return;
    }
    if (!editing && form.password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }

    const departmentId = form.department_id === '' ? null : Number(form.department_id);

    setSaving(true);
    try {
      if (editing) {
        // PUT /users/{id} only accepts profile fields (CONTRACT §5).
        const payload: UserUpdatePayload = {
          full_name: trimmedName,
          email: trimmedEmail,
          department_id: departmentId,
        };
        const updated = await usersApi.update(editing.id, payload);
        toast.success(`Updated ${updated.full_name}.`);
      } else {
        const payload: UserCreatePayload = {
          full_name: trimmedName,
          email: trimmedEmail,
          password: form.password,
          role: form.role,
          department_id: departmentId,
          is_active: form.is_active,
        };
        const created = await usersApi.create(payload);
        toast.success(`Created ${created.full_name}.`);
      }
      setModalOpen(false);
      await fetchUsers();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to save user.'));
    } finally {
      setSaving(false);
    }
  };

  // ---- Row actions ---------------------------------------------------------
  const withBusyRow = useCallback(async (id: number, action: () => Promise<void>) => {
    setBusyRows((prev) => new Set(prev).add(id));
    try {
      await action();
    } finally {
      setBusyRows((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const changeRole = (target: User, role: UserRole) => {
    if (role === target.role) return;
    void withBusyRow(target.id, async () => {
      try {
        const updated = await usersApi.updateRole(target.id, role);
        toast.success(`${updated.full_name} is now ${ROLE_LABELS[updated.role]}.`);
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      } catch (err) {
        toast.error(errorMessage(err, 'Failed to change role.'));
      }
    });
  };

  const toggleActive = (target: User) => {
    void withBusyRow(target.id, async () => {
      try {
        const updated = target.is_active
          ? await usersApi.deactivate(target.id)
          : await usersApi.activate(target.id);
        toast.success(
          updated.is_active
            ? `${updated.full_name} activated.`
            : `${updated.full_name} deactivated.`,
        );
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      } catch (err) {
        toast.error(errorMessage(err, 'Failed to update status.'));
      }
    });
  };

  // ---- Department option helpers ------------------------------------------
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: String(d.id), label: d.name })),
    [departments],
  );

  const departmentName = useCallback(
    (user: User): string => {
      if (user.department?.name) return user.department.name;
      if (user.department_id != null) {
        const match = departments.find((d) => d.id === user.department_id);
        if (match) return match.name;
      }
      return '—';
    },
    [departments],
  );

  // ---- Table columns -------------------------------------------------------
  const columns: Column<User>[] = useMemo(
    () => [
      {
        key: 'full_name',
        header: 'User',
        render: (u) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{u.full_name}</p>
            <p className="truncate text-xs text-slate-500">{u.email}</p>
          </div>
        ),
      },
      {
        key: 'role',
        header: 'Role',
        widthClassName: 'w-44',
        render: (u) => {
          const isSelf = currentUser?.id === u.id;
          return (
            <Select
              aria-label={`Role for ${u.full_name}`}
              value={u.role}
              disabled={busyRows.has(u.id) || isSelf}
              options={ROLE_OPTIONS}
              onChange={(e) => changeRole(u, e.target.value as UserRole)}
              className="py-1.5 text-xs"
              containerClassName="min-w-[9rem]"
            />
          );
        },
      },
      {
        key: 'department',
        header: 'Department',
        widthClassName: 'w-40',
        render: (u) => <span className="text-slate-700">{departmentName(u)}</span>,
      },
      {
        key: 'is_active',
        header: 'Status',
        align: 'center',
        widthClassName: 'w-28',
        render: (u) => (
          <span
            className={
              u.is_active
                ? 'inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200'
                : 'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200'
            }
          >
            <span
              className={
                u.is_active
                  ? 'h-1.5 w-1.5 rounded-full bg-green-500'
                  : 'h-1.5 w-1.5 rounded-full bg-slate-400'
              }
              aria-hidden="true"
            />
            {u.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        key: 'created_at',
        header: 'Member since',
        widthClassName: 'w-36',
        render: (u) => <span className="text-slate-600">{formatDate(u.created_at)}</span>,
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        widthClassName: 'w-40',
        render: (u) => {
          const isSelf = currentUser?.id === u.id;
          const busy = busyRows.has(u.id);
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openEdit(u)}
                leftIcon={<Pencil className="h-3.5 w-3.5" />}
              >
                Edit
              </Button>
              <Button
                variant={u.is_active ? 'danger' : 'primary'}
                size="sm"
                loading={busy}
                disabled={isSelf}
                title={isSelf ? 'You cannot change your own status.' : undefined}
                onClick={() => toggleActive(u)}
                leftIcon={!busy ? <Power className="h-3.5 w-3.5" /> : undefined}
              >
                {u.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          );
        },
      },
    ],
    // `changeRole`/`toggleActive`/`openEdit` are stable enough for render; the
    // closures capture the latest state via the component scope each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyRows, currentUser, departmentName],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <ShieldCheck className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            Users
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage accounts, roles, and access across the organization.
          </p>
        </div>
        <Button onClick={openCreate} leftIcon={<UserPlus className="h-4 w-4" />}>
          New user
        </Button>
      </div>

      {/* Filters */}
      <FilterBar onReset={resetFilters} hasActiveFilters={hasActiveFilters}>
        <div className="w-full sm:w-64">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search name or email…"
          />
        </div>
        <Select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | typeof ALL)}
          containerClassName="w-full sm:w-44"
        >
          <option value={ALL}>All roles</option>
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by department"
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          containerClassName="w-full sm:w-48"
        >
          <option value={ALL}>All departments</option>
          {departmentOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by status"
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
          containerClassName="w-full sm:w-40"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </FilterBar>

      {/* Table */}
      <DataTable<User>
        columns={columns}
        rows={users}
        rowKey={(u) => u.id}
        loading={loading}
        error={error}
        onRetry={fetchUsers}
        emptyTitle="No users found"
        emptyMessage={
          hasActiveFilters
            ? 'Try adjusting or clearing your filters.'
            : 'Create the first user to get started.'
        }
        emptyAction={
          !hasActiveFilters ? (
            <Button onClick={openCreate} leftIcon={<UserPlus className="h-4 w-4" />}>
              New user
            </Button>
          ) : undefined
        }
      />

      {/* Pagination */}
      {!loading && !error && users.length > 0 && (
        <Pagination
          page={page}
          pages={pageCount}
          total={total}
          pageSize={pageSize}
          onChange={setPage}
        />
      )}

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        size="lg"
        title={editing ? 'Edit user' : 'Create user'}
        description={
          editing
            ? 'Update profile details. Use the role selector in the table to change roles.'
            : 'Add a new account. The user can sign in immediately with the password you set.'
        }
        disableBackdropClose={saving}
        disableEscClose={saving}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="user-form" loading={saving}>
              {editing ? 'Save changes' : 'Create user'}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={submitForm} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {formError}
            </div>
          )}

          <Input
            label="Full name"
            required
            value={form.full_name}
            onChange={(e) => updateField('full_name', e.target.value)}
            placeholder="Jane Doe"
            autoComplete="off"
          />

          <Input
            label="Email"
            type="email"
            required
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="jane.doe@company.com"
            autoComplete="off"
          />

          {!editing && (
            <Input
              label="Temporary password"
              type="password"
              required
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              placeholder="At least 8 characters"
              hint="Share this with the user; they can change it after signing in."
              autoComplete="new-password"
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!editing && (
              <Select
                label="Role"
                value={form.role}
                onChange={(e) => updateField('role', e.target.value as UserRole)}
                options={ROLE_OPTIONS}
              />
            )}
            <Select
              label="Department"
              value={form.department_id}
              onChange={(e) => updateField('department_id', e.target.value)}
            >
              <option value="">No department</option>
              {departmentOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {!editing && (
            <label className="flex items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => updateField('is_active', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Account is active (can sign in)
            </label>
          )}
        </form>
      </Modal>
    </div>
  );
}
