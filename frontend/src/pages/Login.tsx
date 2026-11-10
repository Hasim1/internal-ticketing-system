/**
 * Login page (CONTRACT §9 — public route `/login`).
 *
 * A clean split auth screen: a branded marketing panel on the left (hidden on
 * small screens) and a centered sign-in card on the right. The form collects
 * email + password, performs lightweight client-side validation, and calls
 * `useAuth().login`. On success it navigates to the originally requested page
 * (via router `location.state.from`) or `/dashboard`. On failure it surfaces a
 * readable error extracted from the API response.
 *
 * A "demo accounts" helper lists the seed logins (CONTRACT §8) with
 * click-to-fill so reviewers can sign in without typing credentials.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import {
  AlertCircle,
  Eye,
  EyeOff,
  LifeBuoy,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ROLE_LABELS, type UserRole } from '@/types/enums';

/** A single seed account advertised in the demo-accounts helper (CONTRACT §8). */
interface DemoAccount {
  role: UserRole;
  email: string;
  password: string;
}

/**
 * Seed logins created by `app/seed.py` (CONTRACT §8). One representative account
 * per role is shown so a reviewer can experience every permission level.
 */
const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { role: 'admin', email: 'admin@company.com', password: 'Admin123!' },
  { role: 'manager', email: 'manager@company.com', password: 'Manager123!' },
  { role: 'support', email: 'support1@company.com', password: 'Support123!' },
  { role: 'employee', email: 'employee1@company.com', password: 'Employee123!' },
];

/** Basic RFC-5322-ish email shape check — enough to catch obvious typos client-side. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pull a human-readable message out of an unknown error thrown by the API call.
 * FastAPI returns `{ detail: string }` for handled errors and `{ detail: [...] }`
 * for validation failures; we normalise both, and fall back to a friendly
 * default for network/unknown errors.
 */
function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    // No HTTP response means the request never reached the server.
    if (!error.response) {
      return 'Unable to reach the server. Check your connection and try again.';
    }
    if (error.response.status === 401) {
      return 'Incorrect email or password.';
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
  return 'Something went wrong while signing in. Please try again.';
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Where to send the user after a successful sign-in. `ProtectedRoute` stashes
   * the attempted path in `location.state.from`; default to the dashboard.
   */
  const redirectTo = useMemo<string>(() => {
    const state = location.state as { from?: { pathname?: string } } | null;
    return state?.from?.pathname ?? '/dashboard';
  }, [location.state]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Per-field validation messages, populated on submit / blur.
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  /** Validate the form locally; returns true when it is safe to submit. */
  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) {
      next.email = 'Email is required.';
    } else if (!EMAIL_RE.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (!password) {
      next.password = 'Password is required.';
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
      await login(email.trim(), password);
      // Replace history so the back button doesn't return to the login screen.
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFormError(extractErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  /** Pre-fill the form with a demo account's credentials (does not submit). */
  function fillDemo(account: DemoAccount): void {
    setEmail(account.email);
    setPassword(account.password);
    setFieldErrors({});
    setFormError(null);
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Left: brand / marketing panel (hidden on small screens). */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-12 text-white lg:flex">
        {/* Decorative blurred accents. */}
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
            Support that keeps your team moving.
          </h1>
          <p className="mt-4 text-indigo-100">
            Raise, triage, and resolve internal tickets in one place — with
            role-aware dashboards, audit trails, and reporting built in.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-indigo-50">
            <li className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 shrink-0 text-indigo-200" aria-hidden="true" />
              Smart routing across IT, HR, Finance and Engineering.
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-200" aria-hidden="true" />
              Granular roles for employees, support, managers and admins.
            </li>
            <li className="flex items-center gap-3">
              <Users className="h-4 w-4 shrink-0 text-indigo-200" aria-hidden="true" />
              Real-time visibility into every conversation and SLA.
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-indigo-200">
          &copy; {new Date().getFullYear()} Internal Ticketing &amp; Support
          Management System.
        </p>
      </aside>

      {/* Right: sign-in card. */}
      <main className="flex w-full items-center justify-center p-6 sm:p-10 lg:w-1/2">
        <div className="w-full max-w-md">
          {/* Compact logo for small screens where the brand panel is hidden. */}
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
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Sign in to your account to continue.
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
                autoFocus
              />

              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
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

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={submitting}
                leftIcon={!submitting ? <LogIn className="h-4 w-4" aria-hidden="true" /> : undefined}
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                className="font-medium text-indigo-600 transition hover:text-indigo-700"
              >
                Create one
              </Link>
            </p>
          </div>

          {/* Demo accounts helper — click any row to fill the form. */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-700">Demo accounts</h3>
              <span className="ml-auto text-xs text-slate-400">click to fill</span>
            </div>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => fillDemo(account)}
                    disabled={submitting}
                    className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-indigo-200 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-semibold uppercase text-indigo-600 ring-1 ring-inset ring-slate-200">
                      {ROLE_LABELS[account.role].charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-slate-700">
                        {ROLE_LABELS[account.role]}
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        {account.email}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-400">
              Seeded credentials for evaluation. Passwords are pre-filled when you
              click a row.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
