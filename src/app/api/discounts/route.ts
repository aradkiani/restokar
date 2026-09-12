import { fail, ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth/guards";
import { DiscountCodeInput } from "@/lib/discounts";

export const runtime = "nodejs";

/**
 * Discount codes for one venue.
 *
 * `requireOwner`, not `requireBranchOperator`: a code changes what every guest
 * is charged, which is the same class of decision as the tax rate and the
 * service charge next to it in More Options. A branch manager runs a site's
 * service; it does not set the chain's prices.
 */
export const GET = route(async () => {
  const { restaurantId } = await requireOwner();

  const codes = await prisma.discountCode.findMany({
    where: { restaurantId },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return ok(codes);
});

export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireOwner();
  const input = await parseBody(request, DiscountCodeInput);

  /*
    Checked before inserting *and* caught below.

    The read tells the owner which code clashed, which the database error
    cannot. The catch is still needed because two tabs can pass this check at
    the same time — the unique index is what actually guarantees it, and this
    is only the good error message.
  */
  const clash = await prisma.discountCode.findUnique({
    where: { restaurantId_code: { restaurantId, code: input.code } },
    select: { id: true },
  });

  if (clash) {
    return fail(409, `کد «${input.code}» از قبل ساخته شده است`, "DISCOUNT_CODE_EXISTS");
  }

  try {
    const created = await prisma.discountCode.create({
      data: {
        restaurantId,
        code: input.code,
        type: input.type,
        value: input.value,
        // Only a percentage carries a ceiling; the schema already refuses the
        // other combination, and this makes the stored row say the same thing.
        maxDiscount: input.type === "PERCENT" ? (input.maxDiscount ?? null) : null,
        isActive: input.isActive ?? true,
      },
    });

    return ok(created, { status: 201 });
  } catch {
    // Lost the race against another tab; the index held, so say the same thing.
    return fail(409, `کد «${input.code}» از قبل ساخته شده است`, "DISCOUNT_CODE_EXISTS");
  }
});
