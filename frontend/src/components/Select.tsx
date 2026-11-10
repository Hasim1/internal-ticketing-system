import { forwardRef, useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';

/** A single option for {@link Select}. */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Optional field label rendered above the control. */
  label?: string;
  /** Validation/error message; switches the control into an error style. */
  error?: string;
  /** Helper text shown below the control when there is no error. */
  hint?: string;
  /** Options to render. If omitted, pass `<option>` children directly. */
  options?: SelectOption[];
  /** Placeholder rendered as a disabled, empty-valued first option. */
  placeholder?: string;
  /** Wrapper class for the labelled group. */
  containerClassName?: string;
}

/**
 * Labelled native `<select>` with hint/error states and a custom chevron.
 * Supply `options` for the common case, or pass `children` for full control.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    error,
    hint,
    options,
    placeholder,
    containerClassName,
    className,
    id,
    required,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <div className={clsx('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}

      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'w-full appearance-none rounded-xl border bg-white text-sm text-slate-900 shadow-sm',
            'transition-colors focus:outline-none focus:ring-2',
            'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
            'px-3.5 py-2.5 pr-10',
            error
              ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200'
              : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-200',
            className,
          )}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-slate-400"
          aria-hidden="true"
        />
      </div>

      {error ? (
        <p id={`${selectId}-error`} className="text-xs text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${selectId}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default Select;
