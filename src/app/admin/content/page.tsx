import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { requirePageAdmin } from "@/lib/auth/guards";
import { documentStatuses } from "@/lib/cms/content-server";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "محتوای سایت" };
export const dynamic = "force-dynamic";

const GROUPS = [
  { key: "settings", title: "تنظیمات" },
  { key: "pages", title: "صفحه‌ها" },
  { key: "legal", title: "صفحه‌های حقوقی" },
] as const;

const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});

/** Every editable public document, with whether it is live, edited or default. */
export default async function ContentListPage() {
  await requirePageAdmin();
  const documents = await documentStatuses();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink-900">محتوای سایت</h1>
        <p className="mt-1 max-w-2xl text-sm leading-7 text-ink-600">
          متن صفحه‌های عمومی سایت را از اینجا ویرایش کنید. هر تغییر اول پیش‌نویس است؛ با
          «پیش‌نمایش» خودِ صفحه را می‌بینید و با «انتشار» برای همه نمایش داده می‌شود.
          قیمت‌ها و امکانات پلن‌ها از بخش{" "}
          <Link href="/admin/plans" className="font-bold text-brand-700 hover:underline">
            پلن‌ها
          </Link>{" "}
          ویرایش می‌شوند.
        </p>
      </div>

      {GROUPS.map((group) => {
        const rows = documents.filter((doc) => doc.group === group.key);
        if (rows.length === 0) return null;
        return (
          <Card key={group.key}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-ink-100">
                {rows.map((doc) => (
                  <li
                    key={doc.key}
                    className="flex flex-wrap items-center gap-3 px-5 py-4"
                  >
                    <Link
                      href={
                        doc.key === "site" ? "/admin/site" : `/admin/content/${doc.key}`
                      }
                      className="group min-w-0 flex-1"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-black text-ink-900 group-hover:text-brand-700">
                        {doc.title}
                        <ChevronLeft className="size-4 ltr:rotate-180" />
                      </span>
                      <span className="mt-0.5 block text-xs leading-6 text-ink-500">
                        {doc.description}
                      </span>
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      {doc.hasDraft && <Badge tone="warning">پیش‌نویس منتشرنشده</Badge>}
                      {doc.version > 0 ? (
                        <Badge tone="success">
                          نسخهٔ {doc.version.toLocaleString("fa-IR")} ·{" "}
                          {doc.publishedAt
                            ? dateTime.format(new Date(doc.publishedAt))
                            : ""}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">متن پیش‌فرض</Badge>
                      )}
                      <a
                        href={doc.previewPath}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-bold text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                      >
                        <ExternalLink className="size-3.5" />
                        مشاهده
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
