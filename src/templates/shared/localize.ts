import { localizedText } from "@/lib/i18n/content";
import type { Locale } from "@/lib/i18n";
import type { MenuData } from "../types";

/**
 * Resolves every piece of owner-authored text in a menu to one language, once,
 * before any template sees it.
 *
 * Templates used to do this individually — `locale === "en" && p.nameEn ? … : …`
 * repeated at each call site — and the result was predictable: four templates
 * translated product names and two silently did not, because adding a template
 * meant remembering a rule that lived nowhere. Doing it here makes forgetting
 * impossible: a template renders `product.name` and gets the right language by
 * construction.
 *
 * The English fields are left on the objects rather than stripped. The product
 * sheet shows the English name as a subtitle beneath the Persian one, and the
 * search index deliberately matches against both languages at once so that
 * typing "latte" finds «لاته» whichever language the menu is currently in.
 */
export function localizeMenuData(
  data: MenuData,
  locale: Locale,
  /** Used when a bilingual venue never wrote an English staff-call label. */
  staffCallFallback: string,
): MenuData {
  // Persian is already the stored language, so there is nothing to resolve and
  // no reason to rebuild the object graph on every render.
  if (locale === "fa") return data;

  const { restaurant } = data;

  return {
    restaurant: {
      ...restaurant,
      name: localizedText(locale, restaurant.name, restaurant.nameEn),
      tagline: localizedText(locale, restaurant.tagline, restaurant.taglineEn),
      description: localizedText(
        locale,
        restaurant.description,
        restaurant.descriptionEn,
      ),
      // Falls back to the platform's own English wording rather than to the
      // Persian label — a guest reading the English menu cannot read either the
      // Persian button or the point of pressing it.
      staffCallLabel:
        localizedText(locale, null, restaurant.staffCallLabelEn) ?? staffCallFallback,
    },
    categories: data.categories.map((category) => ({
      ...category,
      name: localizedText(locale, category.name, category.nameEn),
      products: category.products.map((product) => ({
        ...product,
        name: localizedText(locale, product.name, product.nameEn),
        shortDescription: localizedText(
          locale,
          product.shortDescription,
          product.shortDescriptionEn,
        ),
        fullDescription: localizedText(
          locale,
          product.fullDescription,
          product.fullDescriptionEn,
        ),
        /*
          Deliberately does NOT fall back to the Persian note.

          `localizedText` is passed `null` as the Persian side, so an owner who
          wrote a Persian pairing line but no English one leaves this null and
          the sheet uses the platform's English phrase. Falling back the usual
          way would print a Persian sentence to a guest who chose the English
          menu — the same reasoning the staff-call label above already follows.
        */
        pairingNote: localizedText(locale, null, product.pairingNoteEn),
        infoSections: product.infoSections.map((section) => ({
          ...section,
          title: localizedText(locale, section.title, section.titleEn),
          content: localizedText(locale, section.content, section.contentEn),
        })),
        optionGroups: product.optionGroups.map((group) => ({
          ...group,
          name: localizedText(locale, group.name, group.nameEn),
          choices: group.choices.map((choice) => ({
            ...choice,
            name: localizedText(locale, choice.name, choice.nameEn),
          })),
        })),
      })),
    })),
  };
}
