import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { recordAudit } from "./audit";
import { HttpError } from "./auth/guards";
import { menuOwnerId } from "./menu";
import { soldOutUntil } from "./sold-out";
import type { SessionUser } from "./auth/session";

/**
 * "We're out of it" from the kitchen board.
 *
 * Staff with the orders section can do this without menu-editing rights: it
 * only ever hides a dish until the next morning (see `soldOutUntil`), and the
 * dish itself — name, price, recipe — is untouched. Per site, so one branch
 * running out says nothing about another.
 */

/** Dishes sold out at this site right now. Expired rows are simply ignored. */
export async function soldOutProductIds(
  siteId: string,
  now: Date = new Date(),
): Promise<Set<string>> {
  const rows = await prisma.soldOutProduct.findMany({
    where: { restaurantId: siteId, until: { gt: now } },
    select: { productId: true },
  });
  return new Set(rows.map((row) => row.productId));
}

export interface SoldOutBoardDish {
  id: string;
  name: string;
  categoryName: string;
  /** The owner's own switch; an owner-disabled dish cannot be "sold out". */
  isAvailable: boolean;
  soldOut: boolean;
  until: string | null;
}

/** Every dish this site serves, with whether it is sold out right now. */
export async function soldOutBoard(siteId: string): Promise<SoldOutBoardDish[]> {
  const site = await prisma.restaurant.findUnique({
    where: { id: siteId },
    select: { id: true, parentRestaurantId: true },
  });
  if (!site) return [];
  const now = new Date();

  const [products, soldOut] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId: menuOwnerId(site), category: { isActive: true } },
      orderBy: [
        { category: { sortOrder: "asc" } },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
      select: {
        id: true,
        name: true,
        isAvailable: true,
        category: { select: { name: true } },
      },
    }),
    prisma.soldOutProduct.findMany({
      where: { restaurantId: siteId, until: { gt: now } },
      select: { productId: true, until: true },
    }),
  ]);
  const untilById = new Map(soldOut.map((row) => [row.productId, row.until]));

  return products.map((product) => {
    const until = untilById.get(product.id) ?? null;
    return {
      id: product.id,
      name: product.name,
      categoryName: product.category.name,
      isAvailable: product.isAvailable,
      soldOut: until !== null,
      until: until?.toISOString() ?? null,
    };
  });
}

export async function setSoldOut(args: {
  siteId: string;
  productId: string;
  soldOut: boolean;
  user: SessionUser;
  ip: string | null;
}): Promise<{ soldOut: boolean; until: string | null }> {
  const site = await prisma.restaurant.findUnique({
    where: { id: args.siteId },
    select: { id: true, slug: true, parentRestaurantId: true },
  });
  if (!site) throw new HttpError(404, "Restaurant not found", "RESTAURANT_NOT_FOUND");

  // Only a dish this site actually serves — its own, or its chain's.
  const product = await prisma.product.findFirst({
    where: { id: args.productId, restaurantId: menuOwnerId(site) },
    select: { id: true, name: true },
  });
  if (!product) throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");

  let until: Date | null = null;
  if (args.soldOut) {
    until = soldOutUntil(new Date());
    await prisma.soldOutProduct.upsert({
      where: { restaurantId_productId: { restaurantId: site.id, productId: product.id } },
      create: {
        restaurantId: site.id,
        productId: product.id,
        until,
        createdBy: args.user.id,
      },
      update: { until, createdBy: args.user.id, createdAt: new Date() },
    });
  } else {
    await prisma.soldOutProduct.deleteMany({
      where: { restaurantId: site.id, productId: product.id },
    });
  }

  await recordAudit({
    actor: args.user,
    restaurantId: site.id,
    action: "SOLD_OUT_CHANGED",
    summary: args.soldOut
      ? `«${product.name}» برای امروز تمام شد`
      : `«${product.name}» دوباره موجود شد`,
    entityType: "Product",
    entityId: product.id,
    metadata: { soldOut: args.soldOut, until: until?.toISOString() ?? null },
    ip: args.ip,
  });

  // The guest menu reflects it on the next view.
  revalidatePath(`/menu/${site.slug}`);
  return { soldOut: args.soldOut, until: until?.toISOString() ?? null };
}
