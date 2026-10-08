import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { PasswordByCodeForm } from "../activate/form";

export const metadata: Metadata = {
  title: "بازیابی رمز عبور",
  robots: { index: false, follow: true },
};

/** A forgotten password, replaced after one texted code. */
export default async function ResetPasswordPage() {
  const { t } = await getI18n();
  return (
    <div>
      <h1 className="text-2xl font-black text-ink-900">{t.auth.resetTitle}</h1>
      <p className="mt-1.5 text-sm leading-7 text-ink-500">{t.auth.resetSubtitle}</p>

      <PasswordByCodeForm mode="reset" />

      <p className="mt-6 text-center text-sm text-ink-600">
        {t.auth.resetRemembered}{" "}
        <Link href="/login" className="font-bold text-brand-700 hover:underline">
          {t.auth.loginLink}
        </Link>
      </p>
    </div>
  );
}
