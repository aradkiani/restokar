import { ok, parseBody, route } from "@/lib/api";
import { requireOwner, requireTab } from "@/lib/auth/guards";
import { SupplierSchema } from "@/lib/validation";
import { listSuppliers, resolveStockScope, saveSupplier } from "@/lib/inventory-server";

export const runtime = "nodejs";

/**
 * Suppliers belong to the menu owner and are shared by every branch, like
 * the rest of the catalogue: anyone with the inventory section can read them
 * (to pick one on a purchase), only the owner can change them.
 */
export const GET = route(async () => {
  const scope = await resolveStockScope(await requireTab("inventory"));
  return ok(await listSuppliers(scope.ownerId));
});

export const POST = route(async (request: Request) => {
  const { restaurantId } = await requireOwner();
  const input = await parseBody(request, SupplierSchema);
  return ok(await saveSupplier(restaurantId, input), { status: 201 });
});
