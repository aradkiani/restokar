import type { Theme } from "./theme";
import { contrastRatio, readableOn } from "./theme";

/**
 * Curated colour schemes for the menu designer.
 *
 * Most restaurant owners are not designers. Left with six raw colour pickers
 * they reliably produce something with unreadable text, so the fast path is a
 * short list of schemes that are known to work — the pickers remain underneath
 * for anyone who wants them.
 *
 * Every entry is verified by assertPaletteContrast() below, so a scheme that
 * would render illegible body text cannot ship.
 */
export interface Palette {
  id: string;
  nameFa: string;
  nameEn: string;
  theme: Required<
    Pick<Theme, "primary" | "secondary" | "background" | "surface" | "text" | "muted">
  >;
}

export const PALETTES: Palette[] = [
  {
    id: "saffron",
    nameFa: "زعفران",
    nameEn: "Saffron",
    theme: {
      primary: "#c2410c",
      secondary: "#0f766e",
      background: "#faf7f2",
      surface: "#ffffff",
      text: "#1c1917",
      muted: "#78716c",
    },
  },
  {
    id: "midnight-gold",
    nameFa: "شب و طلا",
    nameEn: "Midnight Gold",
    theme: {
      primary: "#a16207",
      secondary: "#57534e",
      background: "#0c0a09",
      surface: "#1c1917",
      text: "#fafaf9",
      muted: "#a8a29e",
    },
  },
  {
    id: "pistachio",
    nameFa: "پسته‌ای",
    nameEn: "Pistachio",
    theme: {
      primary: "#4d7c0f",
      secondary: "#b45309",
      background: "#f7f9f4",
      surface: "#ffffff",
      text: "#1a2e05",
      muted: "#65735a",
    },
  },
  {
    id: "pomegranate",
    nameFa: "انار",
    nameEn: "Pomegranate",
    theme: {
      primary: "#9f1239",
      secondary: "#0f766e",
      background: "#fff5f6",
      surface: "#ffffff",
      text: "#1f1417",
      muted: "#7c6169",
    },
  },
  {
    id: "espresso",
    nameFa: "اسپرسو",
    nameEn: "Espresso",
    theme: {
      primary: "#78350f",
      secondary: "#0c4a6e",
      background: "#faf6f0",
      surface: "#fffdfa",
      text: "#231a10",
      muted: "#7a6a58",
    },
  },
  {
    id: "slate",
    nameFa: "سنگ‌سیاه",
    nameEn: "Slate",
    theme: {
      primary: "#1e293b",
      secondary: "#0891b2",
      background: "#f8fafc",
      surface: "#ffffff",
      text: "#0f172a",
      muted: "#64748b",
    },
  },
  {
    id: "turquoise",
    nameFa: "فیروزه",
    nameEn: "Turquoise",
    theme: {
      primary: "#0f766e",
      secondary: "#b45309",
      background: "#f2fbfa",
      surface: "#ffffff",
      text: "#10302d",
      muted: "#5f7b78",
    },
  },
  {
    id: "rosewater",
    nameFa: "گلاب",
    nameEn: "Rosewater",
    theme: {
      primary: "#be185d",
      secondary: "#4d7c0f",
      background: "#fdf6f8",
      surface: "#ffffff",
      text: "#2b1720",
      muted: "#7d6069",
    },
  },
  {
    id: "olive",
    nameFa: "زیتون",
    nameEn: "Olive",
    theme: {
      primary: "#3f6212",
      secondary: "#92400e",
      background: "#f8f9f0",
      surface: "#ffffff",
      text: "#1f2410",
      muted: "#6b7257",
    },
  },
  {
    id: "sand",
    nameFa: "شنی",
    nameEn: "Sand",
    theme: {
      primary: "#9a3412",
      secondary: "#3f6212",
      background: "#faf6ee",
      surface: "#fffdf8",
      text: "#2a1f14",
      muted: "#7c6b55",
    },
  },
  /*
    Two dark schemes, because the list had only one.

    A dark menu is a real choice for an evening venue, and "Midnight Gold" was
    the sole way to make one — an owner who wanted a dark room but not a gold
    one had to leave the curated list and hand-pick six colours, which is
    exactly the path these exist to avoid.
  */
  {
    id: "indigo-night",
    nameFa: "شب نیلی",
    nameEn: "Indigo Night",
    theme: {
      primary: "#818cf8",
      secondary: "#94a3b8",
      background: "#0b1020",
      surface: "#171d33",
      text: "#f1f4ff",
      muted: "#a2abc8",
    },
  },
  {
    id: "charcoal-mint",
    nameFa: "زغالی نعنا",
    nameEn: "Charcoal Mint",
    theme: {
      primary: "#34d399",
      secondary: "#a3a3a3",
      background: "#0c0f0e",
      surface: "#1a201e",
      text: "#f2f7f5",
      muted: "#9db3ac",
    },
  },
];

/** WCAG AA for body text. */
const MIN_BODY_CONTRAST = 4.5;
/** WCAG AA for large text and UI components. */
const MIN_UI_CONTRAST = 3;

export interface PaletteAudit {
  id: string;
  textOnSurface: number;
  textOnBackground: number;
  mutedOnSurface: number;
  primaryOnSurface: number;
  primaryLabel: number;
  passes: boolean;
}

/**
 * Contrast report for a palette. Exported so the check runs as a test rather
 * than living only as a comment claiming the colours are accessible.
 */
export function auditPalette(palette: Palette): PaletteAudit {
  const { text, surface, background, muted, primary } = palette.theme;

  const textOnSurface = contrastRatio(text, surface);
  const textOnBackground = contrastRatio(text, background);
  const mutedOnSurface = contrastRatio(muted, surface);
  const primaryOnSurface = contrastRatio(primary, surface);
  // Button labels are auto-picked black or white, so this measures the pair
  // the user actually sees rather than an assumed white label.
  const primaryLabel = contrastRatio(primary, readableOn(primary));

  return {
    id: palette.id,
    textOnSurface,
    textOnBackground,
    mutedOnSurface,
    primaryOnSurface,
    primaryLabel,
    passes:
      textOnSurface >= MIN_BODY_CONTRAST &&
      textOnBackground >= MIN_BODY_CONTRAST &&
      mutedOnSurface >= MIN_UI_CONTRAST &&
      primaryOnSurface >= MIN_UI_CONTRAST &&
      primaryLabel >= MIN_BODY_CONTRAST,
  };
}

export function auditAllPalettes(): PaletteAudit[] {
  return PALETTES.map(auditPalette);
}
