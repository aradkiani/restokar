import { z } from "zod";
import { ThemeSchema } from "./theme";
import {
  MAX_EXTENSION_DAYS,
  MAX_ONBOARDING_DAYS,
  MAX_PRODUCT_INFO_SECTIONS,
  MIN_EXTENSION_DAYS,
  MIN_ONBOARDING_DAYS,
} from "./constants";
import { MAX_SOCIAL_LINKS, SOCIAL_PLATFORM_IDS } from "./socials";
import { MAX_BULK_PERCENT, MIN_BULK_PERCENT, PRICE_ROUNDING_STEPS } from "./bulk-pricing";
import { MAX_SCHEDULE_WINDOWS, parseTimeOfDay } from "./availability";
import { FEATURED_LABELS, MAX_CUSTOM_LABEL_LENGTH } from "./featured";
import { DISH_TAGS } from "./dish-tags";
import { UNIT_CODES, isUnitCode, sameDimension } from "./units";
import { MAX_BROADCAST_TEXT_LENGTH, SMS_AUDIENCES } from "./sms-broadcast";
import { MAX_BUNDLE_COMPONENTS } from "./bundles";
import { CUSTOMER_SEGMENTS, MAX_PAGE_SIZE } from "./customers";
import { VALUE_TIERS } from "./retention";
import { EXPORT_DATASETS, EXPORT_FORMATS } from "./export/dataset-names";
import { CAMPAIGN_STATUSES, MAX_CAMPAIGN_PAGE_SIZE, scheduleIssue } from "./campaigns";
import { MINUTES_PER_DAY, instantFromZonedWallClock } from "./time";
import { normalisePhone } from "./phone";
import { toEnglishDigits } from "./format";

/** Shared request schemas. Keeping them in one module keeps the API and the
 *  forms that feed it from drifting apart. */

/** An email address. Only the backup destination uses one; sign-in does not. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("ایمیل معتبر نیست")
  .max(160);

/**
 * An Iranian mobile number, the sign-in identifier.
 *
 * Accepts it however a person types it — 0912…, 912…, +98912…, 0098912…, with
 * spaces or dashes, in Persian, Arabic or Latin digits — and yields the one
 * stored form, 09XXXXXXXXX, through the same `normalisePhone` every other
 * phone in the platform goes through. Landlines are refused: a code cannot be
 * texted to one.
 */
export const mobileSchema = z
  .string({ error: "شماره موبایل را وارد کنید" })
  .trim()
  .max(24, "شماره موبایل معتبر نیست")
  .transform((value) => normalisePhone(value) ?? "")
  .refine((value) => /^09\d{9}$/.test(value), "شماره موبایل معتبر نیست");

/** A one-time code as typed: Persian or Latin digits, spaces ignored. */
export const otpCodeSchema = z
  .string({ error: "کد تأیید را وارد کنید" })
  .transform((value) => toEnglishDigits(value).replace(/\s+/g, ""))
  .refine((value) => /^\d{5,6}$/.test(value), "کد تأیید معتبر نیست");

/** Which public flow a code is asked for. A phone change has its own route. */
export const OtpRequestSchema = z.object({
  phone: mobileSchema,
  purpose: z.enum(["LOGIN", "SIGNUP"]),
  /**
   * Sign-up only: the menu address the person chose, checked before a code is
   * sent so a taken address is reported now rather than after they have typed
   * the code. Addresses are public (every menu is at /menu/<slug>), so this
   * reveals nothing. Format is validated by the register route itself.
   */
  slug: z.string().trim().max(60).optional(),
});

/**
 * A Toman amount with messages a restaurant owner can act on. `label` names
 * the field so the error reads "قیمت نمی‌تواند منفی باشد" rather than a bare
 * bound complaint detached from any field.
 */
function money(label: string) {
  return z
    .number({ error: `${label} باید عدد باشد` })
    .int(`${label} باید عدد صحیح باشد`)
    .min(0, `${label} نمی‌تواند منفی باشد`)
    .max(1_000_000_000, `${label} بیش از حد بزرگ است`);
}

/**
 * Reserved because these are real routes on the same origin; without the
 * blocklist a restaurant could claim /menu/api and shadow the platform.
 */
const RESERVED_SLUGS = new Set([
  "api",
  "admin",
  "dashboard",
  "login",
  "register",
  "menu",
  "pricing",
  "settings",
  "about",
  "contact",
  "help",
  "support",
  "app",
  "www",
  "static",
  "public",
  "assets",
  "payment",
  "order",
  "orders",
  "new",
]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "آدرس باید حداقل ۳ کاراکتر باشد")
  .max(60)
  .regex(/^[a-z0-9؀-ۿ]+(?:-[a-z0-9؀-ۿ]+)*$/, "فقط حروف، عدد و خط تیره مجاز است")
  .refine((value) => !RESERVED_SLUGS.has(value), "این آدرس رزرو شده است");

/** Everything sign-up asks for before the code is sent. */
export const RegisterDetailsSchema = z.object({
  name: z.string().trim().min(2, "نام را وارد کنید").max(80),
  phone: mobileSchema,
  restaurantName: z.string().trim().min(2, "نام رستوران را وارد کنید").max(80),
  slug: slugSchema,
});

/** Sign-up completes with the code that proves the number. */
export const RegisterSchema = RegisterDetailsSchema.extend({ code: otpCodeSchema });

/**
 * A new branch, plus the account that will run it.
 *
 * The branch is created and staffed in one step on purpose: a branch with no
 * manager is a menu address nobody can take an order from, and creating the two
 * separately invites exactly that half-finished state.
 */
export const BranchSchema = z.object({
  name: z.string().trim().min(2, "نام شعبه را وارد کنید").max(80),
  slug: slugSchema,
  managerName: z.string().trim().min(2, "نام مدیر شعبه را وارد کنید").max(80),
  /** The manager signs in with this number; their first code proves it. */
  managerPhone: mobileSchema,
  address: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  tableCount: z.number().int().min(0).max(200).optional(),
});

export const LoginSchema = z.object({
  phone: mobileSchema,
  code: otpCodeSchema,
});

/** Asking for a code to the number an account is moving to. */
export const PhoneChangeRequestSchema = z.object({ phone: mobileSchema });

