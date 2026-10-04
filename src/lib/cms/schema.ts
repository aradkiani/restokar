/**
 * What the platform admin can edit on the public site, and what each field
 * falls back to.
 *
 * Pure (no database, no React): shared by the admin editor, the API that saves
 * drafts, and the public pages that read published content. The *shape* of
 * every page stays in code — sections, icons, layout — and only the values
 * live in the database. Every field has a default, and the defaults are the
 * site's exact text from before the editor existed, so an empty database
 * renders the site unchanged. A missing, empty or invalid stored value falls
 * back to its default field by field, so no saved value can break a page.
 *
 * Localised text is stored as `{ fa, en }`. Persian is primary; an empty
 * English value shows the default English text, or the Persian when there is
 * no English default.
 */
import { fa } from "../i18n/fa";
import { en } from "../i18n/en";
import { TRIAL_DAYS } from "../constants";
import { cleanText, isSafeHref, linksIn } from "./markup";
import { FAQ_DEFAULT, LEGAL_DEFAULT } from "./defaults";

export interface Localized {
  fa: string;
  en: string;
}

interface Base {
  key: string;
  label: string;
  hint?: string;
}

export type FieldDef =
  | (Base & {
      type: "text" | "textarea" | "richtext";
      localized: true;
      max: number;
      default: Localized;
    })
  | (Base & {
      type: "text" | "textarea";
      localized: false;
      max: number;
      default: string;
    })
  | (Base & { type: "url" | "phone" | "email" | "image" | "datetime"; default: string })
  | (Base & { type: "number"; min: number; max: number; default: number })
  | (Base & { type: "boolean"; default: boolean })
  | (Base & {
      type: "list";
      maxItems: number;
      item: FieldDef[];
      default: Record<string, unknown>[];
    });

export interface DocumentDef {
  key: string;
  title: string;
  description: string;
  group: "settings" | "pages" | "legal";
  /** Where the content appears, for the preview button. */
  previewPath: string;
  fields: FieldDef[];
}

const L = (faText: string, enText = ""): Localized => ({ fa: faText, en: enText });

function text(
  key: string,
  label: string,
  max: number,
  value: Localized,
  hint?: string,
): FieldDef {
  return { type: "text", key, label, max, localized: true, default: value, hint };
}
function textarea(
  key: string,
  label: string,
  max: number,
  value: Localized,
  hint?: string,
): FieldDef {
  return { type: "textarea", key, label, max, localized: true, default: value, hint };
}

const featureDefaults = [
  ["menuTitle", "menuText"],
  ["qrTitle", "qrText"],
  ["orderTitle", "orderText"],
  ["kitchenTitle", "kitchenText"],
  ["analyticsTitle", "analyticsText"],
  ["financeTitle", "financeText"],
  ["paymentTitle", "paymentText"],
  ["brandTitle", "brandText"],
] as const;

const stepDefaults = [
  ["step1Title", "step1Text"],
  ["step2Title", "step2Text"],
  ["step3Title", "step3Text"],
] as const;

