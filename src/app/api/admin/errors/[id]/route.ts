import { z } from "zod";
import { ok, parseBody, route } from "@/lib/api";
import { HttpError, requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const Input = z.object({ resolved: z.boolean() });

/** Marking an error resolved, or reopening it. Platform admin only. */
export const PATCH = route(async (request: Request, context: unknown) => {
  await requireAdmin();
  const { id } = await (context as Context).params;
  const { resolved } = await parseBody(request, Input);
  const updated = await prisma.errorEvent.updateMany({
    where: { id },
    data: { resolvedAt: resolved ? new Date() : null },
  });
  if (updated.count === 0) throw new HttpError(404, "Not found", "NOT_FOUND");
  return ok({ id, resolved });
});
