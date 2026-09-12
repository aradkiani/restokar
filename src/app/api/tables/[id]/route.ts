import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireTab } from "@/lib/auth/guards";

export const runtime = "nodejs";

export const DELETE = route(async (_request: Request, context: unknown) => {
  const { restaurantId } = await requireTab("qr");
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const existing = await prisma.restaurantTable.findFirst({
    where: { id, restaurantId },
    select: { id: true },
  });
  if (!existing) throw new HttpError(404, "Table not found", "NOT_FOUND");

  await prisma.restaurantTable.delete({ where: { id } });

  return ok({ id });
});
