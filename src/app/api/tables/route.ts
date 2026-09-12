import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireTab, requireTenant } from "@/lib/auth/guards";
import { TableSchema } from "@/lib/validation";
import { assertCanAddTable } from "@/lib/plans";

export const runtime = "nodejs";

export const GET = route(async () => {
  const { restaurantId } = await requireTenant();

  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "asc" },
  });

  return ok(tables);
});

export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireTab("qr");
  await assertCanAddTable(restaurantId);

  const input = await parseBody(request, TableSchema);

  const duplicate = await prisma.restaurantTable.findFirst({
    where: { restaurantId, number: input.number },
    select: { id: true },
  });
  // Fallback text only — the client renders the localized string from `code`.
  if (duplicate) throw new HttpError(409, "Table number already exists", "TABLE_EXISTS");

  const table = await prisma.restaurantTable.create({
    data: {
      restaurantId,
      number: input.number,
      label: input.label || null,
      seats: input.seats ?? null,
    },
  });

  return ok(table, { status: 201 });
});
