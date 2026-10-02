"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { DEFAULT_TEMPLATE_ID } from "./registry";
import { MenuRuntimeProvider } from "./shared/runtime";
import { localizeMenuData } from "./shared/localize";
import type { MenuData, TemplateProps } from "./types";
import type { ResolvedTheme } from "@/lib/theme";
import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n/client";

/**
 * The id → component table.
 *
 * This is the mechanism behind "update a template once, every restaurant gets
 * it": a restaurant row stores the string `templateId` and nothing else, so the
 * component rendered for it is always whatever the platform currently ships
 * under that key.
 *
 * Each template is its own chunk. A guest's phone downloads the one design
 * their venue uses, not all eleven; the server still renders it in full, so
 * the menu text arrives in the HTML as before.
 */
const TEMPLATE_COMPONENTS: Record<string, React.ComponentType<TemplateProps>> = {
  aurora: dynamic(() => import("./aurora")),
  noir: dynamic(() => import("./noir")),
  ember: dynamic(() => import("./ember")),
  linen: dynamic(() => import("./linen")),
  bazaar: dynamic(() => import("./bazaar")),
  atlas: dynamic(() => import("./atlas")),
  reel: dynamic(() => import("./reel")),
  bloom: dynamic(() => import("./bloom")),
  kashi: dynamic(() => import("./kashi")),
  qalam: dynamic(() => import("./qalam")),
  vitrin: dynamic(() => import("./vitrin")),
};

export function MenuView({
  data,
  theme,
  templateId,
  locale,
  preview = false,
  presetTable = null,
}: {
  data: MenuData;
  theme: ResolvedTheme;
  templateId: string;
  locale: Locale;
  preview?: boolean;
  presetTable?: string | null;
}) {
  // An unknown id (a template we retired, say) degrades to the default rather
  // than rendering a blank page for a paying customer.
  const Template =
    TEMPLATE_COMPONENTS[templateId] ?? TEMPLATE_COMPONENTS[DEFAULT_TEMPLATE_ID];

  // Resolved once here so that every template — and every template added later —
  // renders the chosen language without having to know the rule.
  const localized = React.useMemo(
    () =>
      localizeMenuData(data, locale, getDictionary(locale).publicMenu.staffCallDefault),
    [data, locale],
  );

  return (
    <MenuRuntimeProvider
      data={localized}
      locale={locale}
      preview={preview}
      presetTable={presetTable}
    >
      <Template data={localized} theme={theme} locale={locale} preview={preview} />
    </MenuRuntimeProvider>
  );
}
