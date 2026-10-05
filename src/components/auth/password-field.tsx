"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { PASSWORD_MESSAGES, passwordProblem } from "@/lib/auth/password-rules";

/**
 * A password input with a show/hide button.
 *
 * Shown left-to-right like the phone field: a password is mostly Latin letters
 * and digits, and an RTL caret jumping around while typing one is how typos
 * happen. `autoComplete` tells the phone's password manager whether to offer a
 * saved password or suggest a new one.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = React.useState(false);

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          dir="ltr"
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          aria-invalid={Boolean(error)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pe-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t.auth.hidePassword : t.auth.showPassword}
          className="tap-safe absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-500 hover:bg-ink-100"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
}

/**
 * Checks a new password and its repeat with the server's own rules, returning
 * an error per field. Empty object when both are fine.
 */
export function newPasswordErrors(
  password: string,
  confirm: string,
  phone: string | null,
  messages: { differ: string },
  keys: { password: string; confirm: string } = {
    password: "password",
    confirm: "confirm",
  },
): Record<string, string> {
  const problem = passwordProblem(password, { phone });
  if (problem) return { [keys.password]: PASSWORD_MESSAGES[problem] };
  if (password !== confirm) return { [keys.confirm]: messages.differ };
  return {};
}
