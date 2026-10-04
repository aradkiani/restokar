import type { ResolvedTheme } from "@/lib/theme";
import type { Locale } from "@/lib/i18n";
import type { SocialLink } from "@/lib/socials";

/**
 * The contract every menu template renders against.
 *
 * These are deliberately plain DTOs rather than Prisma model types: templates
 * run in the browser, and the shape below is the public surface the platform
 * promises them. Changing a database column therefore does not silently break
 * every template — the mapper in src/lib/menu.ts is the single place that has
 * to be updated.
 */

export interface MenuInfoSection {
  id: string;
  title: string;
  content: string;
  titleEn: string | null;
  contentEn: string | null;
  icon: string | null;
}

export interface MenuOptionChoice {
  id: string;
  name: string;
  nameEn: string | null;
  /** Signed change to the unit price, in whole Toman. */
  priceDelta: number;
  isAvailable: boolean;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  nameEn: string | null;
  isRequired: boolean;
  minSelect: number;
  /** 1 renders as radio buttons, higher as checkboxes. */
  maxSelect: number;
  /**
   * This group is the dish's size ladder, and may be offered as a one-tap
   * upgrade rather than only as a row inside the sheet.
   *
   * Carried rather than inferred because "which of these groups is the size"
   * is the owner's judgement, not something a heuristic on names should guess.
   * `resolveUpgrade` in src/lib/upgrades.ts turns it into an offer; a template
   * that ignores this flag simply renders the group as it always has.
   */
  isUpgrade: boolean;
  choices: MenuOptionChoice[];
}

/** One dish inside a meal deal, as the menu carries it. */
export interface MenuBundleComponent {
  productId: string;
  quantity: number;
}

/**
 * One co-occurrence pair, as raw counts.
 *
 * The counts rather than a finished score, so the client applies exactly the
 * thresholds the dashboard does — see `CO_OCCURRENCE_THRESHOLDS`. Nothing here
 * identifies a guest: it is four integers about two dishes.
 */
export interface MenuPairStat {
  sourceProductId: string;
  targetProductId: string;
  pairCount: number;
  sourceSupport: number;
  targetSupport: number;
  totalOrders: number;
}

export interface MenuProduct {
  id: string;
  name: string;
  nameEn: string | null;
  /**
   * Choices the guest makes before ordering. Empty for most products; the
   * product sheet shows nothing extra when it is.
   *
   * `costDelta` is deliberately absent from this contract — it is owner-only
   * profit data and this object is serialised to every guest's browser.
   */
  optionGroups: MenuOptionGroup[];
  shortDescription: string | null;
  fullDescription: string | null;
  shortDescriptionEn: string | null;
  fullDescriptionEn: string | null;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  isAvailable: boolean;
  /**
   * The dish is being promoted *right now*.
   *
   * The effective answer, not the stored switch: the mapper reports true only
   * while the owner's promotion window is open and the dish is actually
   * orderable. Templates that already read this flag therefore respect both
   * without knowing either rule exists — and nothing can be advertised that a
   * guest cannot buy.
   */
  isFeatured: boolean;
  /**
   * The badge to print on it: a key from `FEATURED_LABELS`, or null for none.
   *
   * Carried as the key rather than as finished text so the built-in badges
   * translate with the rest of the menu — the same reason category icons travel
   * as names. `<FeaturedBadge>` resolves it against the dictionary at render,
   * where the language is already known.
   */
  featuredLabel: string | null;
  /** The owner's own wording, meaningful only when `featuredLabel` is "custom". */
  featuredLabelText: string | null;
  /**
   * Position among the featured dishes, lowest first.
   *
   * Carried rather than pre-sorted because the products travel grouped by
   * category, and reordering them there would move a promoted dish within its
   * category on the normal menu. The strip sorts by this itself.
   */
  featuredOrder: number;
  prepMinutes: number | null;
  categoryId: string;
  infoSections: MenuInfoSection[];
  /**
   * Dishes the owner suggests alongside this one, in their chosen order.
   *
   * Ids rather than embedded products, and that is the whole design: every
   * suggested dish is already somewhere in `categories`, so referencing it
   * costs a cuid instead of a second copy of its name, description, image and
   * option groups. A venue with fifty suggestions adds well under a kilobyte to
   * a payload that is 11 KB gzipped, and there is no way for a duplicate copy
   * to disagree with the original about price or availability.
   *
   * Only ids of dishes actually rendered on this menu appear here, so a
   * suggestion pointing at something hidden simply is not listed.
   */
  recommendedProductIds: string[];

  /**
   * The dishes this one contains, when it is a meal deal. Empty for every
   * ordinary dish, which is exactly what makes it ordinary.
   *
   * Ids rather than embedded products, for the same reason
   * `recommendedProductIds` are: every component is already somewhere in
   * `categories`, so a second copy could only disagree with the first about
   * price or availability. The saving is computed from those live prices by
   * `bundles.ts` rather than stored, so it can never go stale against them.
   */
  bundleComponents: MenuBundleComponent[];

