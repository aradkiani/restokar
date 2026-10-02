import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { planState } from "@/lib/plan-edit";
import { builtInFeatures } from "@/lib/plan-features";
import { listPlanVersions } from "@/lib/plan-admin-server";
import { PlanEditor } from "./editor";

export const metadata: Metadata = { title: "ویرایش پلن" };
export const dynamic = "force-dynamic";

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAdmin();
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) notFound();

  const [versions, subscribers] = await Promise.all([
    listPlanVersions(id),
    prisma.subscription.count({
      where: { planId: id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
    }),
  ]);

  return (
    <PlanEditor
      planId={plan.id}
      code={plan.code}
      isContractPriced={plan.isContractPriced}
      version={plan.version}
      initial={planState(plan)}
      builtIn={builtInFeatures(plan.code)}
      versions={versions}
      subscribers={subscribers}
    />
  );
}
