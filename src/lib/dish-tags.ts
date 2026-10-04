/**
 * What a guest needs to know about a dish before ordering it: is it spicy, is
 * it vegetarian, does it contain nuts.
 *
 * A fixed list rather than free text, for the same reason featured badges are
 * keys: «تند» and "Spicy" are one tag, and only a key can be translated, drawn
 * as the same icon on every template and filtered on. A venue that types its
 * own "very spicy!!" into a description still can; a tag is the structured
 * claim a guest can rely on.
 *
 * Deliberately short. Six covers what Iranian guests actually ask at the
 * table, and a list long enough to scroll is one owners stop filling in.
 *
 * Free of database and framework imports, like every domain module here.
 */
export const DISH_TAGS = [
  "spicy",
  "vegetarian",
  "vegan",
  "glutenFree",
  "containsNuts",
  "containsDairy",
] as const;

export type DishTag = (typeof DISH_TAGS)[number];

/** A small glyph per tag, so a chip reads at a glance on any template. */
export const DISH_TAG_ICONS: Record<DishTag, string> = {
  spicy: "🌶️",
  vegetarian: "🥬",
  vegan: "🌱",
  glutenFree: "🌾",
  containsNuts: "🥜",
  containsDairy: "🥛",
};

/**
 * Tags a guest can narrow the menu to.
 *
 * "Contains" tags are warnings, not preferences: nobody wants to see *only*
 * the dishes with nuts. Filtering on them would also mislead — a dish without
 * the tag is untagged, not certified nut-free.
 */
export const FILTERABLE_DISH_TAGS: readonly DishTag[] = [
  "spicy",
  "vegetarian",
  "vegan",
  "glutenFree",
];

export function isDishTag(value: unknown): value is DishTag {
  return typeof value === "string" && (DISH_TAGS as readonly string[]).includes(value);
}

/**
 * Reads tags from a stored row.
 *
 * Drops anything unrecognised and keeps the canonical order, so a tag retired
 * from the list later cannot crash a menu, and every template shows the chips
 * in the same order regardless of the order an owner ticked them.
 */
export function normaliseDishTags(
  values: readonly unknown[] | null | undefined,
): DishTag[] {
  if (!values?.length) return [];
  const present = new Set(values.filter(isDishTag));
  return DISH_TAGS.filter((tag) => present.has(tag));
}

/**
 * Vegan implies vegetarian, so a dish tagged vegan matches a vegetarian
 * filter even when the owner did not tick both.
 */
export function hasDishTag(tags: readonly DishTag[], wanted: DishTag): boolean {
  if (tags.includes(wanted)) return true;
  return wanted === "vegetarian" && tags.includes("vegan");
}

/** Whether a dish passes every active filter. No filter passes everything. */
export function matchesDishFilters(
  tags: readonly DishTag[],
  filters: readonly DishTag[],
): boolean {
  return filters.every((wanted) => hasDishTag(tags, wanted));
}
