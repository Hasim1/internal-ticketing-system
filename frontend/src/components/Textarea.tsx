import { forwardRef, useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Optional field label rendered above the control. */
  label?: string;
  /** Validation/error message; switches the control into an error style. */
  error?: string;
  /** Helper text shown below the control when there is no error. */
  hint?: string;
  /** Wrapper class for the labelled group. */
  containerClassName?: string;
}

/**
 * Labelled multi-line text input with hint/error states. Defaults to a
 * comfortable 4-row height and disables horizontal resizing.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, containerClassName, className, id, required, disabled, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const describedBy = error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined;

  return (
    <div className={clsx('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={textareaId} className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}

      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={clsx(
          'w-full resize-y rounded-xl border bg-white text-sm text-slate-900 shadow-sm',
          'placeholder:text-slate-400 transition-colors',
          'focus:outline-none focus:ring-2',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
          'px-3.5 py-2.5',
          error
            ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200'
            : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-200',
          className,
        )}
        {...rest}
      />

      {error ? (
        <p id={`${textareaId}-error`} className="text-xs text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${textareaId}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default Textarea;