/** Saving the new number, with the code sent to it. */
export const PhoneChangeSchema = z.object({ phone: mobileSchema, code: otpCodeSchema });

// ------------------------------- menu --------------------------------------

// --------------------------- opening hours ---------------------------------

/**
 * A wall-clock time as the browser's time input writes it, `"HH:MM"`.
 *
 * Accepted as text and converted to minutes here rather than having the client
 * send an integer, for the reason every other value in this file is validated
 * server-side: the number that reaches the column has to be one this code
 * derived. Parsing goes through `parseTimeOfDay`, which is the same function
 * the editor renders with, so the two can never disagree about what "24:00"
 * means.
 */
function timeOfDay(label: string) {
  return z
    .string()
    .trim()
    .refine((value) => parseTimeOfDay(value) !== null, {
      message: `${label} معتبر نیست`,
    })
    .transform((value) => parseTimeOfDay(value)!);
}

export const ScheduleWindowSchema = z
  .object({
    dayOfWeek: z.coerce
      .number({ error: "روز هفته معتبر نیست" })
      .int("روز هفته معتبر نیست")
      .min(0, "روز هفته معتبر نیست")
      .max(6, "روز هفته معتبر نیست"),
    start: timeOfDay("ساعت شروع"),
    /*
      Midnight as an end time always means the end of the day.

      A browser's time input cannot express 24:00, so an owner closing at
      midnight picks 00:00 — which would otherwise store a zero-length window
      and be refused by the column's CHECK, turning an ordinary choice into a
      500. Normalised here rather than in the editor because the rule has to
      hold for any caller, and the reading is unambiguous: a window ending zero
      minutes after midnight has no other sensible meaning.
    */
    end: timeOfDay("ساعت پایان").transform((minute) =>
      minute === 0 ? MINUTES_PER_DAY : minute,
    ),
  })
  // 24:00 is the end of a day, never the beginning of one.
  .refine((w) => w.start <= 1439, {
    message: "ساعت شروع معتبر نیست",
    path: ["start"],
  })
  /*
    A window that starts and ends at the same minute has no honest reading —
    same-day it is never open, overnight it is always open — so it is refused
    rather than silently resolved. An end *earlier* than the start is a
    different thing entirely and is allowed: that is how 18:00 → 02:00 is
    written, and rejecting it would make overnight service unexpressible.
  */
  .refine((w) => w.start !== w.end, {
    message: "ساعت شروع و پایان نمی‌تواند یکسان باشد",
    path: ["end"],
  });

/** A validated window, with both times already reduced to minutes. */
export type ScheduleWindowInput = z.infer<typeof ScheduleWindowSchema>;

/** The schedule fields shared by the product and category editors. */
const scheduleFields = {
  scheduleEnabled: z.boolean().default(true),
  /**
   * Optional, and absent means "leave the schedule alone".
   *
   * That distinction matters for `PATCH`: a caller that only means to change a
   * price must not wipe a venue's opening hours by omitting a field it never
   * knew about. An explicit empty array is how the editor clears a schedule.
   */
  schedule: z.array(ScheduleWindowSchema).max(MAX_SCHEDULE_WINDOWS).optional(),
};

