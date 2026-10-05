import type { Metadata } from "next";
import { requirePageTenant } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { PasswordChangeCard } from "@/components/auth/password-change-card";
import { PhoneChangeCard } from "@/components/auth/phone-change-card";

export const metadata: Metadata = { title: "حساب کاربری من" };
export const dynamic = "force-dynamic";

/**
 * The signed-in person's own account, for every role in a venue — owner,
 * branch manager and staff. Nothing here touches the restaurant.
 */
export default async function AccountPage() {
  const { user } = await requirePageTenant("/dashboard/account");
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{t.account.title}</h1>
        <p className="mt-1 text-sm text-ink-500">{t.account.subtitle}</p>
      </header>
      <PasswordChangeCard phone={user.phone} />
      <PhoneChangeCard currentPhone={user.phone} />
    </div>
  );
}
