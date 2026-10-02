"use client";

import * as React from "react";
import { useI18n } from "@/components/i18n-provider";
import { caretAfterDigits, countDigits, formatMoneyInput } from "@/lib/format";
import { Input } from "./field";

type NativeProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode"
>;

export interface MoneyInputProps extends NativeProps {
  /** Whole Toman. `null` (or 0) shows an empty field with its placeholder. */
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  /** Option price deltas may be negative; nothing a guest pays is. */
  allowNegative?: boolean;
}

/**
 * A Toman amount: grouped as it is typed, a bare number underneath.
 *
 * The owner sees «۱٬۲۵۰٬۰۰۰» while typing, exactly as the price will read on
 * the menu; the form receives `1250000` and sends nothing else. The grouping is
 * `formatMoneyInput` in `lib/format.ts`, the same `formatMoney` every displayed
 * price uses, so an input and a label can never disagree about how a number
 * looks.
 *
 * The caret is put back after the same number of digits it followed, because
 * regrouping inserts and removes separators and would otherwise throw it to the
 * end on every keystroke in the middle of a number.
 */
export function MoneyInput({
  value,
  onValueChange,
  allowNegative = false,
  placeholder,
  ...props
}: MoneyInputProps) {
  const { locale } = useI18n();
  const ref = React.useRef<HTMLInputElement>(null);
  const pendingCaret = React.useRef<number | null>(null);
  // A lone "-" has no value yet, so it lives here until a digit follows it.
  const [pendingMinus, setPendingMinus] = React.useState(false);

  const text = value
    ? formatMoneyInput(String(value), locale, allowNegative).text
    : pendingMinus
      ? "-"
      : "";

  React.useLayoutEffect(() => {
    const input = ref.current;
    const digits = pendingCaret.current;
    if (!input || digits === null || document.activeElement !== input) return;

    pendingCaret.current = null;
    const position = caretAfterDigits(input.value, digits);
    input.setSelectionRange(position, position);
  });

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder ?? (locale === "fa" ? "۰" : "0")}
      value={text}
      onChange={(event) => {
        const { value: typed, selectionStart } = event.target;
        pendingCaret.current = countDigits(
          typed.slice(0, selectionStart ?? typed.length),
        );

        const next = formatMoneyInput(typed, locale, allowNegative);
        setPendingMinus(next.text === "-");
        onValueChange(next.value);
      }}
    />
  );
}
