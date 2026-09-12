import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { LoginForm } from "./form";

export const metadata: Metadata = {
  title: "ورود",
  description: "ورود به پنل مدیریت رستوران در منولند",
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { t } = await getI18n();
  const { next } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-black text-ink-900">{t.auth.loginTitle}</h1>
      <p className="mt-1.5 text-sm text-ink-500">{t.auth.loginSubtitle}</p>

      <LoginForm nextPath={next} />

      <p className="mt-6 text-center text-sm text-ink-600">
        {t.auth.noAccount}{" "}
        <Link href="/register" className="font-bold text-brand-700 hover:underline">
          {t.auth.registerLink}
        </Link>
      </p>
    </div>
  );
}
