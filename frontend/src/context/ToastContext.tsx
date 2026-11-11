/**
 * Toast notification context.
 *
 * Provides a `useToast()` hook with `success` / `error` / `info` helpers and
 * renders a fixed, stacked column of dismissible toasts in the top-right of the
 * viewport. Each toast auto-dismisses after a configurable timeout (default
 * 4s) and can be closed manually.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

/** Severity of a toast — drives its icon and color treatment. */
export type ToastVariant = 'success' | 'error' | 'info';

/** A single active toast. */
export interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
}

/** Options accepted when raising a toast. */
export interface ToastOptions {
  /** Auto-dismiss delay in ms. `0` disables auto-dismiss. Defaults to 4000. */
  duration?: number;
}

/** Value exposed by {@link useToast}. */
export interface ToastContextValue {
  /** Raise a success (green) toast. */
  success: (message: string, options?: ToastOptions) => void;
  /** Raise an error (red) toast. */
  error: (message: string, options?: ToastOptions) => void;
  /** Raise an informational (slate/indigo) toast. */
  info: (message: string, options?: ToastOptions) => void;
  /** Imperatively dismiss a toast by id. */
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
ToastContext.displayName = 'ToastContext';

/** Default auto-dismiss duration in milliseconds. */
const DEFAULT_DURATION = 4000;

/** Per-variant icon component. */
const VARIANT_ICON: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

/** Per-variant Tailwind classes for the toast card and its accent icon. */
const VARIANT_STYLES: Record<ToastVariant, { card: string; icon: string }> = {
  success: {
    card: 'border-green-200 bg-white',
    icon: 'text-green-600',
  },
  error: {
    card: 'border-rose-200 bg-white',
    icon: 'text-rose-600',
  },
  info: {
    card: 'border-slate-200 bg-white',
    icon: 'text-indigo-600',
  },
};

/** Props for {@link ToastProvider}. */
export interface ToastProviderProps {
  children: ReactNode;
}

/**
 * Provider that owns the toast queue and renders the toast stack. Mount near
 * the app root so any component can raise toasts via {@link useToast}.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Monotonic id source; ref so it survives re-renders without re-creating.
  const nextId = useRef(1);
  // Track pending auto-dismiss timers so we can clear them on unmount/dismiss.
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, options?: ToastOptions) => {
      const id = nextId.current++;
      const duration = options?.duration ?? DEFAULT_DURATION;
      setToasts((current) => [...current, { id, variant, message }]);

      if (duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
    },
    [dismiss],
  );

  const success = useCallback(
    (message: string, options?: ToastOptions) => push('success', message, options),
    [push],
  );
  const error = useCallback(
    (message: string, options?: ToastOptions) => push('error', message, options),
    [push],
  );
  const info = useCallback(
    (message: string, options?: ToastOptions) => push('info', message, options),
    [push],
  );

  // Clear all outstanding timers when the provider unmounts.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => window.clearTimeout(timer));
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ success, error, info, dismiss }),
    [success, error, info, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast stack: fixed, top-right, above app chrome. */}
      <div
        className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const Icon = VARIANT_ICON[toast.variant];
          const styles = VARIANT_STYLES[toast.variant];
          return (
            <div
              key={toast.id}
              role="status"
              className={clsx(
                'pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-sm transition',
                styles.card,
              )}
            >
              <Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', styles.icon)} aria-hidden="true" />
              <p className="flex-1 text-sm leading-snug text-slate-700">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-m-1 shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Access the toast helpers. Throws if used outside a {@link ToastProvider}.
 */
// The hook is exported next to its provider on purpose; this only affects dev-time fast refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast must be used within a <ToastProvider>.');
  }
  return ctx;
}

export default ToastContext;
