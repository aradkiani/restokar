import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guards";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { AdminAccountSchema } from "@/lib/validation";
import { subscriptionEndFromDays } from "@/lib/onboarding";
import { recordAudit } from "@/lib/audit";
import { DEFAULT_TEMPLATE_ID } from "@/templates/registry";
import { snapshotLimits } from "@/lib/plan-terms";
import { hashPassword } from "@/lib/auth/password";

export const runtime = "nodejs";

/**
 * Creates a customer account by hand — the stand-in for self-service signup
 * while the payment gateway is disconnected.
 *
 * Mirrors the public registration route rather than inventing a second way to
 * make a tenant: same uniqueness checks, same one-transaction creation of user
 * + restaurant + subscription. A half-created account (a user with no
 * restaurant) would leave the customer stuck on a dashboard they cannot use,
 * and staff without the means to diagnose it.
 *
 * The difference from registration is the subscription: instead of a fixed
 * trial, staff set the term they actually sold.
 */
export const POST = route(async (request: Request) => {
  const admin = await requireAdmin();

  // Same protection as the other writing admin endpoint: this one mints
  // credentials, so a compromised admin session should not be able to create
  // accounts in bulk unnoticed.
  const limit = await rateLimit(`admin:account:${admin.id}:${clientIp(request)}`, {
    limit: 30,
    windowSeconds: 300,
  });
  if (!limit.allowed) return fail(429, "Too many attempts", "RATE_LIMITED");

  const input = await parseBody(request, AdminAccountSchema);

  const [existingUser, existingRestaurant, plan] = await Promise.all([
    prisma.user.findUnique({ where: { phone: input.ownerPhone }, select: { id: true } }),
    prisma.restaurant.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    prisma.plan.findUnique({ where: { code: input.planCode } }),
  ]);

  if (existingUser) return fail(409, "Phone number unavailable", "PHONE_TAKEN");
  if (existingRestaurant) return fail(409, "Address already taken", "SLUG_TAKEN");
  if (!plan) return fail(404, "Plan not found", "PLAN_NOT_FOUND");

  const currentPeriodEnd = subscriptionEndFromDays(input.durationDays, new Date());

  const ownerPasswordHash = input.ownerPassword
    ? await hashPassword(input.ownerPassword)
    : null;

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({
        data: {
          // With a first password from platform staff, or none — then the owner
          // activates the account with one code and picks their own.
          phone: input.ownerPhone,
          passwordHash: ownerPasswordHash,
          name: input.ownerName,
          role: "OWNER",
        },
      });

      const restaurant = await tx.restaurant.create({
        data: {
          slug: input.slug,
          name: input.restaurantName,
          ownerId: owner.id,
          templateId: DEFAULT_TEMPLATE_ID,
        },
      });

      await tx.user.update({
        where: { id: owner.id },
        data: { restaurantId: restaurant.id },
      });

      await tx.subscription.create({
        data: {
          restaurantId: restaurant.id,
          planId: plan.id,
          // ACTIVE rather than TRIALING: staff grant this against a real
          // agreement, so it is not a trial and should not read as one in the
          // admin console or the owner's dashboard.
          status: "ACTIVE",
          interval: "monthly",
          currentPeriodEnd,
          limitsSnapshot: snapshotLimits(plan),
        },
      });

      return { restaurantId: restaurant.id, slug: restaurant.slug, phone: owner.phone };
    });
  } catch (error) {
    // The findUnique checks above are advisory only: two staff members
    // onboarding the same customer at once both pass them, and the loser hits
    // the unique index. Registration already translates this; without the same
    // handling here the admin console showed a bare 500 for what is a normal,
    // explainable collision.
    const code = (error as { code?: string })?.code;
    const target = String((error as { meta?: { target?: unknown } })?.meta?.target ?? "");

    if (code === "P2002") {
      if (target.includes("phone")) {
        return fail(409, "Phone number unavailable", "PHONE_TAKEN");
      }
      if (target.includes("slug")) {
        return fail(409, "Address already taken", "SLUG_TAKEN");
      }
      return fail(409, "That account already exists", "PHONE_TAKEN");
    }
    throw error;
  }

  // Creating an account mints a credential for someone else, which is exactly
  // the class of action the trail exists for. Recorded against the new tenant
  // so it also shows up in that venue's own history, and never throws.
  await recordAudit({
    actor: admin,
    restaurantId: created.restaurantId,
    action: "ACCOUNT_CREATED",
    summary: `حساب «${input.restaurantName}» برای ${created.phone} ساخته شد (${input.durationDays} روز)`,
    entityType: "Restaurant",
    entityId: created.restaurantId,
    metadata: {
      slug: created.slug,
      planCode: input.planCode,
      durationDays: input.durationDays,
    },
    ip: clientIp(request),
  });

  // The password is deliberately not echoed back. Staff already have it — they
  // chose it — and returning it would put a plaintext credential into response
  // logs and browser history for no benefit.
  return ok({ ...created, currentPeriodEnd });
});
