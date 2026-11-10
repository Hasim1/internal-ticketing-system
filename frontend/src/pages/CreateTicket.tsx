/**
 * Create ticket page (`/tickets/new`).
 *
 * A simple, validated form for filing a new ticket (CONTRACT §5
 * `POST /tickets`). On success it navigates to the created ticket's detail view
 * and raises a success toast; validation runs client-side before submission and
 * server errors are surfaced inline + via toast.
 *
 * The department defaults to the current user's own department (when set) but
 * can be changed; priority defaults to `medium` to mirror the server default.
 */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import * as ticketsApi from '@/api/tickets';
import type { TicketCreatePayload } from '@/api/tickets';
import * as departmentsApi from '@/api/departments';

import type { Department } from '@/types/models';
import type { TicketCategory, TicketPriority } from '@/types/enums';
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
} from '@/types/enums';

import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Select } from '@/components/Select';
import { Textarea } from '@/components/Textarea';

/** Field-level validation messages keyed by form field. */
interface FieldErrors {
  title?: string;
  description?: string;
  category?: string;
}

const TITLE_MAX = 200;
const TITLE_MIN = 5;
const DESCRIPTION_MIN = 10;

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

export function CreateTicket() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [departmentId, setDepartmentId] = useState<string>('');

  const [departments, setDepartments] = useState<Department[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Load departments for the selector, defaulting to the user's own department.
  useEffect(() => {
    let cancelled = false;
    async function loadDepartments() {
      try {
        const depts = await departmentsApi.list();
        if (cancelled) return;
        setDepartments(depts);
        // Pre-select the user's department when it exists in the list.
        if (user?.department_id != null) {
          setDepartmentId(String(user.department_id));
        }
      } catch {
        // Non-fatal: the department selector simply has no options.
        if (!cancelled) setDepartments([]);
      }
    }
    void loadDepartments();
    return () => {
      cancelled = true;
    };
  }, [user?.department_id]);

  const categoryOptions = useMemo(
    () =>
      TICKET_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
    [],
  );
  const priorityOptions = useMemo(
    () =>
      TICKET_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
    [],
  );
  const departmentOptions = useMemo(
    () => [
      { value: '', label: 'No department' },
      ...departments.map((d) => ({ value: String(d.id), label: d.name })),
    ],
    [departments],
  );

  /** Validate the form; returns the (possibly empty) error map. */
  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      errors.title = 'Title is required.';
    } else if (trimmedTitle.length < TITLE_MIN) {
      errors.title = `Title must be at least ${TITLE_MIN} characters.`;
    } else if (trimmedTitle.length > TITLE_MAX) {
      errors.title = `Title must be at most ${TITLE_MAX} characters.`;
    }

    if (!trimmedDescription) {
      errors.description = 'Description is required.';
    } else if (trimmedDescription.length < DESCRIPTION_MIN) {
      errors.description = `Description must be at least ${DESCRIPTION_MIN} characters.`;
    }

    if (!category) {
      errors.category = 'Please choose a category.';
    }

    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: TicketCreatePayload = {
      title: title.trim(),
      description: description.trim(),
      // `category` is guaranteed non-empty here by validation above.
      category: category as TicketCategory,
      priority,
      department_id: departmentId ? Number(departmentId) : null,
    };

    setSubmitting(true);
    try {
      const created = await ticketsApi.create(payload);
      toast.success('Ticket created successfully.');
      navigate(`/tickets/${created.id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create ticket. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => navigate('/tickets')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tickets
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">New Ticket</h1>
          <p className="mt-1 text-sm text-slate-500">
            Describe your issue and we&apos;ll route it to the right team.
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <Input
            label="Title"
            required
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary of the issue"
            error={fieldErrors.title}
            hint={!fieldErrors.title ? `${title.trim().length}/${TITLE_MAX}` : undefined}
            disabled={submitting}
          />

          <Textarea
            label="Description"
            required
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide as much detail as possible: what happened, when, and any steps to reproduce."
            error={fieldErrors.description}
            disabled={submitting}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Select
              label="Category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value as TicketCategory | '')}
              options={categoryOptions}
              placeholder="Select a category"
              error={fieldErrors.category}
              disabled={submitting}
            />

            <Select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              options={priorityOptions}
              disabled={submitting}
            />
          </div>

          <Select
            label="Department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            options={departmentOptions}
            hint="Optional — helps route your ticket to the right team."
            disabled={submitting}
          />

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/tickets')}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create Ticket
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default CreateTicket;
