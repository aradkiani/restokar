/**
 * Editing a plan from the platform console: what may be changed, the checks,
 * and a readable list of what changed.
 *
 * Pure (Zod only), shared by the admin form — which shows the changes in a
 * confirm dialog before saving — and the API route, which re-checks
 * everything and records the same list in the audit log.
 *
 * Not editable here: the plan's code (checkout and the seeds refer to it) and
 * whether it is contract-priced (that decides whether checkout is allowed at
 * all). Plans are never deleted — a plan someone has paid for can only be
 * hidden.
 */
import { z } from "zod";
import { MAX_PLAN_FEATURE_LENGTH, MAX_PLAN_FEATURES } from "./plan-features";

const MAX_PRICE = 10_000_000_000; // whole Toman
const MAX_LIMIT = 1_000_000;

const price = z
  .number({ error: "مبلغ را وارد کنید" })
  .int("مبلغ باید عدد صحیح باشد")
  .min(0, "مبلغ نمی‌تواند منفی باشد")
  .max(MAX_PRICE, "مبلغ بیش از حد بزرگ است");

const limit = z
  .number({ error: "عدد را وارد کنید" })
  .int("عدد صحیح وارد کنید")
  .min(-1, "برای نامحدود، گزینهٔ «نامحدود» را بزنید")
  .max(MAX_LIMIT, "عدد بیش از حد بزرگ است");

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "تاریخ معتبر نیست")
  .nullable();

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `حداکثر ${max.toLocaleString("fa-IR")} نویسه`);

/** The complete editable state — every field sent every time, no partials. */
export const PlanEditSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    name: text(40).min(1, "نام پلن را وارد کنید"),
    nameEn: text(40).min(1, "نام انگلیسی را وارد کنید"),
    description: text(200).nullable(),
    descriptionEn: text(200).nullable(),
    monthlyPrice: price,
    yearlyPrice: price,
    promoMonthlyPrice: price.nullable(),
    promoYearlyPrice: price.nullable(),
    promoStartsAt: isoDate,
    promoEndsAt: isoDate,
    maxProducts: limit,
    maxCategories: limit,
    maxTables: limit,
    maxDailyViews: limit,
    allowsOnlinePay: z.boolean(),
    allowsAnalytics: z.boolean(),
    allowsBranches: z.boolean(),
    allowsCustomDomain: z.boolean(),
    isPublic: z.boolean(),
    isRecommended: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000),
    /** Null: the built-in list for this plan. */
    features: z
      .array(
        z.object({
          fa: text(MAX_PLAN_FEATURE_LENGTH).min(1, "متن فارسی را وارد کنید"),
          en: text(MAX_PLAN_FEATURE_LENGTH),
        }),
      )
      .max(MAX_PLAN_FEATURES, `حداکثر ${MAX_PLAN_FEATURES.toLocaleString("fa-IR")} مورد`)
      .nullable(),
  })
  .superRefine((plan, ctx) => {
    if (plan.promoMonthlyPrice !== null && plan.promoMonthlyPrice >= plan.monthlyPrice) {
      ctx.addIssue({
        code: "custom",
        path: ["promoMonthlyPrice"],
        message: "قیمت تخفیفی باید کمتر از قیمت عادی باشد",
      });
    }
    if (plan.promoYearlyPrice !== null && plan.promoYearlyPrice >= plan.yearlyPrice) {
      ctx.addIssue({
        code: "custom",
        path: ["promoYearlyPrice"],
        message: "قیمت تخفیفی باید کمتر از قیمت عادی باشد",
      });
    }
    if (
      plan.promoStartsAt &&
      plan.promoEndsAt &&
      Date.parse(plan.promoEndsAt) <= Date.parse(plan.promoStartsAt)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["promoEndsAt"],
        message: "پایان تخفیف باید بعد از شروع آن باشد",
      });
    }
    if (
      (plan.promoStartsAt || plan.promoEndsAt) &&
      plan.promoMonthlyPrice === null &&
      plan.promoYearlyPrice === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["promoMonthlyPrice"],
        message: "برای تخفیف زمان‌دار، قیمت تخفیفی را وارد کنید",
      });
    }
    if (plan.isRecommended && !plan.isPublic) {
      ctx.addIssue({
        code: "custom",
        path: ["isRecommended"],
        message: "پلن پنهان نمی‌تواند «پیشنهاد ما» باشد",
      });
    }
  });

export type PlanEditInput = z.infer<typeof PlanEditSchema>;

/** The editable fields of a plan, as stored in its history. */
export type PlanState = Omit<PlanEditInput, "expectedVersion">;

export const PLAN_FIELDS = [
  "name",
  "nameEn",
  "description",
  "descriptionEn",
  "monthlyPrice",
  "yearlyPrice",
  "promoMonthlyPrice",
  "promoYearlyPrice",
  "promoStartsAt",
  "promoEndsAt",
  "maxProducts",
  "maxCategories",
  "maxTables",
  "maxDailyViews",
  "allowsOnlinePay",
  "allowsAnalytics",
  "allowsBranches",
  "allowsCustomDomain",
  "isPublic",
  "isRecommended",
  "sortOrder",
  "features",
] as const satisfies readonly (keyof PlanState)[];