export const DOCUMENTS: DocumentDef[] = [
  {
    key: "site",
    title: "تنظیمات سایت",
    description:
      "نام، اطلاعات تماس، شبکه‌های اجتماعی، سئو، نماد اعتماد و اعلان بالای سایت",
    group: "settings",
    previewPath: "/",
    fields: [
      text("siteName", "نام سایت", 40, L(fa.common.appName, en.common.appName)),
      {
        type: "phone",
        key: "contactPhone",
        label: "تلفن تماس",
        hint: "روی صفحهٔ اصلی، صفحهٔ تماس و صفحهٔ اشتراک رستوران‌ها نمایش داده می‌شود. خالی بماند نمایش داده نمی‌شود.",
        default: "",
      },
      {
        type: "email",
        key: "contactEmail",
        label: "ایمیل تماس",
        default: "hello@restokar.ir",
      },
      textarea("address", "نشانی", 300, L("تهران، ایران", "Tehran, Iran")),
      {
        type: "text",
        key: "legalName",
        label: "نام حقوقی (روی رسید پرداخت)",
        hint: "نام شرکت یا شخصی که وجه اشتراک را دریافت می‌کند. خالی بماند، نام سایت چاپ می‌شود.",
        localized: false,
        max: 120,
        default: "",
      },
      {
        type: "text",
        key: "nationalId",
        label: "شناسهٔ ملی / کد ملی",
        localized: false,
        max: 20,
        default: "",
      },
      {
        type: "text",
        key: "economicCode",
        label: "کد اقتصادی",
        localized: false,
        max: 20,
        default: "",
      },
      {
        type: "text",
        key: "postalCode",
        label: "کد پستی",
        localized: false,
        max: 12,
        default: "",
      },
      { type: "url", key: "instagram", label: "اینستاگرام", default: "" },
      { type: "url", key: "telegram", label: "تلگرام", default: "" },
      { type: "url", key: "bale", label: "بله", default: "" },
      { type: "url", key: "eitaa", label: "ایتا", default: "" },
      textarea(
        "footerText",
        "متن پانویس",
        200,
        L(fa.landing.footerRights, en.landing.footerRights),
      ),
      text(
        "seoTitle",
        "عنوان سایت در گوگل",
        70,
        L(
          "رستوکار | منوی دیجیتال، سفارش‌گیری و گزارش سود رستوران",
          "Restokar | Digital menu, ordering and profit reports for restaurants",
        ),
      ),
      textarea(
        "seoDescription",
        "توضیح سایت در گوگل",
        180,
        L(
          "منوی دیجیتال با بارکد اختصاصی هر میز، سفارش‌گیری بدون نصب اپلیکیشن، صفحهٔ آشپزخانهٔ لحظه‌ای و گزارش دقیق فروش، سود و هزینه — همه در یک پنل برای رستوران‌ها و کافه‌ها.",
          "A QR menu for every table, ordering without an app, a live kitchen screen and exact sales, profit and cost reports — one panel for restaurants and cafés.",
        ),
      ),
      {
        type: "textarea",
        key: "seoKeywords",
        label: "کلمات کلیدی",
        hint: "با ویرگول جدا کنید.",
        localized: false,
        max: 300,
        default:
          "منوی دیجیتال، منو آنلاین رستوران، بارکد منو، QR منو، سیستم سفارش‌گیری رستوران، digital menu، restaurant QR menu",
      },
      {
        type: "image",
        key: "ogImage",
        label: "تصویر اشتراک‌گذاری",
        hint: "در پیام‌رسان‌ها و شبکه‌های اجتماعی کنار لینک سایت نمایش داده می‌شود. اندازهٔ پیشنهادی ۱۲۰۰×۶۳۰.",
        default: "",
      },
      {
        type: "number",
        key: "trialDays",
        label: "طول دورهٔ آزمایشی (روز)",
        hint: "برای ثبت‌نام‌های تازه. متن‌هایی که عدد ۱۴ را نوشته‌اند جدا ویرایش می‌شوند.",
        min: 0,
        max: 90,
        default: TRIAL_DAYS,
      },
      {
        type: "boolean",
        key: "showStats",
        label: "نمایش آمار زندهٔ سایت در صفحهٔ اصلی",
        hint: "تعداد رستوران‌ها و سفارش‌ها.",
        default: true,
      },
      {
        type: "text",
        key: "enamadId",
        label: "شناسهٔ اینماد (id)",
        hint: "از کد نمادی که enamad.ir می‌دهد، عدد بعد از id=",
        localized: false,
        max: 20,
        default: "",
      },
      {
        type: "text",
        key: "enamadCode",
        label: "کد اینماد (Code)",
        hint: "از همان کد، مقدار بعد از Code=",
        localized: false,
        max: 60,
        default: "",
      },
      {
        type: "boolean",
        key: "announcementEnabled",
        label: "نمایش اعلان بالای سایت",
        default: false,
      },
      text("announcementText", "متن اعلان", 160, L("")),
      { type: "url", key: "announcementLink", label: "لینک اعلان", default: "" },
      {
        type: "datetime",
        key: "announcementStartsAt",
        label: "شروع نمایش اعلان",
        hint: "خالی یعنی از همین حالا.",
        default: "",
      },
      {
        type: "datetime",
        key: "announcementEndsAt",
        label: "پایان نمایش اعلان",
        hint: "خالی یعنی تا وقتی خاموشش کنید.",
        default: "",
      },
    ],
  },
  {
    key: "home",
    title: "صفحهٔ اصلی",
    description: "متن‌های بخش اول، امکانات، مراحل راه‌اندازی، نمونه منوها و تماس",
    group: "pages",
    previewPath: "/",
    fields: [
      text(
        "heroBadge",
        "برچسب بالای عنوان",
        80,
        L(fa.landing.heroBadge, en.landing.heroBadge),
      ),
      text("heroTitle", "عنوان اصلی", 80, L(fa.landing.heroTitle, en.landing.heroTitle)),
      text(
        "heroTitleAccent",
        "ادامهٔ رنگی عنوان",
        60,
        L(fa.landing.heroTitleAccent, en.landing.heroTitleAccent),
      ),
      textarea(
        "heroSubtitle",
        "توضیح زیر عنوان",
        300,
        L(fa.landing.heroSubtitle, en.landing.heroSubtitle),
      ),
      text(
        "heroCtaPrimary",
        "دکمهٔ اصلی (وقتی ثبت‌نام باز است)",
        40,
        L(fa.landing.heroCtaPrimary, en.landing.heroCtaPrimary),
      ),
      text(
        "ctaContactSupport",
        "دکمهٔ اصلی (وقتی ثبت‌نام بسته است)",
        40,
        L(fa.landing.ctaContactSupport, en.landing.ctaContactSupport),
      ),
      text(
        "heroCtaSecondary",
        "دکمهٔ دوم",
        40,
        L(fa.landing.heroCtaSecondary, en.landing.heroCtaSecondary),
      ),
      text(
        "heroNote",
        "یادداشت زیر دکمه‌ها",
        80,
        L(fa.landing.heroNote, en.landing.heroNote),
      ),
      text(
        "featuresTitle",
        "عنوان امکانات",
        90,
        L(fa.landing.featuresTitle, en.landing.featuresTitle),
      ),
      textarea(
        "featuresSubtitle",
        "توضیح امکانات",
        200,
        L(fa.landing.featuresSubtitle, en.landing.featuresSubtitle),
      ),
      {
        type: "list",
        key: "features",
        label: "امکانات",
        hint: "هر مورد یک کارت. نمادها به ترتیب ثابت‌اند.",
        maxItems: 12,
        item: [text("title", "عنوان", 50, L("")), textarea("text", "توضیح", 200, L(""))],
        default: featureDefaults.map(([title, body]) => ({
          title: L(fa.features[title], en.features[title]),
          text: L(fa.features[body], en.features[body]),
        })),
      },
      text("howTitle", "عنوان مراحل", 80, L(fa.landing.howTitle, en.landing.howTitle)),
      text(
        "howSubtitle",
        "توضیح مراحل",
        120,
        L(fa.landing.howSubtitle, en.landing.howSubtitle),
      ),
      {
        type: "list",
        key: "steps",
        label: "مراحل راه‌اندازی",
        maxItems: 4,
        item: [text("title", "عنوان", 60, L("")), textarea("text", "توضیح", 200, L(""))],
        default: stepDefaults.map(([title, body]) => ({
          title: L(fa.landing[title], en.landing[title]),
          text: L(fa.landing[body], en.landing[body]),
        })),
      },
      text(
        "demoTitle",
        "عنوان نمونه منوها",
        80,
        L(fa.landing.demoTitle, en.landing.demoTitle),
      ),
      text(
        "demoSubtitle",
        "توضیح نمونه منوها",
        120,
        L(fa.landing.demoSubtitle, en.landing.demoSubtitle),
      ),
      text(
        "pricingSubtitle",
        "توضیح بخش تعرفه‌ها",
        160,
        L(fa.landing.ctaSubtitle, en.landing.ctaSubtitle),
      ),
      text(
        "faqTitle",
        "عنوان سؤالات متداول",
        60,
        L(fa.landing.faqTitle, en.landing.faqTitle),
      ),
      text("ctaTitle", "عنوان بخش تماس", 80, L(fa.landing.ctaTitle, en.landing.ctaTitle)),
      textarea(
        "contactSubtitle",
        "توضیح بخش تماس",
        200,
        L(fa.landing.contactSubtitle, en.landing.contactSubtitle),
      ),
    ],
  },
  {
    key: "faq",
    title: "سؤالات متداول",
    description: "پرسش و پاسخ‌های صفحهٔ اصلی",
    group: "pages",
    previewPath: "/#faq",
    fields: [
      {
        type: "list",
        key: "items",
        label: "پرسش‌ها",
        maxItems: 20,
        item: [text("q", "پرسش", 160, L("")), textarea("a", "پاسخ", 800, L(""))],
        default: FAQ_DEFAULT.map((item) => ({ q: item.q, a: item.a })),
      },
    ],
  },
  {
    key: "pricing",
    title: "صفحهٔ تعرفه‌ها",
    description:
      "عنوان و توضیح صفحهٔ تعرفه‌ها. خودِ پلن‌ها از بخش «پلن‌ها» ویرایش می‌شوند.",
    group: "pages",
    previewPath: "/pricing",
    fields: [
      text("title", "عنوان صفحه", 60, L(fa.nav.pricing, en.nav.pricing)),
      text(
        "subtitle",
        "توضیح صفحه",
        160,
        L(fa.landing.ctaSubtitle, en.landing.ctaSubtitle),
      ),
      textarea(
        "seoDescription",
        "توضیح صفحه در گوگل",
        180,
        L(
          "پلن‌های اشتراک رستوکار برای رستوران‌ها و کافه‌ها — ۱۴ روز رایگان.",
          "Restokar subscription plans for restaurants and cafés — 14 days free.",
        ),
      ),
    ],
  },
  ...(
    [
      ["terms", "/terms", "قوانین و مقررات"],
      ["privacy", "/privacy", "حریم خصوصی"],
      ["refund", "/refund-policy", "شرایط بازگشت وجه"],
      ["about", "/about", "درباره ما"],
      ["contact", "/contact", "تماس با ما"],
    ] as const
  ).map(([key, path, title]): DocumentDef => ({
    key: `page-${key}`,
    title,
    description:
      key === "contact"
        ? "تلفن، ایمیل و نشانی از «تنظیمات سایت» خوانده و بالای این متن نمایش داده می‌شوند."
        : "صفحهٔ متنی؛ پیوند آن در پانویس سایت است.",
    group: key === "about" || key === "contact" ? "pages" : "legal",
    previewPath: path,
    fields: [
      text("title", "عنوان", 80, LEGAL_DEFAULT[key].title),
      {
        type: "richtext",
        key: "body",
        label: "متن",
        hint: "## عنوان بخش · - مورد فهرست · **پررنگ** · *کج* · [متن پیوند](https://…)",
        localized: true,
        max: 20_000,
        default: LEGAL_DEFAULT[key].body,
      },
    ],
  })),
];

