import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCard, TriangleAlert } from "lucide-react";
import { isProd } from "@/lib/env";
import { getI18n } from "@/lib/i18n";
import { formatMoney } from "@/lib/format";

export const metadata = { robots: { index: false, follow: false } };

/**
 * Stand-in for a bank gateway when PAYMENT_PROVIDER=mock. It reproduces the
 * real shape of the flow — an external page the payer approves or abandons,
 * returning to our callback with an Authority and a Status — so the ordering
 * and subscription paths can be exercised end to end without a merchant
 * account.
 */
export default async function MockGatewayPage({
  searchParams,
}: {
  searchParams: Promise<{ authority?: string; amount?: string; callback?: string }>;
}) {
  // Never reachable in production: createPaymentProvider() refuses the mock
  // driver there, but this page is defended independently.
  if (isProd) notFound();

  const { t, locale } = await getI18n();
  const { authority, amount, callback } = await searchParams;

  if (!authority || !callback) notFound();

  const back = (status: "OK" | "NOK") => {
    const url = new URL(callback);
    url.searchParams.set("Authority", authority);
    url.searchParams.set("Status", status);
    return url.toString();
  };

  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-ink-100 px-5 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-ink-200 bg-surface p-6 shadow-[var(--shadow-lift)]">
        <p className="mb-5 flex items-center gap-2 rounded-[var(--radius-sm)] bg-amber-50 p-3 text-xs font-bold text-amber-900 ring-1 ring-amber-200">
          <TriangleAlert className="size-4 shrink-0" />
          درگاه آزمایشی — این صفحه فقط در محیط توسعه فعال است
        </p>

        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-ink-900 text-white">
            <CreditCard className="size-5" />
          </span>
          <div>
            <h1 className="text-base font-black text-ink-900">درگاه پرداخت</h1>
            <p className="font-mono text-[11px] text-ink-500" dir="ltr">
              {authority}
            </p>
          </div>
        </div>

        <dl className="my-6 space-y-2 rounded-[var(--radius-md)] bg-ink-50 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-600">{t.payment.amount}</dt>
            <dd className="font-black text-ink-900 tabular-nums">
              {formatMoney(Number(amount ?? 0), locale)} {t.common.toman}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2.5">
          <Link
            href={back("OK")}
            className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
          >
            پرداخت موفق
          </Link>
          <Link
            href={back("NOK")}
            className="inline-flex h-12 items-center justify-center rounded-full border border-ink-300 text-sm font-bold text-ink-700 transition-colors hover:border-ink-400"
          >
            انصراف از پرداخت
          </Link>
        </div>
      </div>
    </main>
  );
}