export const CategorySchema = z.object({
  ...scheduleFields,
  name: z.string().trim().min(1, "نام دسته‌بندی الزامی است").max(60),
  nameEn: z.string().trim().max(60).optional().or(z.literal("")),
  icon: z.string().trim().max(40).optional().or(z.literal("")),
  /** Uploaded icon path from /api/upload; wins over `icon` when present. */
  iconUrl: z.string().trim().max(500).optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const InfoSectionSchema = z.object({
  title: z.string().trim().min(1).max(60),
  content: z.string().trim().min(1).max(1000),
  // English is optional at every level: a venue may translate its menu
  // gradually, and a missing translation falls back to Persian rather than
  // blocking the save.
  titleEn: z.string().trim().max(60).optional().or(z.literal("")),
  contentEn: z.string().trim().max(1000).optional().or(z.literal("")),
  icon: z.string().trim().max(40).optional().or(z.literal("")),
});

export const OptionChoiceSchema = z.object({
  name: z.string().trim().min(1, "نام گزینه الزامی است").max(60),
  nameEn: z.string().trim().max(60).optional().or(z.literal("")),
  /**
   * Signed: a smaller portion may legitimately cost less. Bounded well below
   * the Int column so no combination of options can overflow a line total.
   */
  priceDelta: z.coerce
    .number()
    .int()
    .min(-100_000_000, "اختلاف قیمت خارج از محدوده است")
    .max(100_000_000, "اختلاف قیمت خارج از محدوده است")
    .default(0),
  costDelta: z.coerce.number().int().min(-100_000_000).max(100_000_000).default(0),
  isAvailable: z.boolean().default(true),
});

export const OptionGroupSchema = z
  .object({
    name: z.string().trim().min(1, "نام گروه الزامی است").max(60),
    nameEn: z.string().trim().max(60).optional().or(z.literal("")),
    isRequired: z.boolean().default(false),
    minSelect: z.coerce.number().int().min(0).max(20).default(1),
    maxSelect: z.coerce.number().int().min(1).max(20).default(1),
    isUpgrade: z.boolean().default(false),
    choices: z
      .array(OptionChoiceSchema)
      .min(1, "هر گروه حداقل یک گزینه لازم دارد")
      .max(20, "حداکثر ۲۰ گزینه در هر گروه"),
  })
  // A group demanding more picks than it offers can never be satisfied, and the
  // guest would be stuck unable to add the product at all.
  .refine((g) => g.maxSelect <= g.choices.length, {
    message: "حداکثر انتخاب از تعداد گزینه‌ها بیشتر است",
    path: ["maxSelect"],
  })
  .refine((g) => g.minSelect <= g.maxSelect, {
    message: "حداقل انتخاب از حداکثر بیشتر است",
    path: ["minSelect"],
  })
  /*
    An upgrade ladder replaces a choice, so it has to be single-select.

    Refused here rather than tolerated and ignored at render: `resolveUpgrade`
    already declines a multi-select group, but an owner who ticked both would
    get silence instead of a reason. The quoted difference would be wrong in a
    way the guest only discovers at the total.
  */
  .refine((g) => !g.isUpgrade || g.maxSelect === 1, {
    message: "گروه ارتقا باید تک‌انتخابی باشد",
    path: ["isUpgrade"],
  });

// -------------------------- recommendations --------------------------------

/**
 * How many suggestions one dish may carry.
 *
 * Well above the three the public menu shows, because an owner reasonably
 * wants alternates configured for when the first choice is off the menu — and
 * far below anything that would make the editor unusable.
 */
export const MAX_RECOMMENDATIONS_PER_PRODUCT = 10;

export const RecommendationSchema = z.object({
  recommendedProductId: z.string().min(1, "محصول پیشنهادی را انتخاب کنید"),
  isActive: z.boolean().default(true),
});

/**
 * Suggestions for a dish, in the owner's display order.
 *
 * Position *is* the order — `sortOrder` is the array index, the same convention
 * `infoSections` and `optionGroups` already use, so there is no second ordering
 * mechanism to keep in step.
 *
 * Uniqueness is checked here for the message and enforced by a unique index for
 * real. Self-reference cannot be checked at this layer — the schema does not
 * know which product is being edited — so the route does it, and a CHECK
 * constraint backs both.
 */
export const RecommendationListSchema = z
  .array(RecommendationSchema)
  .max(MAX_RECOMMENDATIONS_PER_PRODUCT, "تعداد پیشنهادها بیش از حد مجاز است")
  .refine(
    (list) => new Set(list.map((r) => r.recommendedProductId)).size === list.length,
    { message: "یک محصول را دو بار پیشنهاد نکنید" },
  );

export type RecommendationInput = z.infer<typeof RecommendationSchema>;

// ------------------------------- bundles -----------------------------------

/**
 * One dish inside a meal deal.
 *
 * `quantity` is capped rather than merely positive: a combo listing twenty
 * burgers is a typo, and a cap keeps the saving arithmetic away from figures
 * that would overflow a card. The positive floor is also a CHECK, so it holds
 * whichever path writes the row.
 */
export const BundleComponentSchema = z.object({
  componentProductId: z.string().min(1, "محصول را انتخاب کنید"),
  quantity: z.coerce
    .number()
    .int("تعداد باید عدد صحیح باشد")
    .min(1, "تعداد باید حداقل ۱ باشد")
    .max(20, "تعداد بیش از حد مجاز است")
    .default(1),
});

/**
 * A bundle's contents, in the owner's display order.
 *
 * Position is the order, the same convention every other child collection here
 * uses. Duplicates are *not* refused — `normaliseComponents` folds them into a
 * quantity, because an owner adding the same dish twice means "two of these" —
 * so unlike the recommendation list there is no uniqueness refinement.
 *
 * Self-reference cannot be checked at this layer, since the schema does not
 * know which product is being edited. `replaceBundleItems` does it, and a CHECK
 * constraint backs both.
 */
export const BundleComponentListSchema = z
  .array(BundleComponentSchema)
  .max(MAX_BUNDLE_COMPONENTS, "تعداد اجزای پیشنهاد ویژه بیش از حد مجاز است");

export type BundleComponentInput = z.infer<typeof BundleComponentSchema>;

// ------------------------- featured / merchandising ------------------------

/**
 * A promotion boundary, as the editor's `datetime-local` input writes it.
 *
 * Text rather than an instant, and converted here, for the same reason the
 * opening-hours times are: the value that reaches the column has to be one this
 * code derived, and the wall clock has to be read in the *venue's* zone rather
 * than in whatever zone the owner's laptop is set to.
 */
function promotionBoundary(label: string) {
  return z
    .string()
    .trim()
    .refine((value) => instantFromZonedWallClock(value) !== null, {
      message: `${label} معتبر نیست`,
    })
    .transform((value) => instantFromZonedWallClock(value)!);
}

/** Either a boundary or an explicit "no boundary". */
function optionalBoundary(label: string) {
  return z.union([
    promotionBoundary(label),
    z.literal("").transform(() => null),
    z.null(),
  ]);
}

const featuredFields = {
  /**
   * Optional throughout, and absent means "leave the promotion alone" — the
   * same rule `schedule` and `recommendations` follow, so a caller changing
   * only a price cannot clear a venue's merchandising by omitting fields it
   * never knew about.
   */
  featuredOrder: z.coerce.number().int().min(0).max(9999).optional(),
  featuredLabel: z
    .union([z.enum(FEATURED_LABELS), z.literal("").transform(() => null), z.null()])
    .optional(),
  featuredLabelText: z
    .union([
      z.string().trim().max(MAX_CUSTOM_LABEL_LENGTH, "متن برچسب بیش از حد بلند است"),
      z.null(),
    ])
    .optional(),
  featuredFrom: optionalBoundary("تاریخ شروع").optional(),
  featuredUntil: optionalBoundary("تاریخ پایان").optional(),
};

const ProductFields = z.object({
  ...featuredFields,
  ...scheduleFields,
  /**
   * Optional, and absent means "leave the suggestions alone" — the same rule
   * `schedule` follows, so a caller changing only a price cannot wipe them.
   */
  recommendations: RecommendationListSchema.optional(),
  /**
   * What this dish contains, when it is a meal deal.
   *
   * Optional for the same reason, and with the same consequence: absent leaves
   * the contents alone, while an empty array is the owner saying this is no
   * longer a bundle. Note it is deliberately **not** given a `.default([])` —
   * that is precisely the Zod 4 trap documented on `ProductPatchSchema` below,
   * and a default here would silently un-bundle a product on any patch that
   * did not mention it.
   */
  bundleItems: BundleComponentListSchema.optional(),
  /**
   * Spicy, vegetarian, contains nuts… Optional with no default, for the same
   * reason as `bundleItems`: absent leaves the tags alone, an empty array
   * clears them.
   */
  dietaryTags: z
    .array(z.enum(DISH_TAGS, { error: "برچسب غذا معتبر نیست" }))
    .max(DISH_TAGS.length)
    .optional(),
  categoryId: z.string().min(1, "دسته‌بندی را انتخاب کنید"),
  name: z.string().trim().min(1, "نام محصول الزامی است").max(80),
  nameEn: z.string().trim().max(80).optional().or(z.literal("")),
  shortDescription: z.string().trim().max(160).optional().or(z.literal("")),
  fullDescription: z.string().trim().max(2000).optional().or(z.literal("")),
  shortDescriptionEn: z.string().trim().max(160).optional().or(z.literal("")),
  fullDescriptionEn: z.string().trim().max(2000).optional().or(z.literal("")),
  /**
   * The owner's own line introducing this dish's pairings.
   *
   * Bounded at 90 characters: it renders as a single heading above the
   * suggested dishes on a phone, and anything longer wraps to three lines and
   * pushes the suggestions themselves below the fold. An empty string is a
   * real instruction — "go back to the platform's generic phrase" — so it is
   * accepted and stored as null by the route.
   */
  pairingNote: z
    .string()
    .trim()
    .max(90, "متن پیشنهاد بیش از حد بلند است")
    .optional()
    .or(z.literal("")),
  pairingNoteEn: z.string().trim().max(90).optional().or(z.literal("")),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  // Bound messages are written out rather than left to Zod: its defaults are
  // developer copy ("Too small: expected number to be >=0") and were being
  // shown verbatim to restaurant owners.
  price: money("قیمت"),
  compareAtPrice: money("قیمت قبل از تخفیف").nullable().optional(),
  costPrice: money("بهای تمام‌شده").default(0),
  prepMinutes: z
    .number({ error: "زمان آماده‌سازی باید عدد باشد" })
    .int("زمان آماده‌سازی باید عدد صحیح باشد")
    .min(0, "زمان آماده‌سازی نمی‌تواند منفی باشد")
    .max(600, "زمان آماده‌سازی حداکثر ۶۰۰ دقیقه است")
    .nullable()
    .optional(),
  isAvailable: z.boolean().default(true),
  hideWhenUnavailable: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  // The product brief calls for three owner-defined sections; three is the cap,
  // not a requirement, so a simple menu is not forced to invent content.
  infoSections: z.array(InfoSectionSchema).max(MAX_PRODUCT_INFO_SECTIONS).default([]),
  /**
   * Uncapped in count but bounded in size: a pizza legitimately has base,
   * crust, toppings and extras, while twenty groups would make the sheet
   * unusable long before it broke anything.
   */
  optionGroups: z.array(OptionGroupSchema).max(6).default([]),
});

/**
 * A promotion window that ends before it starts can never open, so the dish
 * would silently never be promoted and the owner would have nothing telling
 * them why. Backed by a CHECK constraint; this is the message they can act on.
 *
 * Applied to the create and the update form alike rather than to a refined
 * schema that could no longer be made partial — `.refine()` yields an effects
 * wrapper, and `.partial()` does not exist on one.
 *
 * Only fires when both ends arrive in the same request. A `PATCH` moving one
 * boundary cannot see the other, which is exactly why the database keeps the
 * copy that always holds.
 */
function windowIsOrdered(input: {
  featuredFrom?: Date | null;
  featuredUntil?: Date | null;
}): boolean {
  return (
    !input.featuredFrom ||
    !input.featuredUntil ||
    input.featuredUntil > input.featuredFrom
  );
}

const windowOrderIssue = {
  message: "تاریخ پایان باید بعد از تاریخ شروع باشد",
  path: ["featuredUntil"],
};

export const ProductSchema = ProductFields.refine(windowIsOrdered, windowOrderIssue);

/**
 * The update form.
 *
 * **`.partial()` alone is not enough, and getting that wrong loses data.** In
 * Zod 4 an optional field with a `.default()` still produces its default when
 * the key is absent, so `ProductFields.partial().parse({ isAvailable: false })`
 * returns `isFeatured: false`, `costPrice: 0`, `infoSections: []` and
 * `optionGroups: []` — none of which the caller said anything about. The route
 * writes exactly those, and because it replaces collections wholesale, an empty
 * array *deletes every info section and option group on the product*.
 *
 * That is not hypothetical: it is why this venue's seeded info-section count
 * fell every time a product was patched during development.
 *
 * The defaults are therefore stripped for the update form. They belong to
 * creation, where a field the editor omitted genuinely needs a starting value;
 * on an update the only correct reading of an absent field is "leave it alone".
 */
export const ProductPatchSchema = ProductFields.omit({
  costPrice: true,
  isAvailable: true,
  hideWhenUnavailable: true,
  isFeatured: true,
  scheduleEnabled: true,
  infoSections: true,
  optionGroups: true,
})
  .extend({
    costPrice: money("بهای تمام‌شده").optional(),
    isAvailable: z.boolean().optional(),
    hideWhenUnavailable: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    scheduleEnabled: z.boolean().optional(),
    infoSections: z.array(InfoSectionSchema).max(MAX_PRODUCT_INFO_SECTIONS).optional(),
    optionGroups: z.array(OptionGroupSchema).max(6).optional(),
  })
  .partial()
  .refine(windowIsOrdered, windowOrderIssue);

// ------------------------------ customers ----------------------------------

/**
 * Filters for the customer list.
 *
 * Every field optional and every bound explicit: this reads personal data, so
 * an unparsed page size or an unrecognised segment is refused rather than
 * coerced into something that happens to work.
 */
/**
 * What an export request may ask for.
 *
 * Deliberately narrow, and deliberately carries **no tenant**: the restaurant
 * comes from the session, so there is nothing here a caller could point at
 * another venue.
 *
 * `days` and `from`/`to` are the same two window shapes every report already
 * accepts — a rolling count for the dashboards, an explicit range for the
 * report generator. Both are bounded: an unbounded `from` would let one request
 * ask for every order a venue has ever taken.
 */
export const ExportQuerySchema = z
  .object({
    dataset: z.enum(EXPORT_DATASETS),
    /** Absent means `xlsx`, the file an owner opens in Excel. */
    format: z.enum(EXPORT_FORMATS).optional(),
    days: z.coerce.number().int().min(1).max(366).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  // Half a range is not a range. Silently ignoring the half that arrived would
  // export a different period from the one the owner is looking at.
  .refine((q) => Boolean(q.from) === Boolean(q.to), {
    message: "هر دو تاریخ شروع و پایان لازم است",
    path: ["from"],
  })
  .refine((q) => !q.from || !q.to || q.to >= q.from, {
    message: "تاریخ پایان باید بعد از تاریخ شروع باشد",
    path: ["to"],
  });

export type ExportQuery = z.infer<typeof ExportQuerySchema>;

export const CustomerQuerySchema = z.object({
  segment: z.enum(CUSTOMER_SEGMENTS).optional(),
  /**
   * Spending band, relative to this venue's own customers.
   *
   * A second, independent axis rather than more segment values: a guest can be
   * both high value and at risk, and that combination is the whole reason the
   * retention screen exists. One enum cannot hold two orthogonal facts.
   */
  valueTier: z.enum(VALUE_TIERS).optional(),
  /** Matched against the name or the phone. Bounded so it cannot be a payload. */
  search: z.string().trim().max(60).optional(),
  minOrders: z.coerce.number().int().min(0).max(10_000).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export type CustomerQuery = z.infer<typeof CustomerQuerySchema>;

/**
 * The only thing an owner may write on a customer.
 *
 * Everything else the dashboard shows is derived from orders, and an editable
 * copy of a derived figure is a figure that can be made to lie.
 */
export const CustomerConsentSchema = z.object({
  marketingConsent: z.boolean(),
});

// ------------------------------ campaigns ----------------------------------

/** An optional reference to something on the menu, or an explicit "none". */
const optionalReference = z.union([
  z.string().trim().min(1).max(40),
  z.literal("").transform(() => null),
  z.null(),
]);

/**
 * Delegates to the campaign state machine rather than restating the rule.
 *
 * `DRAFT` is passed deliberately: of the three things `scheduleIssue` checks,
 * only the ordering one applies to a draft, which is exactly the subset a
 * schema can judge. Whether a *start date* is required, and whether the window
 * has already closed, both depend on the state being entered — the server
 * decides those when the transition is requested, and the database's
 * `Campaign_window_ordered` CHECK is the copy that holds regardless.
 */
function campaignWindowIsOrdered(input: {
  startsAt?: Date | null;
  endsAt?: Date | null;
}): boolean {
  return scheduleIssue("DRAFT", input, new Date()) !== "END_BEFORE_START";
}

const campaignWindowIssue = {
  message: "تاریخ پایان باید بعد از تاریخ شروع باشد",
  path: ["endsAt"],
};

/**
 * A campaign's configuration.
 *
 * The segment is validated against `CUSTOMER_SEGMENTS` — the same catalogue the
 * customer book uses — so a campaign can never target a group that does not
 * exist. Product and category are ids only; whether they belong to *this*
 * venue is a question the schema cannot answer and the server always asks.
 */
export const CampaignSchema = z
  .object({
    name: z.string().trim().min(1, "نام کمپین الزامی است").max(80),
    targetSegment: z.enum(CUSTOMER_SEGMENTS, { error: "گروه هدف را انتخاب کنید" }),
    productId: optionalReference.optional(),
    categoryId: optionalReference.optional(),
    startsAt: optionalBoundary("تاریخ شروع").optional(),
    endsAt: optionalBoundary("تاریخ پایان").optional(),
  })
  .refine(campaignWindowIsOrdered, campaignWindowIssue);

export type CampaignInputBody = z.infer<typeof CampaignSchema>;

/**
 * A requested state change.
 *
 * Only the target is accepted; the state being moved *from* is read from the
 * row, never from the client, so a stale tab cannot talk the server into a
 * transition that is not actually available.
 */
export const CampaignStatusSchema = z.object({
  status: z.enum(CAMPAIGN_STATUSES, { error: "وضعیت معتبر نیست" }),
});

export const CampaignQuerySchema = z.object({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_CAMPAIGN_PAGE_SIZE).optional(),
});

/**
 * The audience preview the campaign form asks for while the owner is still
 * choosing. Returns counts only — see the route.
 */
export const AudienceQuerySchema = z.object({
  segment: z.enum(CUSTOMER_SEGMENTS, { error: "گروه هدف را انتخاب کنید" }),
  productId: z.string().trim().min(1).max(40).optional(),
  categoryId: z.string().trim().min(1).max(40).optional(),
});

// ---------------------------- SMS broadcasts -------------------------------

/**
 * A promotional SMS a venue wants priced or bought.
 *
 * The same schema for the quote and the purchase, so the figure an owner is
 * shown and the figure they pay are computed from identical input. Length is
 * bounded loosely here; the real ceiling is in SMS parts, which depends on the
 * encoding and is decided by `quoteBroadcast`.
 *
 * An empty text is accepted *here* and refused by `quoteBroadcast` as `EMPTY`:
 * the composer asks for a quote before anything is typed, so it can show how
 * many customers the message would reach, and the purchase path refuses the
 * same issue with the same code.
 */
export const SmsBroadcastSchema = z.object({
  text: z
    .string({ error: "متن پیامک را بنویسید" })
    .trim()
    .max(MAX_BROADCAST_TEXT_LENGTH, "متن پیامک طولانی است"),
  audience: z.enum(SMS_AUDIENCES).optional(),
  campaignId: z.string().trim().min(1).max(40).nullish(),
});

/** Platform staff's only moves: sent, or refused. PAID comes from the gateway. */
export const SmsBroadcastStatusSchema = z.object({
  status: z.enum(["SENT", "CANCELED"]),
});

// ------------------------------ design -------------------------------------

/**
 * Reuses ThemeSchema rather than restating it: a second copy would drift, and
 * the copy that drifted first was the one guarding `backgroundImage` against
 * CSS injection.
 */
export const DesignSchema = z.object({
  templateId: z.string().min(1),
  theme: ThemeSchema,
  /**
   * Optional so an older client — or any caller that only means to change the
   * template — cannot switch a venue's photos off by omitting the field.
   * The route leaves the column untouched when it is absent.
   */
  showProductPhotos: z.boolean().optional(),
});

/**
 * An account created by platform staff, standing in for self-service signup.
 *
 * Reuses `emailSchema` and `slugSchema` rather than restating their rules: an
 * admin-created venue takes the same public URL and the same unique-phone
 * constraint as a self-registered one, so a second, looser copy of those rules
 * here would let staff create accounts the registration form would have
 * rejected.
 */
/**
 * Operator-editable platform settings.
 *
 * Only the backup destination for now. An empty string is a deliberate "stop
 * delivering", stored as null, and is distinct from omitting the field.
 */
export const PlatformSettingsSchema = z.object({
  backupEmail: z.union([emailSchema, z.literal("")]),
});

export const AdminAccountSchema = z.object({
  /** The owner signs in with this number; their first code proves it. */
  ownerPhone: mobileSchema,
  ownerName: z
    .string()
    .trim()
    .min(2, "نام مالک باید حداقل ۲ کاراکتر باشد")
    .max(80, "نام مالک بیش از حد بلند است"),
  restaurantName: z
    .string()
    .trim()
    .min(2, "نام رستوران باید حداقل ۲ کاراکتر باشد")
    .max(80, "نام رستوران بیش از حد بلند است"),
  slug: slugSchema,
  planCode: z.string().trim().min(1, "پلن را انتخاب کنید"),
  /**
   * Whole days only. A fractional duration is rejected rather than rounded,
   * because "1.5" here is always a typo and rounding it silently would hand the
   * customer a period neither side agreed to.
   */
  durationDays: z.coerce
    .number()
    .int("مدت اشتراک باید عدد صحیح باشد")
    .min(MIN_ONBOARDING_DAYS, "مدت اشتراک باید حداقل یک روز باشد")
    .max(MAX_ONBOARDING_DAYS, "مدت اشتراک بیش از حد طولانی است"),
});

// ----------------------------- settings ------------------------------------

/**
 * The footer's social links.
 *
 * Two rules carry weight here. The **cap** is enforced server-side rather than
 * only in the picker, because the footer lays three icons out as a row and a
 * fourth would wrap into a ragged second line on a phone. And a **platform may
 * appear once**: two Instagram buttons side by side is always a mistake, and
 * silently rendering both makes the owner hunt for which one is wrong.
 *
 * The URL itself is deliberately *not* pattern-matched here — an owner may
 * legitimately paste a full link or just their handle. `socialHref` resolves
 * both and refuses anything that does not end up as https, which is the check
 * that actually matters for a value going into an href.
 */
export const SocialLinksSchema = z
  .array(
    z.object({
      platform: z.enum(SOCIAL_PLATFORM_IDS),
      url: z.string().trim().min(1, "نشانی را وارد کنید").max(200),
    }),
  )
  .max(MAX_SOCIAL_LINKS, "حداکثر سه شبکه اجتماعی می‌توانید اضافه کنید")
  .refine(
    (links) => new Set(links.map((l) => l.platform)).size === links.length,
    "هر شبکه اجتماعی فقط یک بار می‌تواند اضافه شود",
  );

/**
 * The settings endpoint is a PATCH, so every field is optional: sending only
 * the toggle you flipped must work. Requiring the four booleans made a partial
 * update fail with a validation error naming fields the caller never touched.
 */
export const RestaurantSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "نام رستوران باید حداقل ۲ کاراکتر باشد")
    .max(80, "نام رستوران بیش از حد بلند است")
    .optional(),
  nameEn: z.string().trim().max(80).optional().or(z.literal("")),
  tagline: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  coverUrl: z.string().trim().max(500).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  phoneSecondary: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  instagram: z.string().trim().max(60).optional().or(z.literal("")),
  socialLinks: SocialLinksSchema.optional(),
  onlineOrderingEnabled: z.boolean().optional(),
  onlinePaymentEnabled: z.boolean().optional(),
  showPrices: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  defaultLocale: z.enum(["fa", "en"]).optional(),
  /** Whether the public menu shows a featured strip at all. */
  featuredSectionEnabled: z.boolean().optional(),
});

/**
 * Pricing options from the "more options" screen.
 *
 * Bounds are deliberately tight: these values multiply every bill the venue
 * issues, so a typo here is not a cosmetic problem. Percentages are whole
 * numbers, and the rounding increment is limited to the denominations Iranian
 * venues actually round to.
 */
export const ROUNDING_INCREMENTS = [0, 1_000, 5_000, 10_000, 50_000] as const;

/**
 * A menu-wide price change.
 *
 * `apply` defaults to false so that a caller who forgets the field gets a
 * preview rather than an irreversible rewrite of every price on the menu.
 */
export const BulkPriceSchema = z.object({
  percent: z.coerce
    .number()
    .min(MIN_BULK_PERCENT, "درصد خارج از محدوده مجاز است")
    .max(MAX_BULK_PERCENT, "درصد خارج از محدوده مجاز است"),
  apply: z.boolean().default(false),
});

export const PricingOptionsSchema = z.object({
  /**
   * Whether checkout asks for a discount code.
   *
   * Lives with the pricing options because it changes what a guest can be
   * charged, and travels through the same PATCH so one save cannot leave the
   * toggle and the rules disagreeing.
   */
  discountCodesEnabled: z.boolean().optional(),

  /**
   * Whether a placed order shows the guest what their code took off.
   *
   * Display only: the amount is snapshotted onto the order either way, so
   * switching this off hides a figure rather than changing one. Sits beside
   * `discountCodesEnabled` because it is the same screen and the same decision.
   */
  showOrderDiscount: z.boolean().optional(),

  taxEnabled: z.boolean().optional(),
  taxPercent: z.coerce
    .number()
    .int()
    .min(0, "درصد مالیات نمی‌تواند منفی باشد")
    .max(50, "درصد مالیات بیش از حد زیاد است")
    .optional(),

  serviceChargeEnabled: z.boolean().optional(),
  serviceChargePercent: z.coerce
    .number()
    .int()
    .min(0, "درصد حق سرویس نمی‌تواند منفی باشد")
    .max(50, "درصد حق سرویس بیش از حد زیاد است")
    .optional(),

  tipEnabled: z.boolean().optional(),
  tipPercents: z
    .array(z.coerce.number().int().min(1).max(100))
    .min(1, "حداقل یک درصد انعام لازم است")
    .max(4, "حداکثر چهار گزینه انعام مجاز است")
    .optional(),

  roundingIncrement: z.coerce
    .number()
    .int()
    .refine(
      (value) => (ROUNDING_INCREMENTS as readonly number[]).includes(value),
      "مقدار رُند کردن معتبر نیست",
    )
    .optional(),
  roundingDirection: z.enum(["up", "down", "nearest"]).optional(),

  /**
   * The step menu prices are shown and charged at. One of the bulk tool's
   * steps, so the two screens offer the same choices.
   */
  menuPriceStep: z.coerce
    .number()
    .int()
    .refine(
      (value) => (PRICE_ROUNDING_STEPS as readonly number[]).includes(value),
      "مقدار رُند کردن معتبر نیست",
    )
    .optional(),
  /** Whether an ingredient's price change moves the dishes that use it. */
  autoRepriceFromCost: z.boolean().optional(),
  /** Warn below this gross margin over ingredient cost. 0 turns it off. */
  lowMarginPercent: z.coerce
    .number()
    .int()
    .min(0, "درصد حاشیه سود نمی‌تواند منفی باشد")
    .max(95, "درصد حاشیه سود بیش از حد زیاد است")
    .optional(),

  minimumOrderAmount: z.coerce
    .number()
    .int()
    .min(0, "حداقل مبلغ سفارش نمی‌تواند منفی باشد")
    .max(100_000_000, "حداقل مبلغ سفارش بیش از حد زیاد است")
    .optional(),

  staffCallEnabled: z.boolean().optional(),
  staffCallLabel: z
    .string()
    .trim()
    .min(2, "متن دکمه را وارد کنید")
    .max(40, "متن دکمه بیش از حد بلند است")
    .optional(),
  staffCallLabelEn: z.string().trim().max(40).optional().or(z.literal("")),

  /** Offers the menu in English alongside Persian. */
  bilingualEnabled: z.boolean().optional(),

  /**
   * Whether checkout asks the guest for a phone number.
   *
   * Lives with the checkout options because that is the step it changes. The
   * flag alone is not the enforcement — `createOrder` drops any number that
   * arrives while it is off, so turning it off genuinely stops collection
   * rather than merely hiding the input.
   */
  phoneCollectionEnabled: z.boolean().optional(),

  /** Guests may choose takeaway at checkout (see `resolveService`). */
  takeawayEnabled: z.boolean().optional(),
});

export type PricingOptionsInput = z.infer<typeof PricingOptionsSchema>;

// ----------------------------- inventory -----------------------------------

/**
 * An ingredient on a shelf.
 *
 * Quantities cross the wire in the owner's own unit — 2.5, not 2500 — and the
 * route converts with `toMilli`. Keeping the readable number on the wire means
 * a request body says what a human would say, and there is exactly one place
 * that knows about the scaling.
 */
const unitCode = z.enum(UNIT_CODES, { error: "واحد را انتخاب کنید" });

/**
 * What the venue pays for one `priceUnit` of the item, in whole Toman. Null
 * clears it. Owners type invoice figures, which are whole Toman.
 */
const purchasePrice = z.coerce
  .number()
  .int("قیمت خرید باید عدد صحیح باشد")
  .min(1, "قیمت خرید باید بیشتر از صفر باشد")
  .max(1_000_000_000, "قیمت خرید بیش از حد بزرگ است")
  .nullable();

const inventoryFields = {
  name: z.string().trim().min(1, "نام ماده را وارد کنید").max(80),
  unit: unitCode,
  quantity: z.coerce.number().min(0, "مقدار نمی‌تواند منفی باشد").max(1_000_000),
  /** 0 means "do not watch this item" rather than "warn always". */
  lowStock: z.coerce.number().min(0, "سقف هشدار نمی‌تواند منفی باشد").max(1_000_000),
  purchasePrice,
  priceUnit: unitCode.nullable(),
};

/**
 * A price needs both halves, quoted in a unit of the same kind as the stock.
 * The database enforces the same rule; this is the copy that answers in words.
 */
function pricedConsistently(
  value: { unit?: string; purchasePrice?: number | null; priceUnit?: string | null },
  ctx: z.RefinementCtx,
): void {
  const hasPrice = value.purchasePrice !== undefined && value.purchasePrice !== null;
  const hasUnit = value.priceUnit !== undefined && value.priceUnit !== null;

  if (
    hasPrice !== hasUnit &&
    value.purchasePrice !== undefined &&
    value.priceUnit !== undefined
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["priceUnit"],
      message: "قیمت خرید و واحد آن باید با هم وارد شوند",
    });
  }

  if (
    hasUnit &&
    value.unit !== undefined &&
    isUnitCode(value.unit) &&
    isUnitCode(value.priceUnit) &&
    !sameDimension(value.unit, value.priceUnit)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["priceUnit"],
      message: "واحد قیمت باید از همان نوع واحد موجودی باشد",
    });
  }
}