export function getDocumentDef(key: string): DocumentDef | null {
  return DOCUMENTS.find((doc) => doc.key === key) ?? null;
}

// ------------------------------------------------------------------ resolve

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * "render": what a page shows — an empty English value falls back to the
 * default English text, then to the Persian.
 * "edit": what the editor shows — an empty English value stays empty (the
 * editor shows the fallback as a placeholder), so saving never copies the
 * Persian text into the English field.
 */
export type ResolveMode = "render" | "edit";

function resolveField(def: FieldDef, stored: unknown, mode: ResolveMode): unknown {
  switch (def.type) {
    case "text":
    case "textarea":
    case "richtext": {
      if (!def.localized) {
        return typeof stored === "string" && stored.trim() ? stored : def.default;
      }
      const value = isRecord(stored) ? stored : {};
      const faValue =
        typeof value.fa === "string" && value.fa.trim() ? value.fa : def.default.fa;
      const storedEn = typeof value.en === "string" && value.en.trim() ? value.en : "";
      const enValue =
        mode === "edit"
          ? // Once the field has been saved, an empty English stays empty in
            // the editor: the default English may no longer match the Persian.
            storedEn || (isRecord(stored) ? "" : def.default.en)
          : storedEn || def.default.en || faValue;
      return { fa: faValue, en: enValue } satisfies Localized;
    }
    case "number":
      return typeof stored === "number" &&
        Number.isFinite(stored) &&
        stored >= def.min &&
        stored <= def.max
        ? stored
        : def.default;
    case "boolean":
      return typeof stored === "boolean" ? stored : def.default;
    case "list": {
      if (!Array.isArray(stored))
        return def.default.map((item) => resolveItem(def.item, item, mode));
      return stored
        .slice(0, def.maxItems)
        .filter(isRecord)
        .map((item) => resolveItem(def.item, item, mode));
    }
    case "url":
    case "image":
      return typeof stored === "string" && stored.trim() && isSafeHref(stored)
        ? stored.trim()
        : def.default;
    default:
      return typeof stored === "string" && stored.trim() ? stored.trim() : def.default;
  }
}

