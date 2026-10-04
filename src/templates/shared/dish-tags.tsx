"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  DISH_TAG_ICONS,
  FILTERABLE_DISH_TAGS,
  normaliseDishTags,
  type DishTag,
} from "@/lib/dish-tags";
import { useMenu } from "./runtime";

/**
 * Dietary tags as every template shows them.
 *
 * Three shapes, one vocabulary: a few icons after a dish's name on the card,
 * labelled chips in the product sheet, and a filter row under the search
 * field. Templates place them; what they say is decided here.
 */

/**
 * Icons after a dish name, inline so they wrap and clamp with the name rather
 * than claiming a row of their own on a card that has no room for one.
 *
 * The glyphs are drawn by CSS rather than written into the text, so the
 * heading's text is still exactly the dish name — for copying, for search and
 * for anything that reads the page — while a screen reader hears the labels.
 */
export function DishTagIcons({ tags }: { tags: readonly DishTag[] }) {
  const { t } = useMenu();
  if (tags.length === 0) return null;
  const labels = tags.map((tag) => t.dishTags.labels[tag]).join("، ");
  return (
    <span
      role="img"
      aria-label={labels}
      title={labels}
      className="ms-1.5 inline-flex gap-0.5 align-[0.05em] text-[0.85em] leading-none"
    >
      {tags.map((tag) => (
        <span
          key={tag}
          aria-hidden
          data-icon={DISH_TAG_ICONS[tag]}
          className="before:content-[attr(data-icon)]"
        />
      ))}
    </span>
  );
}

/** Labelled chips for the product sheet, where there is room to spell it out. */
export function DishTagChips({
  tags,
  className,
}: {
  tags: readonly DishTag[];
  className?: string;
}) {
  const { t } = useMenu();
  if (tags.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label={t.dishTags.title}>
      {tags.map((tag) => (
        <li
          key={tag}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: "var(--m-primary-soft)", color: "var(--m-primary)" }}
        >
          <span aria-hidden>{DISH_TAG_ICONS[tag]}</span>
          {t.dishTags.labels[tag]}
        </li>
      ))}
    </ul>
  );
}

/**
 * The filters a guest can narrow the menu to.
 *
 * Only tags some dish on this menu actually carries: a "gluten-free" chip that
 * empties the menu is worse than no chip. Renders nothing at all for a menu
 * with no tagged dishes, so venues that never use the feature look exactly as
 * they did.
 */
export function DishTagFilter({
  value,
  onChange,
  className,
}: {
  value: readonly DishTag[];
  onChange: (next: DishTag[]) => void;
  className?: string;
}) {
  const { t, data } = useMenu();

  const offered = React.useMemo(() => {
    const present = new Set<DishTag>();
    for (const category of data.categories) {
      for (const product of category.products) {
        for (const tag of product.dietaryTags) present.add(tag);
      }
    }
    // Vegan dishes count as vegetarian, so the chip has something to show.
    if (present.has("vegan")) present.add("vegetarian");
    return FILTERABLE_DISH_TAGS.filter((tag) => present.has(tag));
  }, [data.categories]);

  if (offered.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t.dishTags.filterLabel}
      className={cn("-mx-1 no-scrollbar flex gap-1.5 overflow-x-auto px-1", className)}
    >
      {offered.map((tag) => {
        const on = value.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(
                on ? value.filter((x) => x !== tag) : normaliseDishTags([...value, tag]),
              )
            }
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-bold whitespace-nowrap transition-colors"
            style={
              on
                ? {
                    background: "var(--m-primary)",
                    borderColor: "var(--m-primary)",
                    color: "var(--m-primary-contrast)",
                  }
                : {
                    background: "transparent",
                    borderColor: "var(--m-border)",
                    color: "var(--m-text)",
                  }
            }
          >
            <span aria-hidden>{DISH_TAG_ICONS[tag]}</span>
            {t.dishTags.labels[tag]}
          </button>
        );
      })}
    </div>
  );
}