export const InventoryItemSchema = z
  .object({
    ...inventoryFields,
    purchasePrice: purchasePrice.optional(),
    priceUnit: inventoryFields.priceUnit.optional(),
  })
  .superRefine(pricedConsistently);

/**
 * Editing an item: every field optional, so one change cannot blank the rest.
 *
 * Built from the field list rather than with `.partial()` on the schema above:
 * none of these carries a default today, and constructing it this way keeps it
 * that way — `.partial()` would not suppress one if it were ever added.
 */
export const InventoryItemPatchSchema = z
  .object({
    name: inventoryFields.name.optional(),
    unit: inventoryFields.unit.optional(),
    quantity: inventoryFields.quantity.optional(),
    lowStock: inventoryFields.lowStock.optional(),
    purchasePrice: inventoryFields.purchasePrice.optional(),
    priceUnit: inventoryFields.priceUnit.optional(),
  })
  .superRefine(pricedConsistently);

/**
 * A dish's whole recipe, replaced in one call.
 *
 * Sent as the complete list rather than as add/remove operations: an owner
 * ticking ingredients off a form is describing the end state, and a partial
 * protocol would leave the two able to disagree about what was removed.
 */
export const ProductRecipeSchema = z.object({
  ingredients: z
    .array(
      z.object({
        itemId: z.string().min(1),
        /** How much one of the dish uses, in `unit`. */
        amount: z.coerce
          .number()
          .positive("مقدار مصرف باید بیشتر از صفر باشد")
          .max(1_000_000, "مقدار مصرف بیش از حد بزرگ است"),
        /**
         * The unit the amount is typed in — "230 g" of a kilogram item. Absent
         * means the item's own unit. Converted by the route, which knows the
         * item's unit and refuses one of a different kind.
         */
        unit: unitCode.optional(),
      }),
    )
    .max(50, "تعداد مواد اولیه بیش از حد زیاد است"),
});

