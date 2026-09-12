import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireTab } from "@/lib/auth/guards";
import { ExpenseSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const GET = route(async (request: Request) => {
  const { restaurantId } = await requireTab("finance");
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const expenses = await prisma.expense.findMany({
    where: {
      restaurantId,
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: 500,
  });

  return ok(expenses);
});

export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireTab("finance");
  const input = await parseBody(request, ExpenseSchema);

  const expense = await prisma.expense.create({
    data: {
      restaurantId,
      title: input.title,
      category: input.category,
      amount: input.amount,
      note: input.note || null,
      occurredAt: new Date(input.occurredAt),
      isRecurring: input.isRecurring,
    },
  });

  return ok(expense, { status: 201 });
});