type PlanField = (typeof PLAN_FIELDS)[number];

export const PLAN_FIELD_LABELS: Record<PlanField, string> = {
  name: "نام",
  nameEn: "نام انگلیسی",
  description: "توضیح",
  descriptionEn: "توضیح انگلیسی",
  monthlyPrice: "قیمت ماهانه",
  yearlyPrice: "قیمت سالانه",
  promoMonthlyPrice: "قیمت تخفیفی ماهانه",
  promoYearlyPrice: "قیمت تخفیفی سالانه",
  promoStartsAt: "شروع تخفیف",
  promoEndsAt: "پایان تخفیف",
  maxProducts: "سقف محصول",
  maxCategories: "سقف دسته‌بندی",
  maxTables: "سقف میز",
  maxDailyViews: "سقف بازدید روزانه",
  allowsOnlinePay: "پرداخت آنلاین",
  allowsAnalytics: "گزارش‌ها",
  allowsBranches: "شعبه",
  allowsCustomDomain: "دامنهٔ اختصاصی",
  isPublic: "نمایش و فروش",
  isRecommended: "پیشنهاد ما",
  sortOrder: "ترتیب",
  features: "فهرست امکانات",
};

const PRICE_FIELDS = new Set<PlanField>([
  "monthlyPrice",
  "yearlyPrice",
  "promoMonthlyPrice",
  "promoYearlyPrice",
  "promoStartsAt",
  "promoEndsAt",
]);
const LIMIT_FIELDS = new Set<PlanField>([
  "maxProducts",
  "maxCategories",
  "maxTables",
  "maxDailyViews",
  "allowsOnlinePay",
  "allowsAnalytics",
  "allowsBranches",
  "allowsCustomDomain",
]);

/** A plan row (or anything with its fields) as the editable state. */
export function planState(
  plan: {
    [K in Exclude<PlanField, "promoStartsAt" | "promoEndsAt" | "features">]: PlanState[K];
  } & {
    promoStartsAt: Date | string | null;
    promoEndsAt: Date | string | null;
    features: unknown;
  },
): PlanState {
  const iso = (value: Date | string | null) =>
    value === null ? null : new Date(value).toISOString();
  const features = Array.isArray(plan.features)
    ? (plan.features as { fa?: unknown; en?: unknown }[]).map((item) => ({
        fa: typeof item?.fa === "string" ? item.fa : "",
        en: typeof item?.en === "string" ? item.en : "",
      }))
    : null;
  return {
    name: plan.name,
    nameEn: plan.nameEn,
    description: plan.description,
    descriptionEn: plan.descriptionEn,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    promoMonthlyPrice: plan.promoMonthlyPrice,
    promoYearlyPrice: plan.promoYearlyPrice,
    promoStartsAt: iso(plan.promoStartsAt),
    promoEndsAt: iso(plan.promoEndsAt),
    maxProducts: plan.maxProducts,
    maxCategories: plan.maxCategories,
    maxTables: plan.maxTables,
    maxDailyViews: plan.maxDailyViews,
    allowsOnlinePay: plan.allowsOnlinePay,
    allowsAnalytics: plan.allowsAnalytics,
    allowsBranches: plan.allowsBranches,
    allowsCustomDomain: plan.allowsCustomDomain,
    isPublic: plan.isPublic,
    isRecommended: plan.isRecommended,
    sortOrder: plan.sortOrder,
    features,
  };
}

export interface PlanChange {
  field: PlanField;
  label: string;
  before: unknown;
  after: unknown;
}

/** What differs between two states, in form order. */
export function diffPlan(before: PlanState, after: PlanState): PlanChange[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return PLAN_FIELDS.filter((field) => !same(before[field], after[field])).map(
    (field) => ({
      field,
      label: PLAN_FIELD_LABELS[field],
      before: before[field],
      after: after[field],
    }),
  );
}

export const touchesPrice = (changes: PlanChange[]) =>
  changes.some((change) => PRICE_FIELDS.has(change.field));
export const touchesLimits = (changes: PlanChange[]) =>
  changes.some((change) => LIMIT_FIELDS.has(change.field));

/** One change as a short Persian phrase, for the confirm dialog and the log. */
export function describeChange(change: PlanChange): string {
  const show = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "خالی";
    if (typeof value === "boolean") return value ? "بله" : "خیر";
    if (typeof value === "number") {
      if (value < 0 && !PRICE_FIELDS.has(change.field)) return "نامحدود";
      return value.toLocaleString("fa-IR");
    }
    if (
      (change.field === "promoStartsAt" || change.field === "promoEndsAt") &&
      typeof value === "string"
    ) {
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Tehran",
      }).format(new Date(value));
    }
    if (Array.isArray(value)) return `${value.length.toLocaleString("fa-IR")} مورد`;
    return String(value);
  };
  if (change.field === "features") {
    return change.after === null
      ? `${change.label}: برگشت به فهرست پیش‌فرض`
      : `${change.label}: ویرایش شد (${show(change.after)})`;
  }
  return `${change.label}: ${show(change.before)} ← ${show(change.after)}`;
}