// ------------------------------- staff -------------------------------------

/**
 * A staff account the owner creates.
 *
 * `tabs` is validated loosely on purpose — `sanitiseTabs` in staff-tabs.ts is
 * what decides which keys are real, so an owner-only section sent in this list
 * is dropped rather than rejected. Refusing would tell a caller which keys
 * exist; dropping stores exactly the access that was actually granted.
 */
export const StaffSchema = z.object({
  name: z.string().trim().min(2, "نام را وارد کنید").max(80),
  /** The staff member signs in with this number; their first code proves it. */
  phone: mobileSchema,
  tabs: z.array(z.string().max(40)).max(20).default([]),
});

/** Editing an existing account: access only. */
export const StaffAccessSchema = z.object({
  tabs: z.array(z.string().max(40)).max(20),
});

// ------------------------------ support ------------------------------------

/**
 * A ticket from a venue to platform staff.
 *
 * Bounds are generous on the message and tight on the subject: the subject is
 * what an admin scans an inbox by, and a paragraph pasted into it makes the
 * list unreadable.
 */
export const SupportTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, "موضوع را کوتاه بنویسید")
    .max(120, "موضوع بیش از حد بلند است"),
  message: z
    .string()
    .trim()
    .min(10, "توضیح بیشتری بنویسید تا بتوانیم کمک کنیم")
    .max(4000, "متن پیام بیش از حد بلند است"),
});

