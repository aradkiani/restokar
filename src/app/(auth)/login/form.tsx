"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { CodeStep, type ResendResult } from "@/components/auth/code-step";
import { requestCode } from "@/components/auth/request-code";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";
import { mobileSchema } from "@/lib/validation";

type Step =
  | { kind: "phone" }
  | { kind: "code"; phone: string; codeLength: number; cooldownSeconds: number };

/**
 * Sign-in: a mobile number, then the code texted to it. No password.
 *
 * The number is checked here with the same schema the server uses, so a typo
 * is caught before anything is sent. What the server says next never depends
 * on whether the number has an account.
 */
export function LoginForm({ nextPath }: { nextPath?: string }) {
  const { t } = useI18n();
  const router = useRouter();

  const [phoneInput, setPhoneInput] = React.useState("");
  const [step, setStep] = React.useState<Step>({ kind: "phone" });
  const [error, setError] = React.useState<string | null>(null);
  const [phoneError, setPhoneError] = React.useState<string | undefined>();
  const [loading, setLoading] = React.useState(false);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPhoneError(undefined);

    const parsed = mobileSchema.safeParse(phoneInput);
    if (!parsed.success) {
      setPhoneError(parsed.error.issues[0]?.message ?? t.errors.required);
      return;
    }

    setLoading(true);
    const result = await requestCode(
      "/api/auth/otp",
      { phone: parsed.data, purpose: "LOGIN" },
      t,
    );
    setLoading(false);

    if (result.ok) {
      setStep({ kind: "code", phone: parsed.data, ...result });
    } else if (result.code === "OTP_COOLDOWN" && result.retryAfterSeconds) {
      // A code went out moments ago and still works.
      setStep({
        kind: "code",
        phone: parsed.data,
        codeLength: result.codeLength ?? 5,
        cooldownSeconds: result.retryAfterSeconds,
      });
    } else {
      setError(result.error);
    }
  }

  async function verify(phone: string, code: string): Promise<string | null> {
    const result = await api.post<{ redirectTo: string }>("/api/auth/login", {
      phone,
      code,
    });
    if (!result.ok) {
      const fields = localizeFieldErrors(result.error.details, t);
      return fields.code ?? localizeApiError(result.error, t);
    }

    // Only same-origin relative paths are honoured, so ?next= cannot be used
    // to bounce a freshly authenticated user to an attacker's site.
    const target =
      nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
        ? nextPath
        : result.data.redirectTo;

    router.replace(target);
    router.refresh();
    return null;
  }

  async function resend(phone: string): Promise<ResendResult> {
    const result = await requestCode("/api/auth/otp", { phone, purpose: "LOGIN" }, t);
    return result.ok
      ? { cooldownSeconds: result.cooldownSeconds }
      : { error: result.error, retryAfterSeconds: result.retryAfterSeconds };
  }

  if (step.kind === "code") {
    return (
      <CodeStep
        phone={step.phone}
        codeLength={step.codeLength}
        cooldownSeconds={step.cooldownSeconds}
        hint={t.auth.loginCodeHint}
        submitLabel={t.auth.submitLogin}
        onSubmit={(code) => verify(step.phone, code)}
        onResend={() => resend(step.phone)}
        onEditPhone={() => setStep({ kind: "phone" })}
      />
    );
  }

  return (
    <form onSubmit={sendCode} className="mt-8 space-y-4" noValidate>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Field label={t.auth.phone} htmlFor="phone" error={phoneError}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          required
          aria-invalid={Boolean(phoneError)}
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          placeholder={t.auth.phonePlaceholder}
        />
      </Field>

      <Button type="submit" size="lg" loading={loading} className="w-full">
        {t.auth.sendCode}
      </Button>
    </form>
  );
}
