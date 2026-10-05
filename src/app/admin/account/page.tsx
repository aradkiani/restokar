import type { Metadata } from "next";
import { requirePageAdmin } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { PasswordChangeCard } from "@/components/auth/password-change-card";

export const metadata: Metadata = { title: "حساب کاربری من" };
export const dynamic = "force-dynamic";

/** The platform admin's own password. */
export default async function AdminAccountPage() {
  const user = await requirePageAdmin();
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{t.account.title}</h1>
        <p className="mt-1 text-sm text-ink-500">{t.account.subtitle}</p>
      </header>
      <PasswordChangeCard phone={user.phone} />
    </div>
  );
}
