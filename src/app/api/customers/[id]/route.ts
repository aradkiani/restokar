import { ok, parseBody, route } from "@/lib/api";
import { HttpError, requireOwner } from "@/lib/auth/guards";
import { CustomerConsentSchema } from "@/lib/validation";
import { getCustomer, setMarketingConsent } from "@/lib/customers-server";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * One customer's profile.
 *
 * Scoped by the session's tenant as well as the id, so an id belonging to
 * another venue is a 404 rather than a disclosure — the same rule every other
 * `[id]` route here follows, and it matters more than usual because the answer
 * would be somebody's phone number.
 */
export const GET = route(async (_request: Request, context: unknown) => {
  const { restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;

  const customer = await getCustomer(restaurantId, id);
  if (!customer) throw new HttpError(404, "Customer not found", "NOT_FOUND");

  return ok(customer);
});

/**
 * Records whether this guest agreed to be contacted.
 *
 * The only writable field. Everything else on the profile is derived from
 * orders, and an editable copy of a derived figure is a figure that can be made
 * to lie.
 *
 * Audited through the existing log: consent is the record that would matter if
 * a guest ever disputed being contacted, so who changed it and when is worth
 * more than the flag alone.
 */
export const PATCH = route(async (request: Request, context: unknown) => {
  const { user, restaurantId } = await requireOwner();
  const { id } = await (context as Context).params;

  const input = await parseBody(request, CustomerConsentSchema);

  const updated = await setMarketingConsent(restaurantId, id, input.marketingConsent);
  if (!updated) throw new HttpError(404, "Customer not found", "NOT_FOUND");

  await recordAudit({
    actor: user,
    restaurantId,
    action: "SETTINGS_CHANGED",
    summary: input.marketingConsent
      ? "رضایت دریافت پیام برای یک مشتری ثبت شد"
      : "رضایت دریافت پیام برای یک مشتری لغو شد",
    entityType: "Customer",
    entityId: id,
    // Deliberately no phone number in the metadata: an audit log is read by
    // more people than the customer list, and it does not need to carry the
    // identifier to record that the decision happened.
    metadata: { marketingConsent: input.marketingConsent },
  });

  const customer = await getCustomer(restaurantId, id);
  return ok(customer);
});
