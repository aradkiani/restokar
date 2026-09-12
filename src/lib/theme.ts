import { z } from "zod";

/**
 * Per-tenant design overrides.
 *
 * A theme is *only* data. It is merged over the chosen template's defaults and
 * emitted as CSS custom properties, which is what keeps template updates
 * inheritable: the platform can restyle a template's markup freely and every
 * restaurant using it picks the change up on the next request, while their own
 * colour and font choices continue to apply on top.
 */

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hexColor = z.string().regex(HEX, "Must be a hex colour like #1a1a1a");

/**
 * The menu font catalogue.
 *
 * Every entry here must have a matching `@font-face` in globals.css and a file
 * in public/fonts. Estedad was previously listed without either, so choosing it
 * silently rendered Tahoma — a picker option that does nothing is worse than an
 * absent one, because the owner believes they changed something.
 *
 * There is deliberately no "system" entry. It resolved to whatever the guest's
 * device happened to ship, so one menu rendered in a different typeface on
 * every phone and the owner could not see what they were shipping — the same
 * complaint as the Estedad case, in a form that could never be fixed by adding
 * a font file. A venue that stored it lands on Vazirmatn without any migration:
 * `parseTheme` validates per key and drops values the schema no longer accepts,
 * and `BASE_THEME` supplies the default.
 */
export const FONT_OPTIONS = [
  { id: "vazirmatn", labelFa: "وزیرمتن", labelEn: "Vazirmatn" },
  { id: "estedad", labelFa: "استعداد", labelEn: "Estedad" },
  { id: "sahel", labelFa: "ساحل", labelEn: "Sahel" },
  { id: "samim", labelFa: "صمیم", labelEn: "Samim" },
] as const;

export const FONT_IDS = FONT_OPTIONS.map((f) => f.id);

export const SURFACE_STYLES = ["flat", "glass", "elevated"] as const;

export const ThemeSchema = z.object({
  primary: hexColor.optional(),
  secondary: hexColor.optional(),
  background: hexColor.optional(),
  surface: hexColor.optional(),
  text: hexColor.optional(),
  muted: hexColor.optional(),
  /**
   * Restricted to a same-origin upload path or an https URL. React does not
   * sanitise CSS values, so an unconstrained string here would let an owner
   * inject arbitrary declarations into their menu's `background-image`.
   */
  backgroundImage: z
    .string()
    .max(500)
    .regex(/^(?:\/uploads\/[\w./-]+|https:\/\/[\w./%-]+)$/, "Invalid image URL")
    .optional()
    .nullable(),
  /** 0 = image fully visible, 1 = fully covered by the background colour. */
  backgroundOverlay: z.number().min(0).max(1).optional(),
  font: z.enum(["vazirmatn", "estedad", "sahel", "samim"]).optional(),
  radius: z.number().min(0).max(32).optional(),
  surfaceStyle: z.enum(SURFACE_STYLES).optional(),
});

export type Theme = z.infer<typeof ThemeSchema>;
export type ResolvedTheme = Required<Omit<Theme, "backgroundImage">> & {
  backgroundImage: string | null;
};

export const BASE_THEME: ResolvedTheme = {
  primary: "#c2410c",
  secondary: "#0f766e",
  background: "#faf7f2",
  surface: "#ffffff",
  text: "#1c1917",
  muted: "#78716c",
  backgroundImage: null,
  backgroundOverlay: 0.7,
  font: "vazirmatn",
  radius: 16,
  surfaceStyle: "elevated",
};

/**
 * Tolerant parse — a malformed stored theme must never break a live menu.
 *
 * Validation is per-key rather than all-or-nothing: one bad value (say a
 * `backgroundImage` written before the URL guard existed) should cost that one
 * token, not silently reset a restaurant's whole colour scheme.
 */
export function parseTheme(value: unknown): Theme {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const whole = ThemeSchema.safeParse(value);
  if (whole.success) return whole.data;

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(ThemeSchema.shape)) {
    const candidate = (value as Record<string, unknown>)[key];
    if (candidate === undefined) continue;
    const parsed = entry.safeParse(candidate);
    if (parsed.success) out[key] = parsed.data;
  }

  return out as Theme;
}

