import type { Metadata } from "next";
import { requirePageTab } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { menuOwnerId } from "@/lib/menu";
import { ManualOrderForm } from "./form";

export const metadata: Metadata = { title: "سفارش دستی" };
export const dynamic = "force-dynamic";

/**
 * Writing an order on the venue's behalf — a phone order, or a customer at the
 * counter who cannot use the menu themselves.
 *
 * Behind the `orders` grant rather than owner-only: whoever runs the board is
 * who answers the telephone.
 *
 * Dishes come from the *menu owner*, so a branch taking a phone call offers the
 * chain's menu — the same set a guest scanning that branch's QR code would see.
 */
export default async function ManualOrderPage() {
  const { restaurantId } = await requirePageTab("orders", "/dashboard/orders/new");

  const venue = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, parentRestaurantId: true, showPrices: true },
  });
  if (!venue) return null;

  const categories = await prisma.category.findMany({
    where: { restaurantId: menuOwnerId(venue), isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      products: {
        where: { isAvailable: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          optionGroups: { select: { isRequired: true } },
        },
      },
    },
  });

  return (
    <ManualOrderForm
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        products: category.products.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.price,
          /*
            A dish with a required choice cannot be added from a flat list —
            there is no answer here to "chicken or beef?", and the server
            rightly refuses an order that skipped a required group. Those are
            shown but not addable, with the reason stated, rather than silently
            missing from a menu the person on the phone is reading aloud.
          */
          needsChoices: product.optionGroups.some((group) => group.isRequired),
        })),
      }))}
    />
  );
}
