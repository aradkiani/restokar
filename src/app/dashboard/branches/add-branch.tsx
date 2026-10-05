"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";

/**
 * Creates a branch and the account that runs it, in one step.
 *
 * Deliberately one form rather than two screens: a branch with no manager is a
 * menu address nobody can take an order from, and the server creates both in a
 * single transaction for the same reason.
 */
export function AddBranchForm({ baseUrl }: { baseUrl: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [managerName, setManagerName] = React.useState("");
  const [managerPhone, setManagerPhone] = React.useState("");
  const [managerPassword, setManagerPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);

    const result = await api.post("/api/branches", {
      name,
      slug,
      managerName,
      managerPhone,
      managerPassword,
      tableCount: 8,
    });

    setBusy(false);

    if (!result.ok) {
      const fields = localizeFieldErrors(result.error.details, t);
      toast.error(
        fields.managerPhone ??
          fields.managerPassword ??
          Object.values(fields)[0] ??
          localizeApiError(result.error, t),
      );
      return;
    }

    toast.success(t.branches.created);
    setName("");
    setSlug("");
    setManagerName("");
    setManagerPhone("");
    setManagerPassword("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.branches.addTitle}</CardTitle>
      </CardHeader>

      <CardBody>
        <p className="mb-4 text-sm leading-7 text-ink-600">{t.branches.addHint}</p>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t.branches.branchName}
              hint={t.branches.branchNameHint}
              htmlFor="branchName"
            >
              <Input
                id="branchName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>

            <Field label={t.branches.branchSlug} htmlFor="branchSlug">
              <Input
                id="branchSlug"
                value={slug}
                dir="ltr"
                onChange={(e) => setSlug(e.target.value)}
                required
              />
            </Field>
          </div>

          {slug && (
            <p className="text-xs text-ink-500" dir="ltr">
              {`${baseUrl}/menu/${slug}`}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t.branches.managerName} htmlFor="managerName">
              <Input
                id="managerName"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                required
              />
            </Field>

            <Field
              label={t.branches.managerPhone}
              hint={t.branches.managerPhoneHint}
              htmlFor="managerPhone"
            >
              <Input
                id="managerPhone"
                type="tel"
                dir="ltr"
                inputMode="tel"
                autoComplete="off"
                value={managerPhone}
                onChange={(e) => setManagerPhone(e.target.value)}
                placeholder={t.auth.phonePlaceholder}
                required
              />
            </Field>

            <Field
              label={t.auth.initialPassword}
              hint={t.auth.initialPasswordHint}
              htmlFor="managerPassword"
            >
              <Input
                id="managerPassword"
                type="text"
                dir="ltr"
                autoComplete="off"
                value={managerPassword}
                onChange={(e) => setManagerPassword(e.target.value)}
              />
            </Field>
          </div>

          <Button type="submit" disabled={busy}>
            <Plus className="size-4" />
            {t.branches.create}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
