import "server-only";
import { HttpError } from "./auth/guards";
import type { Prisma } from "@/generated/prisma/client";
import { MAX_BUNDLE_COMPONENTS, normaliseComponents } from "./bundles";
import type { BundleComponentInput } from "./validation";

/**
 * The database half of meal deals. The rules are in `bundles.ts`, which stays
 * pure; this is persistence and ownership.
 *
 * Named and shaped after `recommendations-server.ts` deliberately — the two
 * solve the same problem (an owner points at other products of theirs) and
 * should not have two different answers to it.
 */

/** What the editor round-trips, and what the product routes return. */
export const bundleItemSelect = {
  componentProductId: true,
  quantity: true,
} as const;

export const bundleItemOrderBy = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
] satisfies Prisma.ProductBundleItemOrderByWithRelationInput[];

/**
 * Replaces a bundle's contents, refusing anything that is not the owner's to
 * point at.
 *
 * The refusals mirror `replaceRecommendations` exactly, because the attack and
 * the mistake are the same:
 *
 *   * **self-reference** — a bundle containing itself. Also refused by a CHECK,
 *     and it matters more here than it does for a suggestion: `isBundleOrderable`
 *     resolves a deal's availability from its components, so a self-referencing
 *     row makes that rule recurse.
 *   * **cross-tenant** — a component belonging to another venue. Resolved by
 *     counting how many of the requested ids exist *within the tenant* rather
 *     than by trusting the ids, so a foreign product is simply not in the
 *     result and the count comes up short before anything is written.
 *   * **unknown** — a deleted product, which reads identically to a foreign one
 *     and is reported the same way. Telling them apart would confirm that some
 *     other venue owns that id.
 *
 * Replaced wholesale inside the caller's transaction, like `infoSections`,
 * `optionGroups`, the availability windows and the recommendations before it.
 *
 * Duplicates are folded rather than refused: an owner adding the same dish
 * twice means "two of these", which is what `normaliseComponents` records.
 */
export async function replaceBundleItems(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  bundleProductId: string,
  inputs: readonly BundleComponentInput[],
): Promise<void> {
  await tx.productBundleItem.deleteMany({ where: { bundleProductId } });

  const components = normaliseComponents(
    inputs.map((input) => ({
      productId: input.componentProductId,
      quantity: input.quantity,
    })),
  );

  if (components.length === 0) return;

  if (components.length > MAX_BUNDLE_COMPONENTS) {
    throw new HttpError(
      400,
      "تعداد اجزای این پیشنهاد بیش از حد مجاز است",
      "BUNDLE_TOO_MANY_COMPONENTS",
    );
  }

  if (components.some((component) => component.productId === bundleProductId)) {
    throw new HttpError(
      400,
      "یک پیشنهاد ویژه نمی‌تواند شامل خودش باشد",
      "BUNDLE_SELF_REFERENCE",
    );
  }

  // Scoped to the tenant, so ownership is proven by the query rather than
  // checked after the fact against ids the caller supplied.
  const owned = await tx.product.findMany({
    where: { id: { in: components.map((c) => c.productId) }, restaurantId },
    select: { id: true },
  });

  if (owned.length !== components.length) {
    throw new HttpError(400, "محصول انتخاب‌شده پیدا نشد", "BUNDLE_PRODUCT_NOT_FOUND");
  }

  await tx.productBundleItem.createMany({
    data: components.map((component, index) => ({
      // From the session, never the request body.
      restaurantId,
      bundleProductId,
      componentProductId: component.productId,
      quantity: component.quantity,
      // Position is the order, matching every other child collection here.
      sortOrder: index,
    })),
  });
}
