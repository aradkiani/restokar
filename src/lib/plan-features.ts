/**
 * The feature lines on a plan card.
 *
 * Display text only — what a plan actually allows is enforced from its limit
 * fields and the subscriber's snapshot (see plan-terms.ts). The built-in lists
 * are the ones the pricing page always showed, keyed by plan code instead of
 * by card position; an admin edit replaces them for that plan.
 *
 * Pure (no database), shared by the public pricing, the dashboard's plan
 * picker and the admin plan editor.
 */
import { fa, type Dictionary } from "./i18n/fa";
import { en } from "./i18n/en";
import type { Locale } from "./i18n";
import { formatNumber } from "./format";

export interface PlanFeature {
  fa: string;
  en: string;
}

type Line = (dict: Dictionary) => string;

const LINES: Record<string, Line[]> = {
  // Small — the whole product, at its smallest size.
  "tier-small": [
    (d) => d.subscription.unlimitedMenu,
    (d) => d.features.qrTitle,
    (d) => d.features.kitchenTitle,
    (d) => d.dashboard.analytics,
  ],
  // Medium — the money features.
  "tier-medium": [
    (d) => d.subscription.includesPrevious,
    (d) => d.features.paymentTitle,
    (d) => d.features.financeTitle,
    (d) => d.subscription.bilingualMenu,
  ],
  // Large — the ones a busy multi-room venue asks for.
  "tier-large": [
    (d) => d.subscription.includesPrevious,
    (d) => d.subscription.staffAccounts,
    (d) => d.subscription.bulkPricing,
    (d) => d.subscription.prioritySupport,
  ],
  "tier-chain": [
    (d) => d.subscription.includesPrevious,
    (d) => d.subscription.unlimitedBranches,
    (d) => d.subscription.sharedMenu,
    (d) => d.subscription.branchAccounts,
    (d) => d.subscription.perBranchRevenue,
    // No custom-domain line: serving a menu on a venue's own domain is not
    // built (it needs per-venue DNS, certificates and host routing), and a
    // pricing page must not sell what the product cannot do.
  ],
};

export function builtInFeatures(code: string): PlanFeature[] {
  return (LINES[code] ?? []).map((line) => ({
    fa: line(fa),
    en: line(en),
  }));
}

export const MAX_PLAN_FEATURES = 12;
export const MAX_PLAN_FEATURE_LENGTH = 80;

/** A stored list if it is a valid one, otherwise null. */
export function parseFeatures(value: unknown): PlanFeature[] | null {
  if (!Array.isArray(value)) return null;
  const out: PlanFeature[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    const faText = typeof record.fa === "string" ? record.fa.trim() : "";
    const enText = typeof record.en === "string" ? record.en.trim() : "";
    if (!faText) continue;
    out.push({ fa: faText, en: enText });
  }
  return out;
}

/** What the card shows: the admin's list when set, else the built-in one. */
export function planFeatures(plan: { code: string; features: unknown }): PlanFeature[] {
  return parseFeatures(plan.features) ?? builtInFeatures(plan.code);
}

/** One line in a locale; English falls back to Persian when left empty. */
export function featureText(feature: PlanFeature, locale: string): string {
  return locale === "en" && feature.en ? feature.en : feature.fa;
}

/**
 * Every line on a plan card: the two limits the price is based on (tables and
 * daily menu views — a contract tier has neither), then the feature lines.
 */
export function planLines(
  plan: {
    code: string;
    features: unknown;
    maxTables: number;
    maxDailyViews: number;
    isContractPriced: boolean;
  },
  t: Dictionary,
  locale: Locale,
): string[] {
  const amount = (value: number) =>
    value < 0 ? t.subscription.unlimited : formatNumber(value, locale);
  return [
    ...(plan.isContractPriced
      ? []
      : [
          `${amount(plan.maxTables)} ${t.subscription.limitTables}`,
          `${amount(plan.maxDailyViews)} ${t.subscription.limitDailyViews}`,
        ]),
    ...planFeatures(plan).map((feature) => featureText(feature, locale)),
  ];
}
