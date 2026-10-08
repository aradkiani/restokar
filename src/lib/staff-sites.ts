import "server-only";
import { prisma } from "./prisma";
import { HttpError } from "./auth/guards";

export interface StaffSite {
  id: string;
  name: string;
  isBranch: boolean;
}

/**
 * Where an owner may put a staff account: their own venue and, for a chain,
 * each of its branches.
 *
 * A branch's cashier belongs to that branch — its order board, its till, its
 * shelves — but the account is still the owner's to create and remove, like
 * every other grant. Branches are matched on both the parent and the owner, so
 * an id from another chain is simply not in the list.
 */
export async function staffSites(
  restaurantId: string,
  ownerId: string,
): Promise<StaffSite[]> {
  const venue = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      branches: {
        where: { ownerId },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!venue) return [];
  return [
    { id: venue.id, name: venue.name, isBranch: false },
    ...venue.branches.map((branch) => ({ ...branch, isBranch: true })),
  ];
}

/** One of the owner's sites, or a 404 for anything else. */
export function siteOf(sites: readonly StaffSite[], siteId: string): StaffSite {
  const site = sites.find((candidate) => candidate.id === siteId);
  if (!site) throw new HttpError(404, "Site not found", "NOT_FOUND");
  return site;
}
