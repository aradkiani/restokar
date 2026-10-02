"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { CodeStep, displayPhone, type ResendResult } from "@/components/auth/code-step";
import { requestCode } from "@/components/auth/request-code";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";
import { mobileSchema } from "@/lib/validation";

type Step =
  | { kind: "phone" }
  | { kind: "code"; phone: string; codeLength: number; cooldownSeconds: number };

/**
 * Moving the signed-in account to a new mobile number.
 *
 * The number only changes once a code texted to the *new* number is entered —
 * the account is the number, so an unproved one would be a way to lock
 * yourself, or someone else, out.
 */
export function PhoneChangeCard({ currentPhone }: { currentPhone: string | null }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [phoneInput, setPhoneInput] = React.useState("");
  const [phoneError, setPhoneError] = React.useState<string | undefined>();
  const [step, setStep] = React.useState<Step>({ kind: "phone" });
  const [loading, setLoading] = React.useState(false);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setPhoneError(undefined);

    const parsed = mobileSchema.safeParse(phoneInput);
    if (!parsed.success) {
      setPhoneError(parsed.error.issues[0]?.message ?? t.errors.required);
      return;
    }
    if (parsed.data === currentPhone) {
      setPhoneError(t.errors.codes.PHONE_TAKEN);
      return;
    }

    setLoading(true);
    const result = await requestCode("/api/account/phone", { phone: parsed.data }, t);
    setLoading(false);

    if (result.ok) {
      setStep({ kind: "code", phone: parsed.data, ...result });
    } else if (result.code === "OTP_COOLDOWN" && result.retryAfterSeconds) {
      setStep({
        kind: "code",
        phone: parsed.data,
        codeLength: result.codeLength ?? 5,
        cooldownSeconds: result.retryAfterSeconds,
      });
    } else {
      setPhoneError(result.error);
    }
  }

  async function save(phone: string, code: string): Promise<string | null> {
    const result = await api.patch("/api/account/phone", { phone, code });
    if (!result.ok) {
      const fields = localizeFieldErrors(result.error.details, t);
      return fields.code ?? localizeApiError(result.error, t);
    }

    toast.success(t.settings.phoneChanged);
    setPhoneInput("");
    setStep({ kind: "phone" });
    router.refresh();
    return null;
  }

  async function resend(phone: string): Promise<ResendResult> {
    const result = await requestCode("/api/account/phone", { phone }, t);
    return result.ok
      ? { cooldownSeconds: result.cooldownSeconds }
      : { error: result.error, retryAfterSeconds: result.retryAfterSeconds };
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.changePhone}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-xs leading-6 text-ink-500">{t.settings.changePhoneHint}</p>

        {currentPhone && (
          <p className="text-sm text-ink-700">
            {t.settings.currentPhone}:{" "}
            <bdi dir="ltr" className="font-bold text-ink-900">
              {displayPhone(currentPhone, locale)}
            </bdi>
          </p>
        )}

        {step.kind === "code" ? (
          <div className="max-w-sm">
            <CodeStep
              phone={step.phone}
              codeLength={step.codeLength}
              cooldownSeconds={step.cooldownSeconds}
              submitLabel={t.common.save}
              onSubmit={(code) => save(step.phone, code)}
              onResend={() => resend(step.phone)}
              onEditPhone={() => setStep({ kind: "phone" })}
            />
          </div>
        ) : (
          <form onSubmit={sendCode} className="flex flex-wrap items-end gap-3" noValidate>
            <Field
              label={t.settings.newPhone}
              htmlFor="new-phone"
              error={phoneError}
              className="min-w-56 flex-1"
            >
              <Input
                id="new-phone"
                type="tel"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={Boolean(phoneError)}
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder={t.auth.phonePlaceholder}
              />
            </Field>
            <Button type="submit" variant="outline" loading={loading}>
              {t.auth.sendCode}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
