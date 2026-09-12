import "server-only";
import { prisma } from "./prisma";

/**
 * How much of a venue's menu actually exists in English.
 *
 * The bilingual switch is cheap to turn on and expensive to notice you have
 * half-finished: the owner sees Persian either way, while the guest who picked
 * English is the one who ends up reading a mixed menu. This gives the owner the
 * number before that happens.
 */
export interface TranslationStatus {
  categories: { translated: number; total: number };
  products: { translated: number; total: number };
  /** True when nothing is missing, so the UI can say "done" rather than "N of N". */
  complete: boolean;
}

/**
 * A product counts as translated when it has an English name, and an English
 * short description *if* it has a Persian one. The full description and info
 * sections are deliberately not required: they are optional extras on the
 * detail sheet, and demanding them would leave the counter permanently short of
 * complete for venues that never wrote them in Persian either.
 */
export async function getTranslationStatus(
  restaurantId: string,
): Promise<TranslationStatus> {
  const [categoryTotal, categoryTranslated, products] = await Promise.all([
    prisma.category.count({ where: { restaurantId } }),
    prisma.category.count({
      where: { restaurantId, NOT: { nameEn: null }, nameEn: { not: "" } },
    }),
    prisma.product.findMany({
      where: { restaurantId },
      select: { nameEn: true, shortDescription: true, shortDescriptionEn: true },
    }),
  ]);

  const productsTranslated = products.filter((product) => {
    if (!product.nameEn?.trim()) return false;
    if (product.shortDescription?.trim())
      return Boolean(product.shortDescriptionEn?.trim());
    return true;
  }).length;

  return {
    categories: { translated: categoryTranslated, total: categoryTotal },
    products: { translated: productsTranslated, total: products.length },
    complete:
      categoryTranslated === categoryTotal && productsTranslated === products.length,
  };
}
