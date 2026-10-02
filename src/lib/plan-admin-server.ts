import "server-only";
import { prisma } from "./prisma";
import { recordAudit } from "./audit";
import type { SessionUser } from "./auth/session";
import {
  describeChange,
  diffPlan,
  planState,
  type PlanChange,
  type PlanEditInput,
  type PlanState,
} from "./plan-edit";
import { Prisma } from "@/generated/prisma/client";

/**
 * Saving a plan edit.
 *
 * What a change reaches: the pricing pages and checkout at once (they read the
 * plan row); existing subscribers not at all until they buy or renew, because
 * their limits are frozen in `Subscription.limitsSnapshot` and their price was
 * fixed on the payment they made.
 *
 * Every save writes the new state to PlanVersion (plus the state before the
 * first edit, as version 0), so any earlier state can be inspected and put
 * back by saving it again.
 */

export type UpdatePlanResult =
  | { ok: true; version: number; changes: PlanChange[] }
  | { ok: false; reason: "NOT_FOUND" | "STALE" };

export async function updatePlan(
  planId: string,
  input: PlanEditInput,
  admin: SessionUser,
  ip: string | null,
): Promise<UpdatePlanResult> {
  const { expectedVersion, ...next } = input;
  const nextState: PlanState = next;

  const result = await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!plan) return { ok: false as const, reason: "NOT_FOUND" as const };
    // Someone else saved since this form was opened: refuse rather than
    // silently overwrite their change.
    if (plan.version !== expectedVersion) {
      return { ok: false as const, reason: "STALE" as const };
    }

    const before = planState(plan);
    const changes = diffPlan(before, nextState);
    if (changes.length === 0) {
      return { ok: true as const, version: plan.version, changes, name: plan.name };
    }

    const version = plan.version + 1;
    if (plan.version === 0) {
      await tx.planVersion.create({
        data: { planId, version: 0, data: before as Prisma.InputJsonValue },
      });
    }
    await tx.planVersion.create({
      data: {
        planId,
        version,
        data: nextState as Prisma.InputJsonValue,
        createdBy: admin.id,
      },
    });

    // One recommended plan at a time.
    if (nextState.isRecommended) {
      await tx.plan.updateMany({
        where: { id: { not: planId }, isRecommended: true },
        data: { isRecommended: false },
      });
    }

    await tx.plan.update({
      where: { id: planId },
      data: {
        ...nextState,
        promoStartsAt: nextState.promoStartsAt ? new Date(nextState.promoStartsAt) : null,
        promoEndsAt: nextState.promoEndsAt ? new Date(nextState.promoEndsAt) : null,
        features:
          nextState.features === null
            ? Prisma.DbNull
            : (nextState.features as Prisma.InputJsonValue),
        version,
      },
    });
    return { ok: true as const, version, changes, name: plan.name };
  });

  if (!result.ok) return result;
  if (result.changes.length > 0) {
    await recordAudit({
      actor: admin,
      restaurantId: null,
      action: "PLAN_UPDATED",
      summary: `پلن «${result.name}» ویرایش شد — ${result.changes.map(describeChange).join("، ")}`,
      entityType: "Plan",
      entityId: planId,
      metadata: {
        version: result.version,
        changes: result.changes.map(({ field, before, after }) => ({
          field,
          before,
          after,
        })),
      },
      ip,
    });
  }
  return { ok: true, version: result.version, changes: result.changes };
}

export async function listPlanVersions(planId: string) {
  const rows = await prisma.planVersion.findMany({
    where: { planId },
    orderBy: { version: "desc" },
    take: 50,
  });
  const actors = await prisma.user.findMany({
    where: {
      id: { in: rows.map((r) => r.createdBy).filter((id): id is string => !!id) },
    },
    select: { id: true, name: true, phone: true },
  });
  const nameOf = new Map(actors.map((a) => [a.id, a.name || a.phone || null]));
  return rows.map((row) => ({
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy ? (nameOf.get(row.createdBy) ?? null) : null,
    data: row.data as PlanState,
  }));
}
