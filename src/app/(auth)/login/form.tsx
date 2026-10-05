"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { PasswordField } from "@/components/auth/password-field";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { localizeDigits } from "@/lib/format";
import { mobileSchema } from "@/lib/validation";

/**
 * Sign-in: mobile number and password. No code — the code is needed once, when
 * an account is created or activated.
 *
 * Every refusal reads the same, "the number or the password is wrong", whether
 * the number has an account or not; a locked number says for how long.
 */
export function LoginForm({ nextPath }: { nextPath?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [phoneError, setPhoneError] = React.useState<string | undefined>();
  const [loading, setLoading] = React.useState(false);
  const [showForgot, setShowForgot] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPhoneError(undefined);

    const parsed = mobileSchema.safeParse(phone);
    if (!parsed.success) {
      setPhoneError(parsed.error.issues[0]?.message ?? t.errors.required);
      return;
    }
    if (!password) {
      setError(t.auth.loginFailed);
      return;
    }

    setLoading(true);
    const result = await api.post<{ redirectTo: string }>("/api/auth/login", {
      phone: parsed.data,
      password,
    });
    setLoading(false);

    if (!result.ok) {
      const details = result.error.details as { minutes?: number } | undefined;
      setError(
        result.error.code === "LOGIN_LOCKED"
          ? t.auth.loginLocked.replace(
              "{minutes}",
              localizeDigits(String(details?.minutes ?? 15), locale),
            )
          : result.error.code === "LOGIN_FAILED"
            ? t.auth.loginFailed
            : localizeApiError(result.error, t),
      );
      return;
    }

    // Only same-origin relative paths are honoured, so ?next= cannot be used
    // to bounce a freshly authenticated user to an attacker's site.
    const target =
      nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
        ? nextPath
        : result.data.redirectTo;

    router.replace(target);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
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
          autoComplete="username"
          autoFocus
          required
          aria-invalid={Boolean(phoneError)}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t.auth.phonePlaceholder}
        />
      </Field>

      <PasswordField
        id="password"
        label={t.auth.password}
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />

      <Button type="submit" size="lg" loading={loading} className="w-full">
        {t.auth.submitLogin}
      </Button>

      <div className="space-y-2 text-center text-sm text-ink-600">
        <p>
          {t.auth.noPasswordYet}{" "}
          <Link
            href="/login/activate"
            className="font-bold text-brand-700 hover:underline"
          >
            {t.auth.activateLink}
          </Link>
        </p>
        <button
          type="button"
          onClick={() => setShowForgot((v) => !v)}
          aria-expanded={showForgot}
          className="font-semibold text-ink-500 hover:text-ink-800"
        >
          {t.auth.forgotPassword}
        </button>
        {showForgot && (
          <p className="text-xs leading-6 text-ink-500">{t.auth.forgotPasswordHint}</p>
        )}
      </div>
    </form>
  );
}
