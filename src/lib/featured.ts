/**
 * Which dishes a venue is currently pushing, and what to print on them.
 *
 * Merchandising, not marketing: an owner points at a dish and says "show this
 * one off, and call it the chef's choice until Sunday". There are no rules to
 * compose, no audience to target and no discount to apply — the price is the
 * price, and the whole feature is presentation.
 *
 * Free of database and framework imports like every other domain module here.
 * The one rule worth guarding is that a promotion can never contradict
 * availability, and that rule is a pure function of two dates and one boolean.
 */

/**
 * The badges an owner can choose from.
 *
 * Keys rather than text so the built-in ones translate — «پیشنهاد سرآشپز» and
 * "Chef's choice" are one badge, not two. `custom` is the escape hatch for a
 * venue whose wording is its own, and is the only value that reads
 * `featuredLabelText`.
 *
 * Deliberately short. A badge that does not fit on a product card at 320px is
 * not a badge, and a list long enough to browse is a list that invites an owner
 * to label every dish — which labels none of them.
 */
export const FEATURED_LABELS = [
  "chefsChoice",
  "popular",
  "isNew",
  "recommended",
  "specialToday",
  "limitedTime",
  "custom",
] as const;

export type FeaturedLabel = (typeof FEATURED_LABELS)[number];

/**
 * The labels that have a translation.
 *
 * `custom` is excluded by construction: it is the one value whose text comes
 * from the owner rather than the dictionary, so a lookup keyed by it would have
 * nothing to find. Stating that in the type means the renderer cannot get it
 * wrong instead of having to remember.
 */
export type BuiltInFeaturedLabel = Exclude<FeaturedLabel, "custom">;

export function isFeaturedLabel(value: string): value is FeaturedLabel {
  return (FEATURED_LABELS as readonly string[]).includes(value);
}

/** Longest custom badge that still fits a product card on a narrow phone. */
export const MAX_CUSTOM_LABEL_LENGTH = 20;

/** What the owner configured about promoting one dish. */
export interface FeaturedConfig {
  isFeatured: boolean;
  /** Absolute instants; null at either end means open-ended that way. */
  featuredFrom: Date | null;
  featuredUntil: Date | null;
}

/**
 * Whether a promotion window is open at a given instant.
 *
 * Half-open, `[from, until)`, matching how the weekly opening-hours windows in
 * `availability.ts` treat their boundaries — two promotions that hand over at
 * midnight should not both claim that minute.
 *
 * Absolute instants rather than the weekly recurrence Phase 2 stores, because
 * "this Friday to Sunday" is a different question from "every Friday" and one
 * shape cannot answer both. The instants are produced from the venue's own
 * timezone by the editor, so no zone arithmetic happens here.
 */
export function withinFeaturedWindow(config: FeaturedConfig, at: Date): boolean {
  const now = at.getTime();

  if (config.featuredFrom && now < config.featuredFrom.getTime()) return false;
  if (config.featuredUntil && now >= config.featuredUntil.getTime()) return false;

  return true;
}

/**
 * Whether a dish should be promoted right now.
 *
 * Three conditions, and the third is the one that matters: **a dish is never
 * promoted unless it can actually be ordered**. Featuring is a claim about what
 * a guest should buy, and making that claim about something sold out, outside
 * its serving hours, or in a closed category is the one way this feature could
 * actively damage a venue's credibility.
 *
 * `isAvailable` is not recomputed here — it is the effective answer the caller
 * already got from `resolveAvailability`, which remains the single source of
 * truth for availability. This function composes that answer; it does not
 * second-guess it.
 */
export function isFeaturedNow(
  config: FeaturedConfig & { isAvailable: boolean },
  at: Date,
): boolean {
  if (!config.isFeatured) return false;
  if (!config.isAvailable) return false;

  return withinFeaturedWindow(config, at);
}

/**
 * The badge to print, or null.
 *
 * Returns a key for the built-in labels and the owner's own text for `custom`,
 * so the caller renders one or the other without having to know the rule. A
 * `custom` label with nothing written in it yields no badge rather than an
 * empty pill.
 */
export function resolveFeaturedLabel(input: {
  featuredLabel: string | null;
  featuredLabelText: string | null;
}):
  { kind: "key"; value: BuiltInFeaturedLabel } | { kind: "text"; value: string } | null {
  if (!input.featuredLabel || !isFeaturedLabel(input.featuredLabel)) return null;

  if (input.featuredLabel === "custom") {
    const text = input.featuredLabelText?.trim();
    return text ? { kind: "text", value: text } : null;
  }

  return { kind: "key", value: input.featuredLabel };
}

/**
 * Featured dishes in the order the owner arranged them.
 *
 * `featuredOrder` first, then name, so two dishes left at the default 0 have a
 * stable order rather than whatever the database happened to return. A strip
 * that reshuffles between page loads reads as broken.
 */
export function sortFeatured<T extends { featuredOrder: number; name: string }>(
  products: readonly T[],
): T[] {
  return [...products].sort(
    (a, b) => a.featuredOrder - b.featuredOrder || a.name.localeCompare(b.name, "fa"),
  );
}

/**
 * How many featured dishes a guest is shown.
 *
 * A horizontal strip on a phone shows two and a half cards; eight is enough to
 * scroll through and few enough that an owner has to choose. Configured
 * beyond this, the extras simply are not shown.
 */
export const MAX_FEATURED_SHOWN = 8;
