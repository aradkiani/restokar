import { revalidatePath } from "next/cache";
import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireTab } from "@/lib/auth/guards";
import { DesignSchema } from "@/lib/validation";
import { isTemplateId } from "@/templates/registry";

export const runtime = "nodejs";

/**
 * Saves the template choice and theme overrides.
 *
 * Only the id and a small settings object are persisted — never a copy of the
 * template's markup — which is what allows a platform-side template update to
 * reach every restaurant using it without touching tenant data.
 */
export const PATCH = route(async (request: Request) => {
  const { restaurantId } = await requireTab("design");
  const input = await parseBody(request, DesignSchema);

  if (!isTemplateId(input.templateId)) {
    throw new HttpError(400, "Unknown template", "UNKNOWN_TEMPLATE");
  }

  const restaurant = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      templateId: input.templateId,
      theme: input.theme,
      // Spread rather than assigned: writing `undefined` would be a no-op in
      // Prisma today, but stating the intent here means a future refactor that
      // starts sending nulls cannot silently clear a venue's choice.
      ...(input.showProductPhotos === undefined
        ? {}
        : { showProductPhotos: input.showProductPhotos }),
    },
    select: { slug: true, templateId: true, theme: true, showProductPhotos: true },
  });

  // The public menu is cached for 60s; publish the change immediately so an
  // owner testing on their phone sees what they just saved.
  revalidatePath(`/menu/${restaurant.slug}`);

  return ok(restaurant);
});
