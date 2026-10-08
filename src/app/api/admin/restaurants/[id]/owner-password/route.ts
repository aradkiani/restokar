import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SetPasswordSchema } from "@/lib/validation";
import { PASSWORD_MESSAGES, passwordProblem } from "@/lib/auth/password";
import { replacePassword } from "@/lib/auth/set-password";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Platform staff give a venue's owner a new password, after confirming who is
 * asking — the support answer for an owner who cannot receive the reset text.
 *
 * Audited against the venue, and rate limited like every other admin action
 * that hands over access, so a compromised admin session cannot sweep through
 * owners' accounts quietly.
 */
export const POST = route(async (request: Request, context: unknown) => {
  const admin = await requireAdmin();
  const { id } = await (context as Context).params;

  const limit = await rateLimit(`admin-owner-password:${admin.id}`, {
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) return fail(429, "Too many attempts", "RATE_LIMITED");

  const venue = await prisma.restaurant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      owner: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!venue) throw new HttpError(404, "Restaurant not found", "NOT_FOUND");

  const input = await parseBody(request, SetPasswordSchema);
  const problem = passwordProblem(input.password, { phone: venue.owner.phone });
  if (problem) {
    return fail(422, "Invalid password", "VALIDATION_ERROR", {
      password: PASSWORD_MESSAGES[problem],
    });
  }

  await replacePassword(venue.owner, input.password);

  await recordAudit({
    actor: admin,
    restaurantId: venue.id,
    action: "PASSWORD_CHANGED",
    summary: `پشتیبانی رمز تازه برای مالک «${venue.name}» (${venue.owner.phone}) گذاشت`,
    entityType: "User",
    entityId: venue.owner.id,
    ip: clientIp(request),
  });

  return ok({ id: venue.owner.id });
});
