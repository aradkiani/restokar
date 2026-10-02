import "server-only";
import { prisma } from "./prisma";
import type { AuditAction } from "@/generated/prisma/enums";
import type { SessionUser } from "./auth/session";

/**
 * Append-only audit trail for security- and money-relevant actions.
 *
 * Design rules:
 *   * Recording NEVER throws. An audit write failing must not roll back the
 *     owner's actual work — a lost log line is bad, a lost price change is
 *     worse. Failures go to the server log instead.
 *   * The actor's sign-in number and role are snapshotted onto the row, so the trail
 *     survives the user being deleted.
 *   * `restaurantId` comes from the caller's already-verified tenant scope,
 *     never from request input — the same rule as every other tenant query.
 */

export interface AuditEntry {
  actor: Pick<SessionUser, "id" | "phone" | "role">;
  restaurantId: string | null;
  action: AuditAction;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        restaurantId: entry.restaurantId,
        actorUserId: entry.actor.id,
        // The number they signed in with; the id if an old account has none.
        actorLabel: entry.actor.phone ?? entry.actor.id,
        actorRole: entry.actor.role,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        summary: entry.summary.slice(0, 500),
        metadata: (entry.metadata ?? undefined) as never,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    // Deliberately swallowed — see the contract above.
    console.error("[audit] failed to record entry", entry.action, error);
  }
}

/**
 * Tenant-scoped read for the dashboard. Ordering is newest-first because the
 * question an owner asks is "what just happened?", not "what happened first?".
 */
export async function listAuditLog(restaurantId: string, take = 50) {
  return prisma.auditLog.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      summary: true,
      actorLabel: true,
      actorRole: true,
      entityType: true,
      createdAt: true,
    },
  });
}
