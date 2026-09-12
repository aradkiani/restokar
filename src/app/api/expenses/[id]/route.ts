import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireTab } from "@/lib/auth/guards";
import { ExpenseSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function assertOwned(restaurantId: string, id: string) {
  const existing = await prisma.expense.findFirst({
    where: { id, restaurantId },
    select: { id: true },
  });
  if (!existing) throw new HttpError(404, "Expense not found", "NOT_FOUND");
}

export const PATCH = route(async (request: Request, context: unknown) => {
  const { restaurantId } = await requireTab("finance");
  const { id } = await (context as Context).params;
  await assertOwned(restaurantId, id);

  const input = await parseBody(request, ExpenseSchema.partial());

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.note !== undefined ? { note: input.note || null } : {}),
      ...(input.occurredAt !== undefined
        ? { occurredAt: new Date(input.occurredAt) }
        : {}),
      ...(input.isRecurring !== undefined ? { isRecurring: input.isRecurring } : {}),
    },
  });

  return ok(expense);
});

export const DELETE = route(async (_request: Request, context: unknown) => {
  const { restaurantId } = await requireTab("finance");
  const { id } = await (context as Context).params;
  await assertOwned(restaurantId, id);

  await prisma.expense.delete({ where: { id } });

  return ok({ id });
});
