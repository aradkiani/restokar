"use client";

import * as React from "react";
import AuroraTemplate from "./aurora";
import NoirTemplate from "./noir";
import EmberTemplate from "./ember";
import LinenTemplate from "./linen";
import BazaarTemplate from "./bazaar";
import AtlasTemplate from "./atlas";
import ReelTemplate from "./reel";
import BloomTemplate from "./bloom";
import KashiTemplate from "./kashi";
import QalamTemplate from "./qalam";
import VitrinTemplate from "./vitrin";
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
 */
const TEMPLATE_COMPONENTS: Record<string, React.ComponentType<TemplateProps>> = {
  aurora: AuroraTemplate,
  noir: NoirTemplate,
  ember: EmberTemplate,
  linen: LinenTemplate,
  bazaar: BazaarTemplate,
  atlas: AtlasTemplate,
  reel: ReelTemplate,
  bloom: BloomTemplate,
  kashi: KashiTemplate,
  qalam: QalamTemplate,
  vitrin: VitrinTemplate,
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