export function resolveTheme(
  stored: unknown,
  templateDefaults: Partial<ResolvedTheme> = {},
): ResolvedTheme {
  const overrides = parseTheme(stored);
  const merged = { ...BASE_THEME, ...templateDefaults } as ResolvedTheme;

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== "") {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/**
 * Each stack names its own face first and falls back to Tahoma, which is the
 * Persian face present on essentially every Windows machine. Vazirmatn is not
 * used as a universal second choice: it is preloaded, so listing it in every
 * stack would make a slow connection flash Vazirmatn before settling on the
 * font the venue actually chose.
 */
const FONT_STACKS: Record<ResolvedTheme["font"], string> = {
  vazirmatn: `"Vazirmatn", Tahoma, "Segoe UI", system-ui, sans-serif`,
  estedad: `"Estedad", Tahoma, "Segoe UI", system-ui, sans-serif`,
  sahel: `"Sahel", Tahoma, "Segoe UI", system-ui, sans-serif`,
  samim: `"Samim", Tahoma, "Segoe UI", system-ui, sans-serif`,
};

/**
 * Emits the theme as inline custom properties. Rendering server-side avoids
 * the flash of unstyled colour a client-side theme swap would cause.
 */
export function themeToCssVars(theme: ResolvedTheme): Record<string, string> {
  const vars: Record<string, string> = {
    "--m-primary": theme.primary,
    "--m-primary-contrast": readableOn(theme.primary),
    "--m-secondary": theme.secondary,
    "--m-secondary-contrast": readableOn(theme.secondary),
    "--m-bg": theme.background,
    "--m-surface": theme.surface,
    "--m-text": theme.text,
    "--m-muted": theme.muted,
    "--m-radius": `${theme.radius}px`,
    "--m-radius-sm": `${Math.max(4, Math.round(theme.radius * 0.5))}px`,
    "--m-radius-lg": `${Math.round(theme.radius * 1.5)}px`,
    "--m-font": FONT_STACKS[theme.font],
    "--m-border": withAlpha(theme.text, 0.1),
    "--m-primary-soft": withAlpha(theme.primary, 0.12),
    "--m-secondary-soft": withAlpha(theme.secondary, 0.12),
    "--m-overlay": withAlpha(theme.background, theme.backgroundOverlay),
  };

  /*
    `--m-surface-strong` is the same surface at an opacity that can be read
    against moving content behind it.

    A card sits on the background and never has anything pass underneath, so a
    translucent one is decoration. A sticky bar has the entire menu scrolling
    under it, and at 65% every dish name and price slid visibly through the
    search field. Only the glass style needs the distinction; on flat and
    elevated the surface is already opaque and the two are the same colour.
  */
  switch (theme.surfaceStyle) {
    case "glass":
      vars["--m-surface-bg"] = withAlpha(theme.surface, 0.65);
      vars["--m-surface-strong"] = withAlpha(theme.surface, 0.92);
      vars["--m-surface-blur"] = "blur(16px) saturate(180%)";
      vars["--m-surface-shadow"] = `0 8px 32px ${withAlpha(theme.text, 0.12)}`;
      vars["--m-surface-border"] = withAlpha("#ffffff", 0.35);
      break;
    case "flat":
      vars["--m-surface-bg"] = theme.surface;
      vars["--m-surface-strong"] = theme.surface;
      vars["--m-surface-blur"] = "none";
      vars["--m-surface-shadow"] = "none";
      vars["--m-surface-border"] = withAlpha(theme.text, 0.12);
      break;
    default:
      vars["--m-surface-bg"] = theme.surface;
      vars["--m-surface-strong"] = theme.surface;
      vars["--m-surface-blur"] = "none";
      vars["--m-surface-shadow"] = `0 4px 20px ${withAlpha(theme.text, 0.08)}`;
      vars["--m-surface-border"] = withAlpha(theme.text, 0.06);
  }

  return vars;
}

// ------------------------------ colour maths -------------------------------

function expand(hex: string): string {
  const h = hex.replace("#", "");
  return h.length === 3
    ? h
        .split("")
        .map((c) => c + c)
        .join("")
    : h;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = expand(hex);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

/** Relative luminance per WCAG 2.1. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Picks black or white for text sitting on `background`. Owners can choose any
 * brand colour they like; this stops their button labels becoming unreadable.
 */
export function readableOn(background: string): string {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#111111")
    ? "#ffffff"
    : "#111111";
}
