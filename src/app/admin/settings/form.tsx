"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Mail, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";

/**
 * Where the twice-daily customer-data backup is delivered.
 *
 * The last-run panel is the reason this page is worth having at all. A backup
 * that silently stops is indistinguishable from one that is working, so the
 * outcome of the most recent run is shown here — including the error text when
 * it failed — rather than only in a log file on the server that nobody reads
 * until they need the backup and find it was never taken.
 */
export function BackupSettingsForm({
  initialEmail,
  smtpConfigured,
  lastBackupAt,
  lastBackupStatus,
  lastBackupError,
  lastBackupBytes,
}: {
  initialEmail: string;
  smtpConfigured: boolean;
  lastBackupAt: string | null;
  lastBackupStatus: string | null;
  lastBackupError: string | null;
  lastBackupBytes: number | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [email, setEmail] = React.useState(initialEmail);
  const [saving, setSaving] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setSaving(true);

    const result = await api.patch("/api/admin/settings", { backupEmail: email });
    setSaving(false);

    if (!result.ok) {
      setFieldErrors(localizeFieldErrors(result.error.details, t));
      toast.error(localizeApiError(result.error, t));
      return;
    }

    toast.success(t.admin.backupSaved);
    router.refresh();
  }

  const statusLabel =
    lastBackupStatus === "ok"
      ? t.admin.backupStatusOk
      : lastBackupStatus === "failed"
        ? t.admin.backupStatusFailed
        : lastBackupStatus === "not_configured"
          ? t.admin.backupStatusNotConfigured
          : lastBackupStatus === "too_large"
            ? t.admin.backupStatusTooLarge
            : null;

  const healthy = lastBackupStatus === "ok";

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-5 py-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.admin.backupTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm leading-7 text-ink-600">{t.admin.backupHint}</p>

          {!smtpConfigured && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-amber-50 p-3 text-xs leading-6 text-amber-900"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                SMTP_HOST is not set, so no backup can be emailed regardless of the
                address below. Configure SMTP in the server environment.
              </span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field
              label={t.admin.backupEmail}
              hint={t.admin.backupEmailHint}
              htmlFor="backupEmail"
              error={fieldErrors.backupEmail}
            >
              <Input
                id="backupEmail"
                name="backupEmail"
                type="email"
                dir="ltr"
                autoComplete="off"
                placeholder="ops@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={fieldErrors.backupEmail ? true : undefined}
              />
            </Field>

            <Button type="submit" disabled={saving}>
              <Mail className="size-4" />
              {saving ? "…" : t.common.save}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.backupLastRun}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {!lastBackupAt ? (
            <p className="text-sm text-ink-500">{t.admin.backupNeverRun}</p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold">
                {healthy ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="size-4 text-red-600" />
                )}
                <span className={healthy ? "text-emerald-700" : "text-red-700"}>
                  {statusLabel ?? lastBackupStatus}
                </span>
              </p>

              <p className="text-xs text-ink-500">
                <bdi dir="ltr">{new Date(lastBackupAt).toISOString()}</bdi>
                {lastBackupBytes ? (
                  <>
                    {" · "}
                    <bdi dir="ltr">{(lastBackupBytes / (1024 * 1024)).toFixed(2)} MB</bdi>
                  </>
                ) : null}
              </p>

              {lastBackupError && (
                <p
                  role="alert"
                  className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-xs leading-6 text-red-900"
                >
                  {lastBackupError}
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
