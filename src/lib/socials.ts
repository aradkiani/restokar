/**
 * The social platforms a venue can link from its menu footer.
 *
 * Deliberately short. This is a contact row on a menu, not a link-in-bio page:
 * three icons is the cap, and every entry here has to be something an Iranian
 * café actually publishes. Platforms blocked or unused locally are absent on
 * purpose rather than offered and left empty.
 *
 * `prefix` lets an owner paste either a full URL or just their handle — the
 * two things people actually have to hand — and get a working link either way.
 */
/**
 * The ids, as a literal tuple, so `z.enum` infers the union rather than a bare
 * `string` — which is what makes a stored `platform` narrow all the way to the
 * icon lookup without a cast.
 */
export const SOCIAL_PLATFORM_IDS = [
  "instagram",
  "telegram",
  "whatsapp",
  "website",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORM_IDS)[number];

interface SocialPlatformMeta {
  id: SocialPlatform;
  labelFa: string;
  labelEn: string;
  /** Joined to a bare handle to build a full URL. */
  prefix: string;
  placeholder: string;
}

export const SOCIAL_PLATFORMS: readonly SocialPlatformMeta[] = [
  {
    id: "instagram",
    labelFa: "اینستاگرام",
    labelEn: "Instagram",
    prefix: "https://instagram.com/",
    placeholder: "@cafe",
  },
  {
    id: "telegram",
    labelFa: "تلگرام",
    labelEn: "Telegram",
    prefix: "https://t.me/",
    placeholder: "@cafe",
  },
  {
    id: "whatsapp",
    labelFa: "واتساپ",
    labelEn: "WhatsApp",
    prefix: "https://wa.me/",
    placeholder: "989121234567",
  },
  {
    id: "website",
    labelFa: "وب‌سایت",
    labelEn: "Website",
    prefix: "https://",
    placeholder: "cafe.ir",
  },
];

/** How many icons the footer will show. Beyond this the row stops reading as a row. */
export const MAX_SOCIAL_LINKS = 3;

export interface SocialLink {
  platform: SocialPlatform;
  /** Either a full https URL or a bare handle; `socialHref` resolves both. */
  url: string;
}

export function getSocialPlatform(id: string) {
  return SOCIAL_PLATFORMS.find((p) => p.id === id);
}

/**
 * Turns what the owner typed into something safe to put in an `href`.
 *
 * Only `https:` survives. A bare handle is joined to the platform's prefix; a
 * pasted `http://` or — the one that matters — a `javascript:` string is
 * rejected outright rather than rendered as a link, because this value is
 * owner-supplied and lands directly in the DOM of every guest's phone.
 */
export function socialHref(link: SocialLink): string | null {
  const platform = getSocialPlatform(link.platform);
  if (!platform) return null;

  const raw = link.url.trim();
  if (!raw) return null;

  const candidate = /^https?:\/\//i.test(raw)
    ? raw
    : platform.prefix + raw.replace(/^@/, "");

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
