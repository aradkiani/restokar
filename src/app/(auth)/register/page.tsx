import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { getI18n } from "@/lib/i18n";
import { RegisterForm } from "./form";
import { env } from "@/lib/env";
import { CONTACT } from "@/lib/constants";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/features";

export const metadata: Metadata = {
  title: "ثبت‌نام",
  description: "رستوران خود را ثبت کنید و منوی دیجیتال بسازید — ۱۴ روز رایگان.",
  // Nothing to index while the form is closed, and an indexed signup page that
  // cannot sign anyone up is a bad first impression from a search result.
  robots: PUBLIC_REGISTRATION_ENABLED ? undefined : { index: false, follow: true },
};

export default async function RegisterPage() {
  const { t } = await getI18n();
  const origin = env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "");

  /**
   * The route stays mounted while signup is closed rather than 404ing.
   *
   * The link is printed on marketing material and sits in the header, so the
   * useful thing for someone who arrives here is an explanation and a way to
   * reach a human — not a dead end that reads as a broken site.
   */
  if (!PUBLIC_REGISTRATION_ENABLED) {
    return (
      <div>
        <h1 className="text-2xl font-black text-ink-900">
          {t.auth.registrationClosedTitle}
        </h1>
        <p className="mt-3 text-sm leading-7 text-ink-600">
          {t.auth.registrationClosedBody}
        </p>

        <div className="mt-6 space-y-2 rounded-[var(--radius-md)] border border-ink-200 bg-ink-50/60 p-4">
          <a
            href={CONTACT.phoneHref}
            className="flex min-h-11 items-center gap-2.5 text-sm font-bold text-ink-800"
          >
            <Phone className="size-4 shrink-0 text-brand-600" />
            <span dir="ltr">{CONTACT.phone}</span>
          </a>
          <a
            href={`mailto:${CONTACT.email}`}
            className="flex min-h-11 items-center gap-2.5 text-sm font-bold text-ink-800"
          >
            <Mail className="size-4 shrink-0 text-brand-600" />
            <span dir="ltr">{CONTACT.email}</span>
          </a>
        </div>

        <p className="mt-6 text-center text-sm text-ink-600">
          {t.auth.hasAccount}{" "}
          <Link href="/login" className="font-bold text-brand-700 hover:underline">
            {t.auth.loginLink}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-ink-900">{t.auth.registerTitle}</h1>
      <p className="mt-1.5 text-sm text-ink-500">{t.auth.registerSubtitle}</p>

      <RegisterForm origin={origin} />

      <p className="mt-6 text-center text-sm text-ink-600">
        {t.auth.hasAccount}{" "}
        <Link href="/login" className="font-bold text-brand-700 hover:underline">
          {t.auth.loginLink}
        </Link>
      </p>
    </div>
  );
}
