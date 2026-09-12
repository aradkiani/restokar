import type { MenuCategory } from "../types";

/**
 * Identifies a "سوغاتی" (souvenir / gift) category.
 *
 * Recognised by name rather than by a database flag on purpose. Adding a column
 * would mean a migration, a new control in the menu builder and a concept every
 * template has to understand — for a section only one template renders. Naming
 * a category «سوغاتی» is what an owner would do anyway, so the convention costs
 * them nothing and costs the schema nothing.
 *
 * Any template that does not care simply renders the category inline like any
 * other, so nothing here can break the other five.
 */

/**
 * Persian is typed with several near-identical characters — Arabic ي/ك instead
 * of Persian ی/ک, and a zero-width non-joiner inside «سوغاتی‌ها». Folding those
 * away means the match does not depend on which keyboard the owner used.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/‌/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .trim();
}

const SOUVENIR_KEYWORDS = ["سوغات", "رهاورد", "ره اورد", "یادگاری", "souvenir", "gift"];

export function isSouvenirCategory(category: {
  name: string;
  nameEn?: string | null;
}): boolean {
  const haystack = normalize(`${category.name} ${category.nameEn ?? ""}`);
  return SOUVENIR_KEYWORDS.some((keyword) => haystack.includes(normalize(keyword)));
}

export interface SplitCategories {
  food: MenuCategory[];
  souvenirs: MenuCategory[];
}

/**
 * Splits the menu so souvenirs can be shown after the food, whatever order the
 * owner happened to sort their categories in. Relative order within each group
 * is preserved.
 */
export function splitSouvenirs(categories: MenuCategory[]): SplitCategories {
  const food: MenuCategory[] = [];
  const souvenirs: MenuCategory[] = [];

  for (const category of categories) {
    (isSouvenirCategory(category) ? souvenirs : food).push(category);
  }

  return { food, souvenirs };
}
