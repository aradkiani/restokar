import * as React from "react";
import { cn } from "@/lib/utils";

const controlBase =
  "w-full rounded-[var(--radius-sm)] border border-ink-300 bg-surface px-3.5 text-sm " +
  "placeholder:text-ink-400 transition-colors " +
  "hover:border-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12 " +
  "disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-500 " +
  "aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/12";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(controlBase, "h-11", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(controlBase, "min-h-24 py-2.5 leading-7", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(controlBase, "h-11 cursor-pointer pe-8", className)}
    {...props}
  />
));
Select.displayName = "Select";

export function Label({
  className,
  hint,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-semibold text-ink-800", className)}
      {...props}
    >
      {children}
      {hint && <span className="ms-1.5 font-normal text-ink-500">({hint})</span>}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <Label htmlFor={htmlFor} hint={hint}>
          {label}
        </Label>
      )}
      {children}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Accessible switch built on a real checkbox so forms and labels just work. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  name,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] p-1",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          name={name}
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden
          className={cn(
            "block h-6 w-11 rounded-full bg-ink-300 transition-colors",
            "peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/25",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute start-0.5 top-0.5 size-5 rounded-full bg-surface shadow-sm",
            "transition-transform duration-200 peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5",
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink-800">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-ink-500">{description}</span>
        )}
      </span>
    </label>
  );
}
