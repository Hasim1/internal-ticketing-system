import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

/** Width presets for {@link Modal}. */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export interface ModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the user requests to close (backdrop click, Esc, close button). */
  onClose: () => void;
  /** Heading rendered in the modal header. */
  title?: ReactNode;
  /** Optional descriptive text under the title. */
  description?: ReactNode;
  /** Modal body content. */
  children?: ReactNode;
  /** Footer content, typically action buttons. */
  footer?: ReactNode;
  /** Width preset. Defaults to `md`. */
  size?: ModalSize;
  /** Disable closing on backdrop click. */
  disableBackdropClose?: boolean;
  /** Disable closing on Escape key. */
  disableEscClose?: boolean;
  /** Hide the header close (×) button. */
  hideCloseButton?: boolean;
}

/**
 * Accessible modal dialog rendered in a portal on `document.body`.
 *
 * Closes on backdrop click and Escape (each individually disable-able), locks
 * body scroll while open, and focuses the dialog on mount. Header, body, and an
 * optional footer are laid out in a rounded-xl card.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  disableBackdropClose = false,
  disableEscClose = false,
  hideCloseButton = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape.
  useEffect(() => {
    if (!open || disableEscClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, disableEscClose, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Move focus into the dialog when it opens.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={disableBackdropClose ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={clsx(
          'relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl',
          'border border-slate-200 bg-white shadow-xl outline-none',
          SIZE_CLASSES[size],
        )}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-lg font-semibold text-slate-900">{title}</h2>
              )}
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-1.5 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-slate-700">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
