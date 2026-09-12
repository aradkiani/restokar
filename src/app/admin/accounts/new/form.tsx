"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { MAX_ONBOARDING_DAYS, MIN_ONBOARDING_DAYS } from "@/lib/constants";

interface PlanOption {
  code: string;
  name: string;
}

/** Durations staff actually sell, so the common cases are one tap. */
const PRESET_DAYS = [30, 90, 180, 365] as const;

export function NewAccountForm({
  baseUrl,
  plans,
}: {
  baseUrl: string;
  plans: PlanOption[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [form, setForm] = React.useState({
    ownerName: "",
    email: "",
    password: "",
    restaurantName: "",
    slug: "",
    planCode: plans[0]?.code ?? "",
    durationDays: 365,
  });
  const [saving, setSaving] = React.useState(false);
  const [created, setCreated] = React.useState<{ slug: string; email: string } | null>(
    null,
  );

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await api.post("/api/admin/accounts", form);
    setSaving(false);

    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }

    // The credentials stay on screen after success: staff have to read them
    // back to the customer, and a redirect would take the one copy of the
    // password with it.
    setCreated({ slug: form.slug, email: form.email });
    toast.success(t.admin.accountCreated);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{t.admin.newAccount}</h1>
        <p className="mt-1 text-sm text-ink-500">{t.admin.newAccountHint}</p>
      </header>

      {created && (
        <Card>
          <CardHeader>
            <CardTitle>{t.admin.accountCreated}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1.5 text-sm">
            <p className="text-ink-700">
              {t.auth.email}: <span dir="ltr">{created.email}</span>
            </p>
            <p className="text-ink-700" dir="ltr">
              {baseUrl}/menu/{created.slug}
            </p>
          </CardBody>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>{t.admin.newAccount}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.auth.name} htmlFor="a-owner">
                <Input
                  id="a-owner"
                  required
                  value={form.ownerName}
                  onChange={(e) => setField("ownerName", e.target.value)}
                />
              </Field>
              <Field label={t.auth.email} htmlFor="a-email">
                <Input
                  id="a-email"
                  type="email"
                  dir="ltr"
                  required
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </Field>
            </div>

            <Field
              label={t.auth.password}
              hint={t.admin.passwordHint}
              htmlFor="a-password"
            >
              <Input
                id="a-password"
                dir="ltr"
                required
                minLength={8}
                // Deliberately not type="password": staff are choosing this
                // value and then reading it aloud to the customer, so hiding it
                // behind dots only invites a typo neither party can see.
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.auth.restaurantName} htmlFor="a-restaurant">
                <Input
                  id="a-restaurant"
                  required
                  value={form.restaurantName}
                  onChange={(e) => setField("restaurantName", e.target.value)}
                />
              </Field>
              <Field
                label={t.auth.restaurantSlug}
                hint={`${baseUrl}/menu/…`}
                htmlFor="a-slug"
              >
                <Input
                  id="a-slug"
                  dir="ltr"
                  required
                  value={form.slug}
                  onChange={(e) => setField("slug", e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.subscription.title} htmlFor="a-plan">
                <Select
                  id="a-plan"
                  value={form.planCode}
                  onChange={(e) => setField("planCode", e.target.value)}
                >
                  {plans.map((plan) => (
                    <option key={plan.code} value={plan.code}>
                      {plan.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={t.admin.durationDays} htmlFor="a-days">
                <Input
                  id="a-days"
                  dir="ltr"
                  inputMode="numeric"
                  required
                  min={MIN_ONBOARDING_DAYS}
                  max={MAX_ONBOARDING_DAYS}
                  value={String(form.durationDays)}
                  onChange={(e) => setField("durationDays", Number(e.target.value))}
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              {PRESET_DAYS.map((days) => (
                <Button
                  key={days}
                  type="button"
                  variant="outline"
                  onClick={() => setField("durationDays", days)}
                >
                  <span dir="ltr">{days}</span>
                </Button>
              ))}
            </div>

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                {t.common.create}
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
