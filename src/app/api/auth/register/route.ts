import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { RegisterSchema } from "@/lib/validation";
import { createSession } from "@/lib/auth/session";
import {
  otpVerifyFailure,
  verifyOtp,
  type OtpVerifyOutcome,
} from "@/lib/auth/otp-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { DAY_MS, RATE_LIMITS, TRIAL_DAYS } from "@/lib/constants";
import { PUBLIC_REGISTRATION_ENABLED } from "@/lib/features";
import { DEFAULT_TEMPLATE_ID } from "@/templates/registry";
import { snapshotLimits } from "@/lib/plan-terms";

export const runtime = "nodejs";

/** Thrown inside the transaction so a refused code rolls everything back. */
class CodeRejected extends Error {
  constructor(readonly outcome: Exclude<OtpVerifyOutcome, "VALID">) {
    super(outcome);
  }
}

/**
 * Creates the owner, their restaurant and a trial subscription in one
 * transaction — with the code that proves the phone number consumed inside it.
 *
 * Consuming the code in the same transaction is what makes a late failure
 * recoverable: if the menu address was taken a moment ago, everything rolls
 * back, the code included, and the owner picks another address and submits the
 * same code again. A half-registered account with a user but no tenant would
 * leave someone stuck on a dashboard they cannot use.
 */
export const POST = route(async (request: Request) => {
  // Enforced here rather than only by hiding the form: the endpoint is the
  // boundary, and a disabled signup that still accepts a hand-made POST is not
  // disabled at all.
  if (!PUBLIC_REGISTRATION_ENABLED) {
    return fail(403, "Registration is currently by invitation", "REGISTRATION_CLOSED");
  }

  const ip = clientIp(request);
  const limit = await rateLimit(`register:${ip}`, RATE_LIMITS.register);
  if (!limit.allowed) {
    return fail(429, "Too many attempts", "RATE_LIMITED");
  }

  const input = await parseBody(request, RegisterSchema);

  // Checked before the code is touched, so a taken address costs no attempt.
  const existingRestaurant = await prisma.restaurant.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (existingRestaurant) return fail(409, "Menu address already taken", "SLUG_TAKEN");

  // Everyone starts on the cheapest public plan; upgrades happen later from
  // the subscription page.
  const starterPlan = await prisma.plan.findFirst({
    where: { isPublic: true },
    orderBy: { sortOrder: "asc" },
  });

  let user: { id: string; role: "OWNER"; restaurantId: string };

  try {
    user = await prisma.$transaction(async (tx) => {
      const outcome = await verifyOtp({
        phone: input.phone,
        purpose: "SIGNUP",
        code: input.code,
        ip,
        db: tx,
      });
      if (outcome !== "VALID") throw new CodeRejected(outcome);

      const owner = await tx.user.create({
        data: {
          phone: input.phone,
          phoneVerifiedAt: new Date(),
          name: input.name,
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
            limitsSnapshot: snapshotLimits(starterPlan),
            status: "TRIALING",
            interval: "monthly",
            currentPeriodEnd: new Date(Date.now() + TRIAL_DAYS * DAY_MS),
          },
        });
      }

      return { id: owner.id, role: "OWNER" as const, restaurantId: restaurant.id };
    });
  } catch (error) {
    if (error instanceof CodeRejected) return otpVerifyFailure(error.outcome);

    // Two people submitting at the same moment both pass the checks above and
    // the loser hits a unique index. A taken number is answered as a wrong
    // code — a sign-up code is never texted to a registered number, so saying
    // "already registered" here would be the one place that revealed it.
    const code = (error as { code?: string })?.code;
    const target = String((error as { meta?: { target?: unknown } })?.meta?.target ?? "");

    if (code === "P2002") {
      if (target.includes("slug"))
        return fail(409, "Menu address already taken", "SLUG_TAKEN");
      return otpVerifyFailure("INVALID");
    }
    throw error;
  }

  await createSession(user, {
    userAgent: request.headers.get("user-agent"),
    ip,
  });

  return ok({ redirectTo: "/dashboard" }, { status: 201 });
});