/** The admin's answer. Empty is not a reply. */
export const SupportReplySchema = z.object({
  reply: z.string().trim().min(1).max(4000),
  status: z.enum(["OPEN", "ANSWERED", "CLOSED"]).optional(),
});

// ------------------------------ reports ------------------------------------

/**
 * Report window. Note what is absent: there is no restaurant id. The tenant is
 * resolved from the session in the route handler, so a caller can choose the
 * dates but never whose data is reported on.
 */
export const ReportQuerySchema = z
  .object({
    preset: z.enum(["month", "quarter", "custom"]).default("month"),
    /** yyyy-mm-dd. Required for `custom`, ignored otherwise. */
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ شروع معتبر نیست")
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ پایان معتبر نیست")
      .optional(),
    /**
     * Which calendar `year` and `month` are expressed in. Persian users pick a
     * Jalali month; the window is still resolved to a Gregorian range server
     * side, so every downstream query stays unchanged.
     */
    calendar: z.enum(["gregorian", "jalali"]).default("gregorian"),
    /**
     * Anchor for month/quarter presets; defaults to the current month. The
     * lower bound accommodates Jalali years (≈1400) as well as Gregorian ones.
     */
    year: z.coerce.number().int().min(1300).max(2200).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  })
  .refine((value) => value.preset !== "custom" || (value.from && value.to), {
    message: "برای بازه دلخواه، تاریخ شروع و پایان را وارد کنید",
    path: ["from"],
  })
  .refine(
    (value) =>
      value.preset !== "custom" || !value.from || !value.to || value.from <= value.to,
    { message: "تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد", path: ["from"] },
  );

