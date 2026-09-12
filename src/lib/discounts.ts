import { z } from "zod";

/**
 * Discount codes.
 *
 * Free of any database import, like pricing.ts and for the same reason: this
 * decides what a customer is charged, and a guest supplies the input. The
 * arithmetic and the bounds are testable on their own, and the API route and
 * the order pipeline share one implementation rather than each rolling their
 * own idea of what "20% off" means.
 *
 * A code comes off the **subtotal**, which is already the sum of the prices
 * actually charged. A product sold below its compare-at price therefore arrives
 * here reduced and the code comes off what is left — the two stack, which is
 * the intended behaviour and needs no special case.
 */

export const DISCOUNT_TYPES = ["PERCENT", "FIXED"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** Longest code a guest can be expected to read off a card and retype. */
const MAX_CODE_LENGTH = 24;

/**
 * One spelling per code.
 *
 * Codes are printed on table cards and typed back one-handed, so case and a
 * stray space are transcription noise rather than part of the identity. The
 * normalised form is what gets stored *and* what gets looked up, which is what
 * makes the unique index on (restaurantId, code) mean what it appears to.
 */
export function normaliseCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

/**
 * What a code takes off a basket, in whole Toman.
 *
 * Clamped to the subtotal here as well as in `calculatePrice`. That is
 * deliberate duplication: this function is also called to *show* a guest what
 * they saved, and a figure larger than the basket would be wrong on screen even
 * though the charged total would have been right.
 */
export function discountAmountFor(
  subtotal: number,
  code: { type: DiscountType; value: number; maxDiscount?: number | null },
): number {
  const basket = Math.max(0, Math.round(subtotal || 0));
  if (basket === 0) return 0;
  if (!Number.isFinite(code.value) || code.value <= 0) return 0;

  if (code.type === "FIXED") {
    // Already a flat number. A ceiling on it would be a second way of writing
    // the same thing, so it is ignored here and refused by the schema.
    return Math.min(basket, Math.max(0, Math.round(code.value)));
  }

  const percentage = Math.round((basket * Math.min(code.value, 100)) / 100);

  /*
    The ceiling on a percentage: "15% off, but never more than 150,000".

    Applied to the computed percentage rather than replacing it, so a small
    basket still gets the full 15% and only a basket large enough to pass the
    ceiling is trimmed. A missing, zero or negative cap means no ceiling —
    leaving the field empty is how an owner says there is none.
  */
  const cap = code.maxDiscount;
  const capped =
    typeof cap === "number" && Number.isFinite(cap) && cap > 0
      ? Math.min(percentage, Math.round(cap))
      : percentage;

  return Math.min(basket, Math.max(0, capped));
}

/**
 * A code as the owner writes it.
 *
 * `value` carries two different units depending on `type`, so it is bounded
 * after the shape is known: a percentage above 100 would owe the guest money,
 * while a fixed amount is only capped by the Int column it lands in and is
 * clamped to the basket at charge time anyway.
 */
export const DiscountCodeInput = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "کد تخفیف را وارد کنید")
      .max(MAX_CODE_LENGTH, "کد تخفیف بیش از حد بلند است")
      .transform(normaliseCode)
      // Checked after normalising: " - - - " collapses to "---", which is a
      // code nobody can read out over a counter.
      .refine((code) => /[A-Z0-9]/.test(code), "کد تخفیف باید حرف یا عدد داشته باشد"),
    type: z.enum(DISCOUNT_TYPES),
    value: z.number().int().positive("مقدار تخفیف باید بیشتر از صفر باشد"),
    /**
     * Optional ceiling in Toman, for percentage codes only.
     *
     * Null and absent both mean "no ceiling". Zero does not: a maximum of
     * nothing is a code that can never discount anything, which is a typo
     * rather than an intent, so it is refused below.
     */
    maxDiscount: z.number().int().positive("سقف تخفیف باید بیشتر از صفر باشد").nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => input.type !== "PERCENT" || input.value <= 100, {
    message: "درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد",
    path: ["value"],
  })
  .refine((input) => input.type === "PERCENT" || input.maxDiscount == null, {
    message: "سقف تخفیف فقط برای تخفیف درصدی معنا دارد",
    path: ["maxDiscount"],
  });

export type DiscountCodeInput = z.infer<typeof DiscountCodeInput>;
