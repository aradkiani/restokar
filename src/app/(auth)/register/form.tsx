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
import { RegisterDetailsSchema } from "@/lib/validation";
import { slugify } from "@/lib/utils";

type Details = { name: string; phone: string; restaurantName: string; slug: string };

type Step =
  | { kind: "details" }
  | { kind: "code"; details: Details; codeLength: number; cooldownSeconds: number };

/**
 * Sign-up: who you are and your venue, then the code that proves the number.
 *
 * The account is only created once the code is entered, so a number nobody can
 * receive texts on never becomes an account. If the menu address was taken in
 * the meantime the owner comes back here, picks another, and the same code
 * still works — the server rolled back without spending it.
 */
export function RegisterForm({ origin }: { origin: string }) {
  const { t } = useI18n();
  const router = useRouter();

  const [form, setForm] = React.useState({
    name: "",
    phone: "",
    restaurantName: "",
    slug: "",
  });
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [step, setStep] = React.useState<Step>({ kind: "details" });
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Suggest a slug from the venue name until the owner edits it themselves.
      if (key === "restaurantName" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = RegisterDetailsSchema.safeParse(form);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fields[key]) fields[key] = issue.message;
      }
      setFieldErrors(fields);
      return;
    }

    setLoading(true);
    const result = await requestCode(
      "/api/auth/otp",
      { phone: parsed.data.phone, purpose: "SIGNUP", slug: parsed.data.slug },
      t,
    );
    setLoading(false);

    if (result.ok) {
      setStep({ kind: "code", details: parsed.data, ...result });
    } else if (result.code === "OTP_COOLDOWN" && result.retryAfterSeconds) {
      // A code went out moments ago and still works.
      setStep({
        kind: "code",
        details: parsed.data,
        codeLength: result.codeLength ?? 5,
        cooldownSeconds: result.retryAfterSeconds,
      });
    } else if (result.code === "SLUG_TAKEN") {
      // Before any code is sent: the person picks another address and goes on.
      setFieldErrors({ slug: t.auth.slugTaken });
    } else {
      setFieldErrors(localizeFieldErrors(result.fieldErrors, t));
      setError(result.fieldErrors ? null : result.error);
    }
  }

  async function create(details: Details, code: string): Promise<string | null> {
    const result = await api.post<{ redirectTo: string }>("/api/auth/register", {
      ...details,
      code,
    });

    if (!result.ok) {
      if (result.error.code === "SLUG_TAKEN") {
        // Back to the details, with the address marked; the code is unspent.
        setStep({ kind: "details" });
        setFieldErrors({ slug: t.auth.slugTaken });
        return null;
      }
      const fields = localizeFieldErrors(result.error.details, t);
      return fields.code ?? localizeApiError(result.error, t);
    }

    router.replace(result.data.redirectTo);
    router.refresh();
    return null;
  }

  async function resend(phone: string): Promise<ResendResult> {
    const result = await requestCode("/api/auth/otp", { phone, purpose: "SIGNUP" }, t);
    return result.ok
      ? { cooldownSeconds: result.cooldownSeconds }
      : { error: result.error, retryAfterSeconds: result.retryAfterSeconds };
  }

  if (step.kind === "code") {
    return (
      <CodeStep
        phone={step.details.phone}
        codeLength={step.codeLength}
        cooldownSeconds={step.cooldownSeconds}
        hint={t.auth.registerCodeHint}
        submitLabel={t.auth.submitRegister}
        onSubmit={(code) => create(step.details, code)}
        onResend={() => resend(step.details.phone)}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.auth.name} htmlFor="name" error={fieldErrors.name}>
          <Input
            id="name"
            required
            autoComplete="name"
            aria-invalid={Boolean(fieldErrors.name)}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </Field>

        <Field label={t.auth.phone} htmlFor="phone" error={fieldErrors.phone}>
          <Input
            id="phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            required
            aria-invalid={Boolean(fieldErrors.phone)}
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder={t.auth.phonePlaceholder}
          />
        </Field>
      </div>

      <hr className="!my-6 border-ink-200" />

      <Field
        label={t.auth.restaurantName}
        htmlFor="restaurantName"
        error={fieldErrors.restaurantName}
      >
        <Input
          id="restaurantName"
          required
          aria-invalid={Boolean(fieldErrors.restaurantName)}
          value={form.restaurantName}
          onChange={(e) => update("restaurantName", e.target.value)}
          placeholder="کافه نبش"
        />
      </Field>

      <Field label={t.auth.restaurantSlug} htmlFor="slug" error={fieldErrors.slug}>
        <Input
          id="slug"
          required
          dir="ltr"
          aria-invalid={Boolean(fieldErrors.slug)}
          value={form.slug}
          onChange={(e) => {
            setSlugTouched(true);
            update("slug", slugify(e.target.value));
          }}
          placeholder="cafe-nabsh"
        />
        <p className="mt-1.5 truncate text-xs text-ink-500" dir="ltr">
          {t.auth.slugHint}{" "}
          <span className="font-bold text-brand-700">
            {origin}/menu/{form.slug || "your-cafe"}
          </span>
        </p>
      </Field>

      <Button type="submit" size="lg" loading={loading} className="w-full">
        {t.auth.sendCode}
      </Button>
    </form>
  );
}
