"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { CodeStep, type ResendResult } from "@/components/auth/code-step";
import { requestCode } from "@/components/auth/request-code";
import { PasswordField, newPasswordErrors } from "@/components/auth/password-field";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";
import { mobileSchema } from "@/lib/validation";

type Step =
  | { kind: "details" }
  | { kind: "code"; phone: string; codeLength: number; cooldownSeconds: number };

/**
 * Activating an account that has no password yet: the number and the password
 * first — so a weak password is caught before any text is sent — then the one
 * code that proves the number. After this, sign-in is phone and password.
 */
export function ActivateForm() {
  const { t } = useI18n();
  const router = useRouter();

  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [step, setStep] = React.useState<Step>({ kind: "details" });
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = mobileSchema.safeParse(phone);
    if (!parsed.success) {
      setFieldErrors({ phone: parsed.error.issues[0]?.message ?? t.errors.required });
      return;
    }
    const problems = newPasswordErrors(password, confirm, parsed.data, {
      differ: t.auth.passwordsDiffer,
    });
    if (Object.keys(problems).length > 0) {
      setFieldErrors(problems);
      return;
    }

    setLoading(true);
    const result = await requestCode(
      "/api/auth/otp",
      { phone: parsed.data, purpose: "ACTIVATE" },
      t,
    );
    setLoading(false);

    if (result.ok) {
      setStep({ kind: "code", phone: parsed.data, ...result });
    } else if (result.code === "OTP_COOLDOWN" && result.retryAfterSeconds) {
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

  async function activate(phoneNumber: string, code: string): Promise<string | null> {
    const result = await api.post<{ redirectTo: string }>("/api/auth/activate", {
      phone: phoneNumber,
      code,
      password,
    });
    if (!result.ok) {
      const fields = localizeFieldErrors(result.error.details, t);
      if (fields.password) {
        setStep({ kind: "details" });
        setFieldErrors({ password: fields.password });
        return null;
      }
      return fields.code ?? localizeApiError(result.error, t);
    }
    router.replace(result.data.redirectTo);
    router.refresh();
    return null;
  }

  async function resend(phoneNumber: string): Promise<ResendResult> {
    const result = await requestCode(
      "/api/auth/otp",
      { phone: phoneNumber, purpose: "ACTIVATE" },
      t,
    );
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
        hint={t.auth.activateCodeHint}
        submitLabel={t.auth.submitActivate}
        onSubmit={(code) => activate(step.phone, code)}
        onResend={() => resend(step.phone)}
        onEditPhone={() => setStep({ kind: "details" })}
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

      <Field label={t.auth.phone} htmlFor="phone" error={fieldErrors.phone}>
        <Input
          id="phone"
          type="tel"
          dir="ltr"
          inputMode="tel"
          autoComplete="username"
          autoFocus
          required
          aria-invalid={Boolean(fieldErrors.phone)}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t.auth.phonePlaceholder}
        />
      </Field>

      <PasswordField
        id="password"
        label={t.auth.passwordNew}
        hint={t.auth.passwordRules}
        value={password}
        onChange={setPassword}
        error={fieldErrors.password}
        autoComplete="new-password"
      />
      <PasswordField
        id="confirm"
        label={t.auth.passwordConfirm}
        value={confirm}
        onChange={setConfirm}
        error={fieldErrors.confirm}
        autoComplete="new-password"
      />

      <Button type="submit" size="lg" loading={loading} className="w-full">
        {t.auth.sendCode}
      </Button>
    </form>
  );
}
