import type { Metadata } from "next";
import Link from "next/link";
import { requirePageAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@/generated/prisma/enums";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "گزارش تغییرات" };
export const dynamic = "force-dynamic";

/**
 * Who changed what, across the platform. "Platform" is the admin's own work —
 * site content, plans, accounts, subscription extensions, SMS requests;
 * "Restaurants" is what venues did in their own panels (prices, staff,
 * cancellations), which each owner also sees in their dashboard.
 */
const FILTERS: Record<string, { label: string; actions: AuditAction[] | null }> = {
  platform: {
    label: "پلتفرم",
    actions: [
      "CONTENT_PUBLISHED",
      "CONTENT_RESTORED",
      "PLAN_UPDATED",
      "ACCOUNT_CREATED",
      "SUBSCRIPTION_EXTENDED",
      "SMS_BROADCAST_STATUS_CHANGED",
    ],
  },
  content: { label: "محتوای سایت", actions: ["CONTENT_PUBLISHED", "CONTENT_RESTORED"] },
  plans: { label: "پلن‌ها", actions: ["PLAN_UPDATED"] },
  all: { label: "همه", actions: null },
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "مدیر پلتفرم",
  OWNER: "مالک",
  STAFF: "کارمند",
  BRANCH_MANAGER: "مدیر شعبه",
};

const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requirePageAdmin();
  const { type } = await searchParams;
  const filterKey = type && type in FILTERS ? type : "platform";
  const filter = FILTERS[filterKey]!;

  const entries = await prisma.auditLog.findMany({
    where: filter.actions ? { action: { in: filter.actions } } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { restaurant: { select: { name: true } } },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink-900">گزارش تغییرات</h1>
        <p className="mt-1 max-w-2xl text-sm leading-7 text-ink-600">
          هر انتشار محتوا، تغییر پلن و کار مهم دیگر با نام انجام‌دهنده و زمان آن ثبت
          می‌شود. این فهرست قابل ویرایش یا حذف نیست. ۲۰۰ مورد آخر نمایش داده می‌شود.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="نوع تغییر">
        {Object.entries(FILTERS).map(([key, value]) => (
          <Link
            key={key}
            href={key === "platform" ? "/admin/audit" : `/admin/audit?type=${key}`}
            aria-current={key === filterKey ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-bold",
              key === filterKey
                ? "bg-brand-600 text-white"
                : "bg-surface text-ink-600 ring-1 ring-ink-200 hover:text-ink-900",
            )}
          >
            {value.label}
          </Link>
        ))}
      </nav>

      <Card>
        <CardBody className="p-0">
          {entries.length === 0 ? (
            <EmptyState title="موردی ثبت نشده است" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {entries.map((entry) => (
                <li key={entry.id} className="space-y-1 px-5 py-3.5">
                  <p className="text-sm leading-7 text-ink-900">{entry.summary}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    <span>{dateTime.format(entry.createdAt)}</span>
                    <span dir="ltr">{entry.actorLabel}</span>
                    <Badge tone="neutral">
                      {ROLE_LABELS[entry.actorRole] ?? entry.actorRole}
                    </Badge>
                    {entry.restaurant && <span>{entry.restaurant.name}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
