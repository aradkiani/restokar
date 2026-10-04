import { ok, parseBody, route } from "@/lib/api";
import { requireOwner } from "@/lib/auth/guards";
import { SupplierSchema } from "@/lib/validation";
import { saveSupplier } from "@/lib/inventory-server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Renaming, re-numbering or retiring a supplier. Never deleted: invoices name it. */
export const PATCH = route(async (request: Request, context: unknown) => {
  const { restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;
  const input = await parseBody(request, SupplierSchema);
  return ok(await saveSupplier(restaurantId, { ...input, id }));
});
