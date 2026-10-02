import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePageAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";
import { promoActive } from "@/lib/plan-terms";
import { Badge, Card, CardBody } from "@/components/ui/card";

export const metadata: Metadata = { title: "پلن‌ها" };
export const dynamic = "force-dynamic";

/**
 * Every plan, including hidden and retired ones — a venue may still be on a
 * retired plan, and its row is where its limits came from.
 */
export default async function PlansPage() {
  await requirePageAdmin();
  const now = new Date();
  const [plans, counts] = await Promise.all([
    prisma.plan.findMany({ orderBy: [{ isPublic: "desc" }, { sortOrder: "asc" }] }),
    prisma.subscription.groupBy({
      by: ["planId"],
      where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      _count: { _all: true },
    }),
  ]);
  const subscribers = new Map(counts.map((row) => [row.planId, row._count._all]));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink-900">پلن‌ها</h1>
        <p className="mt-1 max-w-2xl text-sm leading-7 text-ink-600">
          قیمت، تخفیف، امکانات و محدودیت هر پلن. تغییر قیمت یا محدودیت فقط برای خریدها و
          تمدیدهای بعدی اعمال می‌شود؛ مشترکان فعلی تا پایان دورهٔ پرداخت‌شده‌شان همان چیزی
          را دارند که خریده‌اند. پلن حذف نمی‌شود، فقط پنهان می‌شود.
        </p>
      </div>

      <Card>
        <CardBody className="p-0">
          <ul className="divide-y divide-ink-100">
            {plans.map((plan) => (
              <li key={plan.id}>
                <Link
                  href={`/admin/plans/${plan.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-ink-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-black text-ink-900">
                      {plan.name}
                      <span className="text-xs font-semibold text-ink-400" dir="ltr">
                        {plan.code}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-500">
                      {formatMoney(plan.monthlyPrice)} تومان ماهانه ·{" "}
                      {formatMoney(plan.yearlyPrice)} تومان سالانه
                      {" · "}
                      {(subscribers.get(plan.id) ?? 0).toLocaleString("fa-IR")} مشترک
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {plan.isPublic ? (
                      <Badge tone="success">در حال فروش</Badge>
                    ) : (
                      <Badge tone="neutral">پنهان</Badge>
                    )}
                    {plan.isRecommended && <Badge tone="brand">پیشنهاد ما</Badge>}
                    {plan.isContractPriced && <Badge tone="info">قراردادی</Badge>}
                    {promoActive(plan, now) && <Badge tone="warning">تخفیف فعال</Badge>}
                  </span>
                  <ChevronLeft className="size-4 text-ink-400 ltr:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
