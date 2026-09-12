"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const { t } = useI18n();
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    // Caught here rather than at the server so an empty submit gives an
    // instant, per-field answer instead of a round trip that used to come
    // back as the untranslated banner "Validation failed".
    const local: Record<string, string> = {};
    if (!email.trim()) local.email = t.errors.required;
    if (!password) local.password = t.errors.required;
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      setError(t.errors.fixErrors);
      return;
    }

    setLoading(true);

    const result = await api.post<{ redirectTo: string }>("/api/auth/login", {
      email,
      password,
    });

    if (!result.ok) {
      setError(localizeApiError(result.error, t));
      setFieldErrors(localizeFieldErrors(result.error.details, t));
      setLoading(false);
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
    <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Field label={t.auth.email} htmlFor="email" error={fieldErrors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          aria-invalid={Boolean(fieldErrors.email)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@restaurant.com"
        />
      </Field>

      <Field label={t.auth.password} htmlFor="password" error={fieldErrors.password}>
        {/* The wrapper matches the input's own `dir="ltr"`. Left as RTL, the
            button's `end-1` resolved to the left edge while the input reserved
            its `pe-11` padding on the right, so the eye sat on top of the first
            characters typed. Only the field is LTR; the label stays RTL. */}
        <div className="relative" dir="ltr">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            dir="ltr"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(fieldErrors.password)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pe-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
            className="tap-safe absolute end-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-ink-500 hover:text-ink-800"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <Button type="submit" size="lg" loading={loading} className="w-full">
        {t.auth.submitLogin}
      </Button>
    </form>
  );
}
