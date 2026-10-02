"use client";

import * as React from "react";
import { AlertCircle, Pencil, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { localizeDigits, toEnglishDigits } from "@/lib/format";

/** 09121234567 → «۰۹۱۲ ۱۲۳ ۴۵۶۷», the way a number is read aloud. */
export function displayPhone(phone: string, locale: "fa" | "en"): string {
  const grouped = phone.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3");
  return localizeDigits(grouped, locale);
}

/**
 * Seconds until a moment, ticking once a second.
 *
 * Driven by a deadline rather than by decrementing a counter, so a tab that was
 * in the background for a minute shows the right number when it comes back.
 */
function useCountdown(initialSeconds: number) {
  const [deadline, setDeadline] = React.useState(
    () => Date.now() + initialSeconds * 1000,
  );
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const restart = React.useCallback((seconds: number) => {
    const at = Date.now();
    setNow(at);
    setDeadline(at + seconds * 1000);
  }, []);

  return { remaining: Math.max(0, Math.ceil((deadline - now) / 1000)), restart };
}

export type ResendResult =
  { cooldownSeconds: number } | { error: string; retryAfterSeconds?: number };

/**
 * The second step of every phone flow: enter the code that was texted.
 *
 * One field, not one box per digit: it takes a pasted code, it is what the
 * phone's own "fill code from SMS" suggestion (`autocomplete="one-time-code"`)
 * fills, and it reads correctly in a right-to-left page. The page submits by
 * itself once the last digit is in, and says why in plain Persian when a code
 * is refused.
 *
 * `onSubmit` resolves to an error message, or to null once the caller has taken
 * over (navigated away); `onResend` asks for a new code.
 */
export function CodeStep({
  phone,
  codeLength,
  cooldownSeconds,
  hint,
  submitLabel,
  onSubmit,
  onResend,
  onEditPhone,
}: {
  phone: string;
  codeLength: number;
  cooldownSeconds: number;
  hint?: string;
  submitLabel: string;
  onSubmit: (code: string) => Promise<string | null>;
  onResend: () => Promise<ResendResult>;
  onEditPhone: () => void;
}) {
  const { t, locale } = useI18n();
  const { remaining, restart } = useCountdown(cooldownSeconds);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [resending, setResending] = React.useState(false);

  async function submit(value: string) {
    if (busy || value.length !== codeLength) return;
    setBusy(true);
    setError(null);

    const failure = await onSubmit(value);
    if (failure) {
      // Cleared rather than left in place: the next attempt is a fresh code,
      // and a wrong one sitting in the box invites resubmitting it.
      setError(failure);
      setCode("");
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function resend() {
    setResending(true);
    setError(null);
    const result = await onResend();
    setResending(false);

    if ("error" in result) {
      setError(result.error);
      if (result.retryAfterSeconds) restart(result.retryAfterSeconds);
      return;
    }
    setCode("");
    restart(result.cooldownSeconds);
    inputRef.current?.focus();
  }

  const [before, after] = t.auth.codeSent
    .replace("{length}", localizeDigits(codeLength, locale))
    .split("{phone}");

  return (
    <form
      className="mt-8 space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit(code);
      }}
    >
      <div className="rounded-[var(--radius-sm)] bg-ink-50 p-3 text-sm leading-7 text-ink-700 ring-1 ring-ink-200">
        <p>
          {before}
          <bdi dir="ltr" className="font-bold text-ink-900">
            {displayPhone(phone, locale)}
          </bdi>
          {after}
        </p>
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Field label={t.auth.code} htmlFor="otp-code">
        <Input
          ref={inputRef}
          id="otp-code"
          name="code"
          dir="ltr"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          autoFocus
          required
          maxLength={codeLength}
          aria-invalid={Boolean(error)}
          value={localizeDigits(code, locale)}
          onChange={(event) => {
            const digits = toEnglishDigits(event.target.value)
              .replace(/\D/g, "")
              .slice(0, codeLength);
            setCode(digits);
            if (digits.length === codeLength) void submit(digits);
          }}
          className="text-center text-xl font-black tracking-[0.4em] tabular-nums"
        />
      </Field>

      <Button type="submit" size="lg" loading={busy} className="w-full">
        {submitLabel}
      </Button>

      <div className="flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={onEditPhone}
          className="tap-safe inline-flex items-center gap-1.5 font-semibold text-ink-600 hover:text-ink-900"
        >
          <Pencil className="size-3.5" />
          {t.auth.editPhone}
        </button>

        <button
          type="button"
          onClick={() => void resend()}
          disabled={remaining > 0 || resending}
          className="tap-safe inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-ink-400 disabled:no-underline"
        >
          <RotateCw className="size-3.5" />
          {remaining > 0
            ? t.auth.resendIn.replace("{seconds}", localizeDigits(remaining, locale))
            : t.auth.resendCode}
        </button>
      </div>
    </form>
  );
}
