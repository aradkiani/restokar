"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";
import { slugify } from "@/lib/utils";

export function RegisterForm({ origin }: { origin: string }) {
  const { t } = useI18n();
  const router = useRouter();

  const [form, setForm] = React.useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    restaurantName: "",
    slug: "",
  });
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    const result = await api.post<{ redirectTo: string }>("/api/auth/register", {
      ...form,
      phone: form.phone || undefined,
    });

    if (!result.ok) {
      const fields = localizeFieldErrors(result.error.details, t);
      setFieldErrors(fields);
      // With per-field messages on screen, a second generic banner repeating
      // them is noise — keep the banner for errors that belong to no field
      // (duplicate email, rate limit, network).
      setError(Object.keys(fields).length > 0 ? null : localizeApiError(result.error, t));
      setLoading(false);

      // Duplicate email / slug come back as codes rather than field errors,
      // so pin them to the input they actually refer to.
      if (result.error.code === "EMAIL_TAKEN") {
        setFieldErrors({ email: t.auth.emailTaken });
        setError(null);
      }
      if (result.error.code === "SLUG_TAKEN") {
        setFieldErrors({ slug: t.auth.slugTaken });
        setError(null);
      }
      return;
    }

    router.replace(result.data.redirectTo);
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.auth.name} htmlFor="name" error={fieldErrors.name}>
          <Input
            id="name"
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </Field>

        <Field
          label={t.auth.phone}
          hint={t.common.optional}
          htmlFor="phone"
          error={fieldErrors.phone}
        >
          <Input
            id="phone"
            type="tel"
            dir="ltr"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="0912…"
          />
        </Field>
      </div>

      <Field label={t.auth.email} htmlFor="email" error={fieldErrors.email}>
        <Input
          id="email"
          type="email"
          dir="ltr"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          placeholder="you@restaurant.com"
        />
      </Field>

      <Field label={t.auth.password} htmlFor="password" error={fieldErrors.password}>
        {/* Matches the input's `dir="ltr"` so the toggle lands on the same side
            as the reserved padding — see the note in the login form. */}
        <div className="relative" dir="ltr">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            dir="ltr"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            className="pe-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
            className="absolute end-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-ink-500 hover:text-ink-800"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p
          className={`mt-1.5 flex items-center gap-1 text-xs ${
            form.password.length >= 8 ? "text-emerald-600" : "text-ink-500"
          }`}
        >
          <Check className="size-3.5" />
          {t.auth.weakPassword}
        </p>
      </Field>

      <hr className="!my-6 border-ink-200" />

      <Field
        label={t.auth.restaurantName}
        htmlFor="restaurantName"
        error={fieldErrors.restaurantName}
      >
        <Input
          id="restaurantName"
          required
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
        {t.auth.submitRegister}
      </Button>
    </form>
  );
}
