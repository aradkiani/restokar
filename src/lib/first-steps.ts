/**
 * The "first steps" checklist on a new venue's dashboard.
 *
 * Pure: every step is ticked from what the venue already has, never from a
 * separate "done" flag, so the list cannot disagree with the menu it
 * describes. It disappears once every step is done — or once the venue has
 * plainly been trading for a while, so an established venue that never
 * uploaded a logo is not nagged forever.
 */

export type FirstStepKey = "details" | "menu" | "design" | "tables" | "order";

export interface FirstStep {
  key: FirstStepKey;
  done: boolean;
  href: string;
}

export interface VenueSetup {
  slug: string;
  logoUrl: string | null;
  tagline: string | null;
  phone: string | null;
  address: string | null;
  templateId: string;
  theme: unknown;
  products: number;
  tables: number;
  orders: number;
}

/** Orders after which the checklist stops showing, whatever is left. */
export const FIRST_STEPS_ORDER_LIMIT = 5;

export function firstSteps(venue: VenueSetup, defaultTemplateId: string): FirstStep[] {
  const themed =
    typeof venue.theme === "object" &&
    venue.theme !== null &&
    Object.keys(venue.theme).length > 0;
  return [
    {
      key: "details",
      done: Boolean(venue.logoUrl || venue.tagline || venue.phone || venue.address),
      href: "/dashboard/settings",
    },
    { key: "menu", done: venue.products > 0, href: "/dashboard/menu" },
    {
      key: "design",
      done: venue.templateId !== defaultTemplateId || themed,
      href: "/dashboard/design",
    },
    { key: "tables", done: venue.tables > 0, href: "/dashboard/qr" },
    { key: "order", done: venue.orders > 0, href: `/menu/${venue.slug}` },
  ];
}

export function showFirstSteps(steps: FirstStep[], orders: number): boolean {
  return orders < FIRST_STEPS_ORDER_LIMIT && steps.some((step) => !step.done);
}
