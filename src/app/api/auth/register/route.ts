import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { RegisterSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { DAY_MS, RATE_LIMITS, TRIAL_DAYS } from "@/lib/constants";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/features";
import { DEFAULT_TEMPLATE_ID } from "@/templates/registry";

export const runtime = "nodejs";

/**
 * Creates the owner, their restaurant and a trial subscription in one
 * transaction: a half-registered account with a user but no tenant would leave
 * someone stuck on a dashboard they cannot use.
 */
export const POST = route(async (request: Request) => {
  // Enforced here rather than only by hiding the form: the endpoint is the
  // boundary, and a disabled signup that still accepts a hand-made POST is not
  // disabled at all.
  if (!PUBLIC_REGISTRATION_ENABLED) {
    return fail(403, "Registration is currently by invitation", "REGISTRATION_CLOSED");
  }

  const limit = await rateLimit(`register:${clientIp(request)}`, RATE_LIMITS.register);
  if (!limit.allowed) {
    return fail(429, "Too many attempts", "RATE_LIMITED");
  }

  const input = await parseBody(request, RegisterSchema);

  const [existingUser, existingRestaurant] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    prisma.restaurant.findUnique({ where: { slug: input.slug }, select: { id: true } }),
  ]);

  // Fallback text only — the client renders the localized string from `code`.
  if (existingUser) return fail(409, "Email already registered", "EMAIL_TAKEN");
  if (existingRestaurant) return fail(409, "Menu address already taken", "SLUG_TAKEN");

  const passwordHash = await hashPassword(input.password);

  // Everyone starts on the cheapest public plan; upgrades happen later from
  // the subscription page.
  const starterPlan = await prisma.plan.findFirst({
    where: { isPublic: true },
    orderBy: { sortOrder: "asc" },
  });

  let user: { id: string; role: "OWNER"; restaurantId: string };

  try {
    user = await prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
          phone: input.phone || null,
          role: "OWNER",
        },
      });

      const restaurant = await tx.restaurant.create({
        data: {
          slug: input.slug,
          name: input.restaurantName,
          ownerId: owner.id,
          templateId: DEFAULT_TEMPLATE_ID,
          theme: {},
        },
      });

      // The owner is also a member of their own tenant — that membership is what
      // requireTenant() reads.
      await tx.user.update({
        where: { id: owner.id },
        data: { restaurantId: restaurant.id },
      });

      if (starterPlan) {
        await tx.subscription.create({
          data: {
            restaurantId: restaurant.id,
            planId: starterPlan.id,
            status: "TRIALING",
            interval: "monthly",
            currentPeriodEnd: new Date(Date.now() + TRIAL_DAYS * DAY_MS),
          },
        });
      }

      return { id: owner.id, role: "OWNER" as const, restaurantId: restaurant.id };
    });
  } catch (error) {
    // The findUnique checks above are advisory only: two people submitting the
    // same email or slug at the same moment both pass them, and the loser hits
    // the unique index. Translating P2002 here turns a 500 into the same clear
    // 409 the pre-check would have produced.
    const code = (error as { code?: string })?.code;
    const target = String((error as { meta?: { target?: unknown } })?.meta?.target ?? "");

    if (code === "P2002") {
      if (target.includes("email"))
        return fail(409, "Email already registered", "EMAIL_TAKEN");
      if (target.includes("slug"))
        return fail(409, "Menu address already taken", "SLUG_TAKEN");
      return fail(409, "That account already exists", "EMAIL_TAKEN");
    }
    throw error;
  }

  await createSession(user, {
    userAgent: request.headers.get("user-agent"),
    ip: clientIp(request),
  });

  return ok({ redirectTo: "/dashboard" }, { status: 201 });
});
