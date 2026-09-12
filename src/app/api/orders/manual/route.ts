import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireTab } from "@/lib/auth/guards";
import { CreateOrderInput, createOrder } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * An order written by staff on the venue's behalf.
 *
 * For a customer who telephoned, or one at the counter who cannot use the menu
 * on their own phone. It is a real order in every other respect: the same
 * prices, the same option rules, the same discount codes, the same kitchen
 * board and the same stock deduction.
 *
 * Behind `requireTab("orders")` — whoever runs the board is who takes orders —
 * and the venue comes from the session rather than the body, so this cannot be
 * pointed at another restaurant.
 */
const ManualOrderInput = CreateOrderInput.omit({ slug: true });

export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireTab("orders");

  const venue = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { slug: true },
  });
  if (!venue) throw new HttpError(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");

  const input = await parseBody(request, ManualOrderInput);

  /*
    `isManual` is passed here rather than read from the body.

    It is the one fact about this order that a client must not be able to
    assert: it means "a member of staff took this", and the proof of that is the
    guard above, not a boolean someone sent us.
  */
  const order = await createOrder({ ...input, slug: venue.slug }, { isManual: true });

  return ok(order, { status: 201 });
});
