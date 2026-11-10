/**
 * Register page (CONTRACT §9 — public route `/register`).
 *
 * Mirrors the {@link Login} split-screen layout for a cohesive auth experience.
 * Collects full name, email, password (+ confirmation), and an optional
 * department, validates client-side, then calls `useAuth().register`
 * (`POST /auth/register`, always role=`employee`). On success it shows a toast
 * and navigates to `/login` with the new email pre-filled via router state.
 *
 * Departments are fetched from `GET /departments` for the optional select; the
 * field gracefully degrades to "no departments" if the list is empty or the
 * request fails (registration does not require a department).
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  LifeBuoy,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  UserPlus,
  Users,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import * as departmentsApi from '@/api/departments';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Select, type SelectOption } from '@/components/Select';
import type { Department } from '@/types/models';

/** Minimum password length enforced client-side (a friendly, non-strict floor). */
const MIN_PASSWORD_LENGTH = 8;

/** Basic email shape check — catches obvious typos before hitting the API. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Per-field validation messages produced by {@link validate}. */
interface FieldErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

/**
 * Normalise an unknown API error into a readable message. Handles FastAPI's
 * `{ detail: string }` (e.g. 409 "email already registered") and validation
 * `{ detail: [{ msg }] }` shapes, plus network failures.
 */
function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to reach the server. Check your connection and try again.';
    }
    if (error.response.status === 409) {
      return 'An account with this email already exists.';
    }
    const detail = (error.response.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: unknown };
      if (first && typeof first.msg === 'string') {
        return first.msg;
      }
    }
  }
  return 'Something went wrong while creating your account. Please try again.';
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Optional department list state (non-blocking — registration works without it).
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [departmentsError, setDepartmentsError] = useState(false);

  // Fetch departments once on mount for the optional select.
  useEffect(() => {
    let cancelled = false;

    async function loadDepartments(): Promise<void> {
      setLoadingDepartments(true);
      setDepartmentsError(false);
      try {
        const data = await departmentsApi.list();
        if (!cancelled) {
          setDepartments(data);
        }
      } catch {
        if (!cancelled) {
          // Non-fatal: department is optional, so we just disable the field.
          setDepartmentsError(true);
        }
      } finally {
        if (!cancelled) {
          setLoadingDepartments(false);
        }
      }
    }

    void loadDepartments();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Build select options (alphabetical) from the fetched departments. */
  const departmentOptions = useMemo<SelectOption[]>(
    () =>
      [...departments]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((dept) => ({ value: String(dept.id), label: dept.name })),
    [departments],
  );

  /** Validate all fields locally; returns true when the form is submittable. */
  function validate(): boolean {
    const next: FieldErrors = {};

    if (!fullName.trim()) {
      next.fullName = 'Full name is required.';
    } else if (fullName.trim().length < 2) {
      next.fullName = 'Please enter your full name.';
    }

    if (!email.trim()) {
      next.email = 'Email is required.';
    } else if (!EMAIL_RE.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }

    if (!password) {
      next.password = 'Password is required.';
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    if (!confirmPassword) {
      next.confirmPassword = 'Please confirm your password.';
    } else if (confirmPassword !== password) {
      next.confirmPassword = 'Passwords do not match.';
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    if (!validate()) {
      return;
    }

    setSubmitting(true);
    try {
      await register({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        // Empty string = "no department selected" -> send null.
        department_id: departmentId ? Number(departmentId) : null,
      });

      toast.success('Account created. Please sign in to continue.');
      // Send the user to login with their email pre-filled for convenience.
      navigate('/login', { replace: true, state: { email: email.trim() } });
    } catch (error) {
      setFormError(extractErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Left: brand / marketing panel (hidden on small screens). */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-violet-400/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25">
            <LifeBuoy className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Helpdesk</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Get the help you need, faster.
          </h1>
          <p className="mt-4 text-indigo-100">
            Create your account to submit tickets, track their progress, and
            collaborate with the support teams across your organization.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-indigo-50">
            <li className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 shrink-0 text-indigo-200" aria-hidden="true" />
              Submit and follow your requests end-to-end.
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-200" aria-hidden="true" />
              Your account starts with employee access.
            </li>
            <li className="flex items-center gap-3">
              <Users className="h-4 w-4 shrink-0 text-indigo-200" aria-hidden="true" />
              Stay in the loop with comments and status updates.
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-indigo-200">
          &copy; {new Date().getFullYear()} Internal Ticketing &amp; Support
          Management System.
        </p>
      </aside>

      {/* Right: registration card. */}
      <main className="flex w-full items-center justify-center p-6 sm:p-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <LifeBuoy className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">
              Helpdesk
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                Create your account
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                It only takes a minute to get started.
              </p>
            </div>

            {formError && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <Input
                label="Full name"
                type="text"
                name="full_name"
                autoComplete="name"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                error={fieldErrors.fullName}
                leftIcon={<UserIcon className="h-4 w-4" aria-hidden="true" />}
                disabled={submitting}
                required
                autoFocus
              />

              <Input
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fieldErrors.email}
                leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
                disabled={submitting}
                required
              />

              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
                hint={!fieldErrors.password ? `Minimum ${MIN_PASSWORD_LENGTH} characters.` : undefined}
                leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="pointer-events-auto -m-1 rounded-md p-1 text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                }
                disabled={submitting}
                required
              />

              <Input
                label="Confirm password"
                type={showPassword ? 'text' : 'password'}
                name="confirm_password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={fieldErrors.confirmPassword}
                leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
                disabled={submitting}
                required
              />

              <Select
                label="Department"
                name="department_id"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                options={departmentOptions}
                placeholder={
                  loadingDepartments
                    ? 'Loading departments…'
                    : departmentsError
                      ? 'Departments unavailable'
                      : 'Select a department (optional)'
                }
                hint={
                  departmentsError
                    ? 'Could not load departments — you can set this later in your profile.'
                    : 'Optional — helps route your tickets to the right team.'
                }
                disabled={submitting || loadingDepartments || departmentsError}
              />

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={submitting}
                leftIcon={!submitting ? <UserPlus className="h-4 w-4" aria-hidden="true" /> : undefined}
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-medium text-indigo-600 transition hover:text-indigo-700"
              >
                Sign in
              </Link>
            </p>
          </div>

          {/* Reassurance footer. */}
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" aria-hidden="true" />
            <p>
              New accounts are created with{' '}
              <span className="font-medium text-slate-700">employee</span> access.
              An administrator can grant additional permissions later.
            </p>
          </div>

          {/* Subtle department-context icon row keeps the footer balanced. */}
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            Your department can be updated anytime from your profile.
          </p>
        </div>
      </main>
    </div>
  );
}
