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
          /*
            Loaded for the menu view — the mode that shows the dishes the way a
            guest sees them, for staff reading an order back over the phone.
            The short description is what distinguishes two similarly-named
            dishes; the photo is what makes the list scannable at a counter.
          */
          shortDescription: true,
          imageUrl: true,
          /*
            The whole option tree, not just whether one is required.

            The server has always accepted `choiceIds` on a manual order and
            priced them exactly as it does a guest's — `ManualOrderInput` is
            `CreateOrderInput` minus the slug. The pad simply never asked, so a
            dish with a required group could not be added at all. Now it asks.
          */
          optionGroups: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              isRequired: true,
              minSelect: true,
              maxSelect: true,
              choices: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  name: true,
                  priceDelta: true,
                  isAvailable: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return (
    <ManualOrderForm
      showPrices={venue.showPrices}
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        products: category.products.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.price,
          shortDescription: product.shortDescription,
          imageUrl: product.imageUrl,
          optionGroups: product.optionGroups,
        })),
      }))}
    />
  );
}