export type ReportQuery = z.infer<typeof ReportQuerySchema>;

// ------------------------------- admin -------------------------------------

export const AdminRestaurantQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"]).optional(),
  plan: z.string().trim().max(40).optional(),
  sort: z
    .enum(["name", "createdAt", "expiresAt", "revenue", "status"])
    .default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  registeredAfter: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ معتبر نیست")
    .optional(),
});

/**
 * A manual subscription extension. `reason` is required rather than optional:
 * an audit trail of unexplained grants is not an audit trail.
 */
export const ExtendSubscriptionSchema = z.object({
  days: z
    .number({ error: "تعداد روز باید عدد باشد" })
    .int("تعداد روز باید عدد صحیح باشد")
    .min(MIN_EXTENSION_DAYS, `حداقل ${MIN_EXTENSION_DAYS} روز`)
    .max(MAX_EXTENSION_DAYS, `حداکثر ${MAX_EXTENSION_DAYS} روز`),
  extensionType: z.enum(["MANUAL", "GIFT"]),
  reason: z
    .string()
    .trim()
    .min(3, "دلیل تمدید را وارد کنید")
    .max(300, "دلیل بیش از حد بلند است"),
});

// ------------------------------ tables -------------------------------------

export const TableSchema = z.object({
  number: z
    .string()
    .trim()
    .min(1, "شماره میز را وارد کنید")
    .max(20, "شماره میز بیش از حد بلند است"),
  label: z.string().trim().max(40).optional().or(z.literal("")),
  seats: z
    .number({ error: "تعداد صندلی باید عدد باشد" })
    .int("تعداد صندلی باید عدد صحیح باشد")
    .min(1, "تعداد صندلی حداقل ۱ است")
    .max(50, "تعداد صندلی حداکثر ۵۰ است")
    .nullable()
    .optional(),
});

// ----------------------------- expenses ------------------------------------

export const EXPENSE_CATEGORIES = [
  "rent",
  "salary",
  "utilities",
  "supplies",
  "marketing",
  "other",
] as const;

export const ExpenseSchema = z.object({
  title: z.string().trim().min(1).max(80),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: money("مبلغ").max(10_000_000_000, "مبلغ بیش از حد بزرگ است"),
  note: z.string().trim().max(300).optional().or(z.literal("")),
  occurredAt: z.string().datetime().or(z.string().min(1)),
  isRecurring: z.boolean().default(false),
});

// ------------------------------ orders -------------------------------------

export const OrderStatusSchema = z.object({
  status: z.enum(["RECEIVED", "PREPARING", "READY", "DELIVERED", "CANCELED"]),
});

/**
 * Settling a cash bill. A boolean rather than the PaymentStatus enum on
 * purpose: FAILED and REFUNDED belong to the payment gateway, and this endpoint
 * must not be able to write them.
 */
export const OrderPaymentSchema = z.object({
  paid: z.boolean(),
});
