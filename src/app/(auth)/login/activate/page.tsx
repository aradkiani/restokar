import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { ActivateForm } from "./form";

export const metadata: Metadata = {
  title: "فعال‌سازی حساب",
  robots: { index: false, follow: true },
};

/** For an account someone else created, or one from before passwords. */
export default async function ActivatePage() {
  const { t } = await getI18n();
  return (
    <div>
      <h1 className="text-2xl font-black text-ink-900">{t.auth.activateTitle}</h1>
      <p className="mt-1.5 text-sm leading-7 text-ink-500">{t.auth.activateSubtitle}</p>

      <ActivateForm />

      <p className="mt-6 text-center text-sm text-ink-600">
        {t.auth.hasAccount}{" "}
        <Link href="/login" className="font-bold text-brand-700 hover:underline">
          {t.auth.loginLink}
        </Link>
      </p>
    </div>
  );
}