  /**
   * Dishes this venue's own bills say go with this one.
   *
   * Raw counts, not a ranking: the thresholds live in `co-occurrence.ts` and
   * are applied at render, so the guest menu and the owner's dashboard can
   * never disagree about what qualifies. Empty for a venue that has not traded
   * enough, which is the intended low-data answer — it falls back to whatever
   * the owner defined.
   */
  frequentlyWith: MenuPairStat[];

  /**
   * The owner's line introducing those pairings, already resolved to the
   * language the guest is reading by `localizeMenuData`.
   *
   * Null when the owner has not written one, which is the normal case — the
   * sheet then falls back to the platform's generic phrase rather than showing
   * a heading-shaped gap.
   */
  pairingNote: string | null;
  pairingNoteEn: string | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  nameEn: string | null;
  icon: string | null;
  /** An uploaded icon; takes precedence over the lucide `icon` name. */
  iconUrl: string | null;
  imageUrl: string | null;
  products: MenuProduct[];
}

export interface MenuRestaurant {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  tagline: string | null;
  description: string | null;
  taglineEn: string | null;
  descriptionEn: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string | null;
  phoneSecondary: string | null;
  address: string | null;
  instagram: string | null;
  /** Already validated and capped at three by the mapper. */
  socialLinks: SocialLink[];
  showPrices: boolean;
  /**
   * Whether the product detail sheet renders a photo. False is a deliberate
   * choice by a venue running a text-only menu — not an absence of data — so
   * the sheet omits the image rather than substituting a placeholder.
   */
  showProductPhotos: boolean;
  onlineOrderingEnabled: boolean;
  onlinePaymentEnabled: boolean;

  /** Pricing options, so the cart totals match what the server will charge. */
  taxEnabled: boolean;
  taxPercent: number;
  serviceChargeEnabled: boolean;
  serviceChargePercent: number;
  roundingIncrement: number;
  roundingDirection: string;
  tipEnabled: boolean;
  tipPercents: number[];
  minimumOrderAmount: number;
  /**
   * Whether checkout offers a discount-code field.
   *
   * Only whether to *ask* — never which codes exist or what they are worth.
   * The amount is resolved server-side at order time, so this payload cannot
   * be read to enumerate a venue's promotions.
   */
  discountCodesEnabled: boolean;

  /**
   * Whether checkout asks the guest for a phone number.
   *
   * Presentation only: the server drops a number sent while this is off, so a
   * template that ignored this flag could not smuggle one through.
   */
  phoneCollectionEnabled: boolean;

  /**
   * Whether checkout offers takeaway. Shown only when the guest did not arrive
   * through a table's QR code; the server re-checks it.
   */
  takeawayEnabled: boolean;

  /** "Call the waiter" button at the foot of every template. */
  staffCallEnabled: boolean;
  staffCallLabel: string;
  staffCallLabelEn: string | null;

  /** Offers a guest-facing language toggle on the menu. */
  bilingualEnabled: boolean;

  /**
   * Whether the menu shows a featured strip.
   *
   * Off unless the owner turned it on, so no venue gains a promotional surface
   * it did not ask for. Independent of the per-dish `isFeatured` flag, which
   * several templates have always used for their own inline treatments and
   * which this does not affect.
   */
  featuredSectionEnabled: boolean;
}

export interface MenuData {
  restaurant: MenuRestaurant;
  categories: MenuCategory[];
}

/**
 * What a template receives. Templates are presentational: every stateful
 * concern (cart, product sheet, checkout) is supplied by the shared runtime so
 * that improving those improves all templates at once.
 */
export interface TemplateProps {
  data: MenuData;
  theme: ResolvedTheme;
  locale: Locale;
  /** True inside the dashboard design previewer — suppresses real ordering. */
  preview?: boolean;
}

export interface TemplateMeta {
  id: string;
  nameFa: string;
  nameEn: string;
  descriptionFa: string;
  descriptionEn: string;
  /** Seeds the design editor when an owner switches templates. */
  defaultTheme: Partial<ResolvedTheme>;
  /** Swatch shown on the template picker card. */
  swatch: [string, string, string];
  /**
   * This template shows a dish's short description and nothing more.
   *
   * Vitrin gives one dish the whole screen, so the card *is* the presentation —
   * a long description and a stack of option groups have nowhere to go that a
   * guest would actually read. Rather than let an owner write content this
   * template will never show them, the product editor hides those fields and
   * says why.
   *
   * Declared here rather than tested as `templateId === "vitrin"` in the editor:
   * the registry is already where a template's capabilities live, and the next
   * single-dish template should inherit the rule by setting a flag.
   */
  shortDescriptionOnly?: boolean;
  /**
   * This template already merchandises featured dishes for itself.
   *
   * Ember has had a featured rail since before the feature existed, and Vitrin
   * gives one dish the whole screen — a strip above either would be a second
   * copy of the same idea in the first case and would break the layout in the
   * second. Declared here rather than tested as `templateId === "ember"` in the
   * shared renderer, for the same reason `shortDescriptionOnly` is: a
   * template's capabilities belong with the template.
   */
  hasOwnFeaturedSurface?: boolean;
}
