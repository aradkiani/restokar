"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";
import { passwordProblem, PASSWORD_MESSAGES } from "@/lib/auth/password-rules";

/** Lower-case letters without the ones people misread (i, l, o) and digits. */
const LETTERS = "abcdefghjkmnpqrstuvwxyz";

/** Four letters and four digits: easy to read out over the phone. */
function readablePassword(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const letters = Array.from(bytes.slice(0, 4), (b) => LETTERS[b % LETTERS.length]);
  const digits = Array.from(bytes.slice(4), (b) => String(b % 10));
  return [...letters, ...digits].join("");
}

/**
 * Setting a new password for someone else — the venue owner for their staff,
 * platform staff for an owner — to hand over in person or by phone.
 *
 * Closed it is one small button on the person's row; open, one field, a
 * "make one up" helper and save. The rules are checked here as typed and again
 * on the server.
 */
export function SetPasswordButton({
  endpoint,
  name,
  phone,
}: {
  endpoint: string;
  name: string;
  phone: string | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inputId = React.useId();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(value, { phone });
    if (problem) {
      setError(PASSWORD_MESSAGES[problem]);
      return;
    }
    setBusy(true);
    const result = await api.post(endpoint, { password: value });
    setBusy(false);
    if (!result.ok) {
      const fields = localizeFieldErrors(result.error.details, t);
      setError(fields.password ?? localizeApiError(result.error, t));
      return;
    }
    toast.success(t.team.passwordSet.replace("{name}", name));
    setOpen(false);
    setValue("");
    setError(null);
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound className="size-3.5" aria-hidden />
        {t.team.setPassword}
      </Button>
    );
  }

  return (
    <form
      onSubmit={save}
      aria-label={t.team.setPasswordFor.replace("{name}", name)}
      className="w-full space-y-2 rounded-[var(--radius-sm)] bg-ink-50 p-3"
    >
      <label htmlFor={inputId} className="block text-xs font-bold text-ink-700">
        {t.team.setPasswordFor.replace("{name}", name)}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={inputId}
          type="text"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          aria-invalid={Boolean(error)}
          className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue(readablePassword());
            setError(null);
          }}
        >
          {t.team.generatePassword}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
      <p className="text-[11px] leading-5 text-ink-500">{t.team.setPasswordHint}</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          {t.team.savePassword}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setValue("");
            setError(null);
          }}
        >
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}