/**
 * A list item's fields fall back to empty rather than to a positional default:
 * the admin may have reordered or removed items, so "the third default" means
 * nothing for an edited list.
 */
function resolveItem(
  fields: FieldDef[],
  item: Record<string, unknown>,
  mode: ResolveMode,
) {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = item[field.key];
    if ((field.type === "text" || field.type === "textarea") && field.localized) {
      const record = isRecord(value) ? value : {};
      const faValue = typeof record.fa === "string" ? record.fa : "";
      const enValue = typeof record.en === "string" && record.en.trim() ? record.en : "";
      out[field.key] = {
        fa: faValue,
        en: enValue || (mode === "edit" ? "" : faValue),
      } satisfies Localized;
    } else {
      out[field.key] = resolveField(field, value, mode);
    }
  }
  return out;
}

/** Stored values merged over the defaults, field by field. */
export function resolveDocument(
  def: DocumentDef,
  stored: unknown,
  mode: ResolveMode = "render",
): Record<string, unknown> {
  const values = isRecord(stored) ? stored : {};
  const out: Record<string, unknown> = {};
  for (const field of def.fields)
    out[field.key] = resolveField(field, values[field.key], mode);
  return out;
}

/** The text for a locale from a resolved localised value. */
export function pick(value: unknown, locale: string): string {
  if (!isRecord(value)) return "";
  const text = locale === "en" ? value.en : value.fa;
  return typeof text === "string" ? text : "";
}

