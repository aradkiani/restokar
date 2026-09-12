import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polling fallback for the live status page when SSE cannot connect. */
export const GET = route(async (_request: Request, context: unknown) => {
  const { params } = context as { params: Promise<{ token: string }> };
  const { token } = await params;

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: {
      status: true,
      paymentStatus: true,
      orderNumber: true,
      preparingAt: true,
      readyAt: true,
      deliveredAt: true,
    },
  });

  if (!order) throw new HttpError(404, "Order not found", "ORDER_NOT_FOUND");

  return ok(order);
});
