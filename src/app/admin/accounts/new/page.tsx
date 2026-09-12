import type { Metadata } from "next";
import { requirePageAdmin } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { NewAccountForm } from "./form";

export const metadata: Metadata = { title: "ساخت حساب" };
export const dynamic = "force-dynamic";

/**
 * Manual customer onboarding, for as long as checkout is switched off.
 *
 * Deliberately in the admin console rather than behind a script: whoever sells
 * the subscription is the person who needs to create the account, and asking
 * them to run `tsx` against production is how credentials end up in a shell
 * history.
 */
export default async function NewAccountPage() {
  await requirePageAdmin();
  const [{ locale }, plans] = await Promise.all([
    getI18n(),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <NewAccountForm
      baseUrl={env.NEXT_PUBLIC_APP_URL}
      plans={plans.map((plan) => ({
        code: plan.code,
        name: locale === "en" ? plan.nameEn : plan.name,
      }))}
    />
  );
}