// ----------------------------------------------------------------- validate

export interface ValidationResult {
  data: Record<string, unknown>;
  /** Field path → Persian message. Empty when the input is valid. */
  errors: Record<string, string>;
}

const PHONE = /^[+\d][\d\s-]{3,19}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateText(
  value: unknown,
  max: number,
  rich: boolean,
  path: string,
  errors: Record<string, string>,
): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    errors[path] = "مقدار نامعتبر است";
    return "";
  }
  const cleaned = cleanText(value);
  if (cleaned.length > max) errors[path] = `حداکثر ${max.toLocaleString("fa-IR")} نویسه`;
  if (rich) {
    for (const href of linksIn(cleaned)) {
      if (!isSafeHref(href)) {
        errors[path] =
          `پیوند «${href}» مجاز نیست؛ فقط https، mailto، tel یا نشانی داخل سایت`;
      }
    }
  }
  return cleaned;
}

function validateField(
  def: FieldDef,
  value: unknown,
  path: string,
  errors: Record<string, string>,
): unknown {
  switch (def.type) {
    case "text":
    case "textarea":
    case "richtext": {
      const rich = def.type === "richtext";
      if (!def.localized) return validateText(value, def.max, false, path, errors);
      const record = isRecord(value) ? value : {};
      return {
        fa: validateText(record.fa, def.max, rich, `${path}.fa`, errors),
        en: validateText(record.en, def.max, rich, `${path}.en`, errors),
      };
    }
    case "url":
    case "image": {
      if (value === undefined || value === null || value === "") return "";
      if (typeof value !== "string" || !isSafeHref(value)) {
        errors[path] = "نشانی معتبر نیست؛ با https:// شروع شود";
        return "";
      }
      return value.trim();
    }
    case "phone": {
      if (value === undefined || value === null || value === "") return "";
      const phone = typeof value === "string" ? value.trim() : "";
      if (!PHONE.test(phone)) errors[path] = "شمارهٔ تلفن معتبر نیست";
      return phone;
    }
    case "email": {
      if (value === undefined || value === null || value === "") return "";
      const email = typeof value === "string" ? value.trim() : "";
      if (!EMAIL.test(email)) errors[path] = "ایمیل معتبر نیست";
      return email;
    }
    case "datetime": {
      if (value === undefined || value === null || value === "") return "";
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        errors[path] = "تاریخ معتبر نیست";
        return "";
      }
      return new Date(value).toISOString();
    }
    case "number": {
      const number = typeof value === "string" ? Number(value) : value;
      if (
        typeof number !== "number" ||
        !Number.isInteger(number) ||
        number < def.min ||
        number > def.max
      ) {
        errors[path] =
          `عددی بین ${def.min.toLocaleString("fa-IR")} و ${def.max.toLocaleString("fa-IR")} وارد کنید`;
        return def.default;
      }
      return number;
    }
    case "boolean":
      return value === true;
    case "list": {
      if (!Array.isArray(value)) return [];
      if (value.length > def.maxItems) {
        errors[path] = `حداکثر ${def.maxItems.toLocaleString("fa-IR")} مورد`;
      }
      return value.slice(0, def.maxItems).map((item, index) => {
        const record = isRecord(item) ? item : {};
        const out: Record<string, unknown> = {};
        for (const field of def.item) {
          out[field.key] = validateField(
            field,
            record[field.key],
            `${path}.${index}.${field.key}`,
            errors,
          );
        }
        return out;
      });
    }
  }
}

/**
 * Cleans and checks what the editor sent: unknown keys dropped, text stripped
 * of control characters, links restricted to safe schemes, lengths and ranges
 * enforced. Messages are Persian, keyed by field path.
 */
export function validateDocument(def: DocumentDef, input: unknown): ValidationResult {
  const values = isRecord(input) ? input : {};
  const errors: Record<string, string> = {};
  const data: Record<string, unknown> = {};
  for (const field of def.fields) {
    if (field.key in values)
      data[field.key] = validateField(field, values[field.key], field.key, errors);
  }
  return { data, errors };
}

/** Whether an announcement should show at `now`. */
export function announcementLive(site: Record<string, unknown>, now: Date): boolean {
  if (site.announcementEnabled !== true) return false;
  if (!pick(site.announcementText, "fa").trim()) return false;
  const starts =
    typeof site.announcementStartsAt === "string"
      ? Date.parse(site.announcementStartsAt)
      : NaN;
  const ends =
    typeof site.announcementEndsAt === "string"
      ? Date.parse(site.announcementEndsAt)
      : NaN;
  if (!Number.isNaN(starts) && now.getTime() < starts) return false;
  if (!Number.isNaN(ends) && now.getTime() > ends) return false;
  return true;
}
