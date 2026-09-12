"use client";

import * as React from "react";
import { ImageIcon, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { hashCode } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

/**
 * Building blocks shared by every template. Templates compose these rather
 * than reimplementing them, so a fix here lands on all four at once.
 * Everything is styled with the tenant's --m-* custom properties.
 */

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  size = "md",
  ariaLabel,
  locale = "fa",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  size?: "sm" | "md";
  ariaLabel?: string;
  locale?: Locale;
}) {
  const box = size === "sm" ? "size-8" : "size-10";
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full p-1"
      style={{ background: "var(--m-primary-soft)" }}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="کم کردن"
        className={cn(
          box,
          "grid place-items-center rounded-full transition-transform active:scale-90 disabled:opacity-40",
        )}
        style={{ background: "var(--m-surface)", color: "var(--m-primary)" }}
      >
        <Minus className="size-4" />
      </button>
      <span
        className="min-w-7 text-center text-sm font-bold tabular-nums"
        style={{ color: "var(--m-primary)" }}
        aria-live="polite"
      >
        {formatNumber(value, locale)}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="اضافه کردن"
        className={cn(
          box,
          "grid place-items-center rounded-full transition-transform active:scale-90",
        )}
        style={{ background: "var(--m-primary)", color: "var(--m-primary-contrast)" }}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/**
 * Product imagery is optional and frequently missing on a new menu. Rather
 * than a grey box, absent images get a deterministic warm gradient derived
 * from the product name so a half-finished menu still looks intentional.
 */
export function ProductImage({
  src,
  alt,
  seed,
  className,
  rounded = "var(--m-radius)",
}: {
  src: string | null;
  alt: string;
  seed: string;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    const hue = hashCode(seed) % 360;
    return (
      <div
        className={cn("grid place-items-center overflow-hidden", className)}
        style={{
          borderRadius: rounded,
          background: `linear-gradient(135deg, hsl(${hue} 45% 88%), hsl(${(hue + 40) % 360} 50% 78%))`,
        }}
        aria-hidden
      >
        <ImageIcon className="size-8 opacity-40" style={{ color: "var(--m-text)" }} />
      </div>
    );
  }

  return (
    // Menu images are tenant-uploaded and vary wildly in size; a plain <img>
    // with lazy loading avoids the optimiser round-trip on a mostly-mobile,
    // often-slow connection.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("size-full object-cover", className)}
      style={{ borderRadius: rounded }}
    />
  );
}

export function PriceTag({
  price,
  compareAt,
  show,
  locale,
  className,
}: {
  price: number;
  compareAt?: number | null;
  show: boolean;
  locale: string;
  className?: string;
}) {
  if (!show) return null;
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(n);

  const hasDiscount = Boolean(compareAt && compareAt > price);

  /**
   * A discounted price stacks: the old figure on its own line above the new one.
   *
   * Laid out inline, the two amounts and the currency word could not fit beside
   * an add-to-cart button on a 375px screen, so they wrapped wherever they
   * happened to run out of room — pushing the price below the button and
   * leaving two struck-through and live figures touching, which read as one
   * long number. Stacking spends height, which the row has, instead of width,
   * which it does not. Undiscounted prices are a single line exactly as before.
   */
  return (
    <span className={cn("inline-flex flex-col items-start gap-y-0.5", className)}>
      {hasDiscount && (
        <bdi className="text-[11px] leading-none tabular-nums line-through opacity-50">
          {fmt(compareAt!)}
        </bdi>
      )}
      {/* Never split the amount from its unit. */}
      <span className="inline-flex items-baseline gap-x-1 whitespace-nowrap">
        <bdi className="font-extrabold tabular-nums">{fmt(price)}</bdi>
        {/* Floors at 11px: `0.7em` of a 13px price rendered at 9.8px, which is
            below the threshold where Persian diacritics stay legible. */}
        <span className="text-[max(0.72em,11px)] opacity-70">
          {locale === "fa" ? "تومان" : "T"}
        </span>
      </span>
    </span>
  );
}

/**
 * The primary action of the entire product — and on a QR menu it is pressed
 * exclusively with a thumb. Defined once here so all four templates get the
 * same target size, counter behaviour and press feedback.
 */
export function AddToCartButton({
  inCart,
  onAdd,
  label,
  locale,
  className,
  style,
}: {
  inCart: number;
  onAdd: () => void;
  label: string;
  locale: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={label}
      className={cn(
        "tap-safe grid size-10 place-items-center rounded-full shadow-md",
        "transition-[transform,background-color] duration-150 active:scale-90",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
      style={{
        background: inCart ? "var(--m-secondary)" : "var(--m-primary)",
        color: inCart ? "var(--m-secondary-contrast)" : "var(--m-primary-contrast)",
        outlineColor: "var(--m-primary)",
        ...style,
      }}
    >
      {inCart ? (
        <span className="text-xs font-extrabold tabular-nums">
          {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(inCart)}
        </span>
      ) : (
        <Plus className="size-4.5" />
      )}
    </button>
  );
}

export function UnavailableOverlay({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 z-10 grid place-items-center backdrop-grayscale"
      style={{ background: "var(--m-overlay)", borderRadius: "var(--m-radius)" }}
    >
      <span
        className="rounded-full px-3 py-1 text-xs font-bold"
        style={{ background: "var(--m-text)", color: "var(--m-bg)" }}
      >
        {label}
      </span>
    </div>
  );
}
