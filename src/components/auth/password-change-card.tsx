"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { PasswordField, newPasswordErrors } from "@/components/auth/password-field";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";

/**
 * Changing one's own password, for every role. The current password is asked
 * for even with a session open; every other device is signed out on success.
 */
export function PasswordChangeCard({ phone }: { phone: string | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const problems = newPasswordErrors(
      next,
      confirm,
      phone,
      { differ: t.auth.passwordsDiffer },
      { password: "newPassword", confirm: "confirm" },
    );
    if (!current) problems.currentPassword = t.errors.required;
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setBusy(true);
    const result = await api.post("/api/account/password", {
      currentPassword: current,
      newPassword: next,
    });
    setBusy(false);
    if (!result.ok) {
      const fields = localizeFieldErrors(result.error.details, t);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else toast.error(localizeApiError(result.error, t));
      return;
    }
    toast.success(t.account.passwordChanged);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" aria-hidden />
          {t.account.changePassword}
        </CardTitle>
      </CardHeader>
      <CardBody>
        <form
          onSubmit={submit}
          className="space-y-4"
          noValidate
          aria-label={t.account.changePassword}
        >
          <PasswordField
            id="currentPassword"
            label={t.account.currentPassword}
            value={current}
            onChange={setCurrent}
            error={errors.currentPassword}
            autoComplete="current-password"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <PasswordField
              id="newPassword"
              label={t.auth.passwordNew}
              hint={t.auth.passwordRules}
              value={next}
              onChange={setNext}
              error={errors.newPassword}
              autoComplete="new-password"
            />
            <PasswordField
              id="confirmPassword"
              label={t.auth.passwordConfirm}
              value={confirm}
              onChange={setConfirm}
              error={errors.confirm}
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>
              {t.account.savePassword}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
