import type { TemplateMeta } from "./types";

/**
 * The template catalogue.
 *
 * Restaurants store only a `templateId`. Both the metadata below and the
 * component behind it live in the platform codebase, so when we ship an
 * improvement to a template — new markup, better accessibility, a faster card
 * layout — every restaurant on that template serves the new version on its
 * next request. Nothing is copied into tenant rows, and there is no
 * per-restaurant build step.
 *
 * A tenant's own colour/font choices survive such updates because they are
 * stored separately as a Theme and applied as CSS custom properties.
 */
export const TEMPLATES: TemplateMeta[] = [
  {
    id: "aurora",
    nameFa: "اورورا",
    nameEn: "Aurora",
    descriptionFa: "روشن، مدرن و شیشه‌ای — مناسب کافه‌های امروزی",
    descriptionEn: "Bright, modern and glassy — made for contemporary cafés",
    defaultTheme: {
      primary: "#c2410c",
      secondary: "#0f766e",
      background: "#faf7f2",
      surface: "#ffffff",
      text: "#1c1917",
      muted: "#78716c",
      radius: 20,
      surfaceStyle: "glass",
    },
    swatch: ["#c2410c", "#faf7f2", "#0f766e"],
  },
  {
    id: "noir",
    nameFa: "نوآر",
    nameEn: "Noir",
    descriptionFa: "تیره، لوکس و مینیمال — مناسب رستوران‌های فاین‌دایینگ",
    descriptionEn: "Dark, luxurious and minimal — for fine dining",
    defaultTheme: {
      primary: "#d4af37",
      secondary: "#8c7853",
      background: "#0e0d0c",
      surface: "#1a1817",
      text: "#f5f1ea",
      muted: "#a09a90",
      radius: 8,
      surfaceStyle: "flat",
    },
    swatch: ["#d4af37", "#0e0d0c", "#f5f1ea"],
  },
  {
    id: "ember",
    hasOwnFeaturedSurface: true,
    nameFa: "امبر",
    nameEn: "Ember",
    descriptionFa: "گرم و پرانرژی با کارت‌های بزرگ — مناسب فست‌فود و برگر",
    descriptionEn: "Warm and energetic with large cards — for burgers & fast food",
    defaultTheme: {
      primary: "#dc2626",
      secondary: "#f59e0b",
      background: "#fffbf5",
      surface: "#ffffff",
      text: "#1f1512",
      muted: "#8a7268",
      radius: 24,
      surfaceStyle: "elevated",
    },
    swatch: ["#dc2626", "#fffbf5", "#f59e0b"],
  },
  {
    id: "linen",
    nameFa: "کتان",
    nameEn: "Linen",
    descriptionFa: "آرام و کلاسیک با فهرست متنی — مناسب رستوران‌های سنتی",
    descriptionEn: "Calm and classic with a typographic list — for traditional venues",
    defaultTheme: {
      primary: "#3f6212",
      secondary: "#a16207",
      background: "#f7f6f1",
      surface: "#fffef9",
      text: "#26241d",
      muted: "#7a7566",
      radius: 4,
      surfaceStyle: "flat",
    },
    swatch: ["#3f6212", "#f7f6f1", "#a16207"],
  },
  {
    id: "bazaar",
    nameFa: "بازار",
    nameEn: "Bazaar",
    descriptionFa:
      "شبکه‌ای و گرم با بخش سوغاتی — مناسب رستوران‌هایی که سوغات هم می‌فروشند",
    descriptionEn:
      "Warm two-column grid with a souvenir shelf — for venues that also sell gifts",
    defaultTheme: {
      primary: "#b4532a",
      secondary: "#2f6f6b",
      background: "#fbf7f2",
      surface: "#ffffff",
      text: "#241c16",
      muted: "#75655a",
      radius: 12,
      surfaceStyle: "flat",
    },
    swatch: ["#b4532a", "#fbf7f2", "#2f6f6b"],
  },
  {
    id: "atlas",
    nameFa: "اطلس",
    nameEn: "Atlas",
    descriptionFa: "شبکه‌بندی دقیق و پرکنتراست — مناسب کافه و رستوران‌های مدرن",
    descriptionEn: "A precise, high-contrast grid — for modern cafés and bistros",
    defaultTheme: {
      primary: "#c63a1e",
      secondary: "#1f1f1f",
      background: "#ffffff",
      surface: "#ffffff",
      text: "#111111",
      muted: "#666666",
      radius: 2,
      surfaceStyle: "flat",
    },
    swatch: ["#c63a1e", "#ffffff", "#111111"],
  },
  {
    id: "reel",
    nameFa: "ریل",
    nameEn: "Reel",
    descriptionFa: "برای هر دسته یک ردیف افقی — مناسب منوهای پرعکس",
    descriptionEn: "A horizontal rail per category — for photo-led menus",
    defaultTheme: {
      primary: "#0e7490",
      secondary: "#ea580c",
      background: "#f8fafc",
      surface: "#ffffff",
      text: "#0f172a",
      muted: "#64748b",
      radius: 18,
      surfaceStyle: "elevated",
    },
    swatch: ["#0e7490", "#f8fafc", "#ea580c"],
  },
  {
    id: "bloom",
    nameFa: "شکوفه",
    nameEn: "Bloom",
    descriptionFa: "مدال‌های دایره‌ای و کپسولی — مناسب بستنی، آبمیوه و شیرینی",
    descriptionEn:
      "Circular medallions and capsules — for ice cream, juice and pâtisserie",
    defaultTheme: {
      primary: "#a0521a",
      secondary: "#6b7b3c",
      background: "#f7f1e7",
      surface: "#fffdf9",
      text: "#3a2c1f",
      muted: "#8a7a68",
      radius: 28,
      surfaceStyle: "elevated",
    },
    swatch: ["#a0521a", "#f7f1e7", "#6b7b3c"],
  },
  {
    id: "kashi",
    nameFa: "کاشی",
    nameEn: "Kashi",
    descriptionFa: "کاشی‌کاری ایرانی با طاق و ستاره هشت‌پر — مناسب سفره‌خانه و چایخانه",
    descriptionEn:
      "Persian tilework, arches and eight-point stars — for traditional houses",
    defaultTheme: {
      primary: "#0e7c72",
      secondary: "#14345f",
      background: "#f7f0e1",
      surface: "#fffdf7",
      text: "#1b2a3a",
      muted: "#6f7d8c",
      radius: 6,
      surfaceStyle: "flat",
    },
    swatch: ["#0e7c72", "#f7f0e1", "#14345f"],
  },
  {
    // The templateId stays "qalam" deliberately — it is stored on every venue
    // that has chosen this template, so renaming the key would orphan them.
    // Only the display names change.
    id: "qalam",
    nameFa: "ترنج",
    nameEn: "Toranj",
    descriptionFa:
      "تایپوگرافی آرام با یک معرفی شاخص در هر دسته — مناسب بیسترو و منوی کوتاه",
    descriptionEn:
      "Quiet editorial typography with a lead dish per category — for bistros and short menus",
    defaultTheme: {
      primary: "#6d2c34",
      secondary: "#7a5f36",
      background: "#f6f5f2",
      surface: "#ffffff",
      text: "#1a1a18",
      muted: "#6b6862",
      radius: 4,
      surfaceStyle: "flat",
    },
    swatch: ["#6d2c34", "#f6f5f2", "#7a5f36"],
  },
  {
    id: "vitrin",
    hasOwnFeaturedSurface: true,
    nameFa: "ویترین",
    nameEn: "Vitrin",
    descriptionFa: "هر بار یک غذا، تمام‌صفحه و کارت‌به‌کارت — مناسب منوهای کوتاه و پرعکس",
    descriptionEn:
      "One dish at a time, full-screen and card-by-card — for short, photo-led menus",
    /**
     * The catalogue's second dark theme, and deliberately nothing like the
     * first. Noir is restrained — gold on near-black, small radii, fine dining.
     * This is the opposite register: near-black under a single acid accent, the
     * loudest palette on offer, because the layout gives one photograph the
     * whole screen and a timid theme would waste it.
     */
    defaultTheme: {
      primary: "#d6f84c",
      secondary: "#ff5a1f",
      background: "#09090b",
      surface: "#161619",
      text: "#fafafa",
      muted: "#a1a1aa",
      // Generous, because the cards are the size of posters — `--m-radius-lg`
      // derives from this and is what the deck actually uses.
      radius: 20,
      surfaceStyle: "flat",
    },
    swatch: ["#d6f84c", "#09090b", "#ff5a1f"],
    shortDescriptionOnly: true,
  },
];

/**
 * True when the template only ever shows a dish's short description.
 *
 * Used by the product editor to hide the long description, the info panels and
 * the option groups for venues on such a template.
 */
export function isShortDescriptionOnly(templateId: string | null | undefined): boolean {
  return getTemplateMeta(templateId).shortDescriptionOnly === true;
}

/**
 * True when the template merchandises featured dishes itself.
 *
 * The shared featured strip stays out of the way of such a template rather than
 * stacking a second promotional surface on top of the one it already has.
 */
export function hasOwnFeaturedSurface(templateId: string | null | undefined): boolean {
  return getTemplateMeta(templateId).hasOwnFeaturedSurface === true;
}

export const DEFAULT_TEMPLATE_ID = "aurora";

export function getTemplateMeta(id: string | null | undefined): TemplateMeta {
  return (
    TEMPLATES.find((t) => t.id === id) ??
    TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID)!
  );
}

export function isTemplateId(id: string): boolean {
  return TEMPLATES.some((t) => t.id === id);
}
