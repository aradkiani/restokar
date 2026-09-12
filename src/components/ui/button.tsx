import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-[var(--shadow-soft)] hover:bg-brand-700 active:bg-brand-800",
  secondary:
    "bg-accent-600 text-white shadow-[var(--shadow-soft)] hover:bg-accent-700 active:bg-accent-800",
  outline:
    "border border-ink-300 bg-surface text-ink-800 hover:bg-ink-50 hover:border-ink-400 active:bg-ink-100",
  ghost: "text-ink-700 hover:bg-ink-100 active:bg-ink-200",
  // Dedicated non-inverting tokens: the red *scale* becomes light in dark mode
  // so warning text is readable, which would otherwise have made this a pale
  // pink button with white text on it.
  danger:
    "bg-danger text-danger-fg shadow-[var(--shadow-soft)] hover:bg-danger-hover active:bg-danger-active",
  subtle: "bg-ink-100 text-ink-800 hover:bg-ink-200 active:bg-ink-300",
};

/*
   `sm` and `icon` sit below the 44px touch minimum by design — dense dashboard
   toolbars would look bloated at 44px on a desktop. `tap-safe` reconciles the
   two: the button keeps its compact appearance, but on a touch device its hit
   area is expanded to 44px via a pseudo-element.
*/
const SIZES: Record<Size, string> = {
  sm: "tap-safe h-9 px-3 text-sm gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-11 px-5 text-sm gap-2 rounded-[var(--radius-sm)]",
  lg: "h-13 px-7 text-base gap-2.5 rounded-[var(--radius-md)]",
  icon: "tap-safe h-10 w-10 rounded-[var(--radius-sm)]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading,
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold whitespace-nowrap select-none",
        "transition-[background-color,border-color,box-shadow,transform] duration-150",
        "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
