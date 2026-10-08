import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { SetPasswordSchema } from "@/lib/validation";
import { PASSWORD_MESSAGES, passwordProblem } from "@/lib/auth/password";
import { replacePassword } from "@/lib/auth/set-password";
import { staffSites } from "@/lib/staff-sites";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * The owner gives a staff member or branch manager a new password — the answer
 * to "I forgot my password" at the counter, without an SMS.
 *
 * Only for accounts at the owner's own sites, and only staff and branch
 * managers: never the owner's own account (that changes with the current
 * password) and never another venue's people — an id outside the owner's
 * sites simply does not exist here. The account is signed out everywhere, so
 * the new password is the only way back in.
 */
export const POST = route(async (request: Request, context: unknown) => {
  const { user, restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;
  const sites = await staffSites(restaurantId, user.id);

  const member = await prisma.user.findFirst({
    where: {
      id,
      restaurantId: { in: sites.map((site) => site.id) },
      role: { in: ["STAFF", "BRANCH_MANAGER"] },
    },
    select: { id: true, name: true, phone: true },
  });
  if (!member) throw new HttpError(404, "Account not found", "NOT_FOUND");

  const input = await parseBody(request, SetPasswordSchema);
  const problem = passwordProblem(input.password, { phone: member.phone });
  if (problem) {
    return fail(422, "Invalid password", "VALIDATION_ERROR", {
      password: PASSWORD_MESSAGES[problem],
    });
  }

  await replacePassword(member, input.password);

  await recordAudit({
    actor: user,
    restaurantId,
    action: "PASSWORD_CHANGED",
    summary: `رمز عبور تازه برای ${member.name} (${member.phone}) گذاشته شد`,
    entityType: "User",
    entityId: member.id,
    ip: clientIp(request),
  });

  return ok({ id: member.id });
});
