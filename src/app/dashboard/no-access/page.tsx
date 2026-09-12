import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { requirePageTenant } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { Card, CardBody } from "@/components/ui/card";

export const metadata: Metadata = { title: "بدون دسترسی" };
export const dynamic = "force-dynamic";

/**
 * Where an account with no sections lands.
 *
 * `requirePageTenant` and nothing more, deliberately: this is the terminal
 * page for a refusal, so it has to render for anyone who is signed in. A guard
 * here that could redirect would recreate the loop it exists to end.
 */
export default async function NoAccessPage() {
  await requirePageTenant("/dashboard/no-access");
  const { t } = await getI18n();

  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700">
          <ShieldAlert className="size-6" />
        </span>
        <p className="text-base font-extrabold text-ink-900">{t.options.staffNoAccess}</p>
        <p className="max-w-sm text-sm leading-7 text-ink-500">
          {t.options.noAccessHint}
        </p>
      </CardBody>
    </Card>
  );
}
