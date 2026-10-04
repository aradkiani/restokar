import { z } from "zod";
import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { publishOrderEvent } from "@/lib/events";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/constants";
import { toEnglishDigits } from "@/lib/format";

export const runtime = "nodejs";

const StaffCallInput = z.object({
  slug: z.string().min(1),
  tableNumber: z
    .string()
    .trim()
    .min(1, "شماره میز را وارد کنید")
    .max(20, "شماره میز بیش از حد بلند است"),
  note: z.string().trim().max(200).optional(),
  /** Come to the table, or bring the bill. */
  kind: z.enum(["CALL", "BILL"]).default("CALL"),
});

/**
 * A guest asking for a member of staff.
 *
 * Public and unauthenticated by necessity — the caller is someone sitting at a
 * table with a QR code — so it is rate limited per IP and carries no identity
 * beyond a table number. The restaurant is resolved from the slug rather than
 * from anything the client asserts, and the call is rejected unless that venue
 * has actually switched the feature on.
 *
 * Delivery is the existing SSE bus the order board already listens to. No SMS
 * gateway and no external service is involved.
 */
export const POST = route(async (request: Request) => {
  const limit = await rateLimit(`staff-call:${clientIp(request)}`, RATE_LIMITS.staffCall);
  if (!limit.allowed) {
    return fail(
      429,
      "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
      "RATE_LIMITED",
    );
  }

  const input = await parseBody(request, StaffCallInput);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      isActive: true,
      isPublished: true,
      staffCallEnabled: true,
    },
  });

  if (!restaurant || !restaurant.isActive || !restaurant.isPublished) {
    return fail(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");
  }
  if (!restaurant.staffCallEnabled) {
    return fail(403, "Staff call is disabled", "STAFF_CALL_DISABLED");
  }

  // Normalised the same way order table numbers are, so «۵» and "5" reach the
  // dashboard as one table rather than two.
  const tableNumber = toEnglishDigits(input.tableNumber);

  const call = await prisma.staffCall.create({
    data: {
      restaurantId: restaurant.id,
      tableNumber,
      note: input.note ?? null,
      kind: input.kind,
    },
    select: { id: true, createdAt: true },
  });

  publishOrderEvent({
    type: "staff.called",
    restaurantId: restaurant.id,
    tableNumber,
    at: call.createdAt.toISOString(),
  });

  return ok({ id: call.id }, { status: 201 });
});
