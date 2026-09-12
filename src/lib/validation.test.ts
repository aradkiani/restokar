import { describe, expect, it } from "vitest";
import {
  AudienceQuerySchema,
  CampaignQuerySchema,
  CampaignSchema,
  CampaignStatusSchema,
  DesignSchema,
  LoginSchema,
  MAX_RECOMMENDATIONS_PER_PRODUCT,
  ProductPatchSchema,
  ProductSchema,
  RecommendationListSchema,
  RegisterSchema,
  RestaurantSettingsSchema,
  ScheduleWindowSchema,
  TableSchema,
  emailSchema,
  slugSchema,
} from "./validation";
import { MAX_SCHEDULE_WINDOWS } from "./availability";
import { CAMPAIGN_STATUSES, MAX_CAMPAIGN_PAGE_SIZE } from "./campaigns";
import { CUSTOMER_SEGMENTS } from "./customers";
import { instantFromZonedWallClock } from "./time";

/**
 * Validation is the boundary between the client and the database. These tests
 * pin the rules that carry security or data-integrity weight, and check that
 * user-facing messages are Persian rather than raw Zod English.
 */

describe("emailSchema", () => {
  it("normalises case and whitespace so one person cannot hold two accounts", () => {
    expect(emailSchema.parse("  Owner@Cafe-Nabsh.IR  ")).toBe("owner@cafe-nabsh.ir");
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "not-an-email", "a@", "@b.com", "a b@c.com"]) {
      expect(emailSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("slugSchema", () => {
  it("accepts Persian and latin slugs", () => {
    expect(slugSchema.parse("cafe-nabsh")).toBe("cafe-nabsh");
    expect(slugSchema.parse("کافه-نبش")).toBe("کافه-نبش");
  });

  it("refuses reserved words that would shadow real routes", () => {
    for (const reserved of ["api", "admin", "dashboard", "login", "menu", "payment"]) {
      expect(slugSchema.safeParse(reserved).success, reserved).toBe(false);
    }
  });

  it("refuses characters that would break a URL", () => {
    for (const bad of ["has space", "slash/es", "..", "a", "-leading", "trailing-"]) {
      expect(slugSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("RegisterSchema", () => {
  const valid = {
    name: "نیما رستگار",
    email: "nima@example.ir",
    password: "password123",
    restaurantName: "کافه نبش",
    slug: "cafe-nabsh-2",
  };

  it("accepts a complete registration", () => {
    expect(RegisterSchema.safeParse(valid).success).toBe(true);
  });

  it("requires at least eight characters of password", () => {
    const result = RegisterSchema.safeParse({ ...valid, password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("رمز عبور باید حداقل ۸ کاراکتر باشد");
    }
  });
});

describe("LoginSchema", () => {
  it("requires a password but does not impose length rules on sign-in", () => {
    // Length is a registration rule; enforcing it at login would leak that an
    // existing password is too short.
    expect(LoginSchema.safeParse({ email: "a@b.ir", password: "x" }).success).toBe(true);
    expect(LoginSchema.safeParse({ email: "a@b.ir", password: "" }).success).toBe(false);
  });
});

describe("ProductSchema money rules", () => {
  const valid = { categoryId: "c1", name: "اسپرسو", price: 55_000 };

  it("rejects a negative price with Persian copy, not raw Zod English", () => {
    const result = ProductSchema.safeParse({ ...valid, price: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("قیمت نمی‌تواند منفی باشد");
    }
  });

  it("rejects a fractional price — Toman has no minor unit", () => {
    expect(ProductSchema.safeParse({ ...valid, price: 1000.5 }).success).toBe(false);
  });

  it("defaults cost to zero so profit reporting never sees undefined", () => {
    const parsed = ProductSchema.parse(valid);
    expect(parsed.costPrice).toBe(0);
  });
});

describe("RestaurantSettingsSchema", () => {
  it("accepts a partial update — PATCH must not require every field", () => {
    // Regression guard: requiring the booleans made a single toggle fail.
    expect(RestaurantSettingsSchema.safeParse({ showPrices: true }).success).toBe(true);
    expect(RestaurantSettingsSchema.safeParse({}).success).toBe(true);
  });

  it("still validates the fields that are present", () => {
    expect(RestaurantSettingsSchema.safeParse({ name: "x" }).success).toBe(false);
  });
});

describe("DesignSchema photo toggle", () => {
  const valid = { templateId: "qalam", theme: {} };

  it("accepts a design payload that says nothing about photos", () => {
    // The field is optional precisely so a caller that only changes the
    // template cannot switch a venue's photos off by leaving it out.
    const result = DesignSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.showProductPhotos).toBeUndefined();
  });

  it("carries an explicit choice through in both directions", () => {
    expect(
      DesignSchema.parse({ ...valid, showProductPhotos: false }).showProductPhotos,
    ).toBe(false);
    expect(
      DesignSchema.parse({ ...valid, showProductPhotos: true }).showProductPhotos,
    ).toBe(true);
  });

  it("rejects a non-boolean rather than coercing it", () => {
    // "false" and 0 are the shapes a hand-built request most often sends, and
    // both would coerce to the wrong value if this were left loose.
    for (const bad of ["false", 0, null]) {
      expect(
        DesignSchema.safeParse({ ...valid, showProductPhotos: bad }).success,
        String(bad),
      ).toBe(false);
    }
  });
});

describe("TableSchema", () => {
  it("requires a table number and a sane seat count", () => {
    expect(TableSchema.safeParse({ number: "12", seats: 4 }).success).toBe(true);
    expect(TableSchema.safeParse({ number: "", seats: 4 }).success).toBe(false);
    expect(TableSchema.safeParse({ number: "12", seats: 0 }).success).toBe(false);
    expect(TableSchema.safeParse({ number: "12", seats: 51 }).success).toBe(false);
  });
});

describe("ScheduleWindowSchema", () => {
  const window = (patch: Record<string, unknown> = {}) => ({
    dayOfWeek: 6,
    start: "18:00",
    end: "23:00",
    ...patch,
  });

  it("converts wall-clock times to minutes from midnight", () => {
    const parsed = ScheduleWindowSchema.parse(window());
    expect(parsed).toEqual({ dayOfWeek: 6, start: 1080, end: 1380 });
  });

  /**
   * A time input cannot produce 24:00, so an owner closing at midnight picks
   * 00:00. Stored as 1440 it stays a same-day window; stored as 0 it would be
   * a zero-length one the column refuses.
   */
  it("reads midnight as the end of the day rather than the start of it", () => {
    expect(ScheduleWindowSchema.parse(window({ end: "00:00" })).end).toBe(1440);
    expect(ScheduleWindowSchema.parse(window({ end: "24:00" })).end).toBe(1440);
  });

  it("keeps an overnight window, which is how late service is expressed", () => {
    const parsed = ScheduleWindowSchema.parse(window({ start: "18:00", end: "02:00" }));
    expect(parsed.end).toBeLessThan(parsed.start);
  });

  it("rejects a zero-length window", () => {
    expect(
      ScheduleWindowSchema.safeParse(window({ start: "12:00", end: "12:00" })).success,
    ).toBe(false);
  });

  it("rejects 24:00 as a start time", () => {
    expect(ScheduleWindowSchema.safeParse(window({ start: "24:00" })).success).toBe(
      false,
    );
  });

  it("rejects malformed times", () => {
    for (const bad of ["", "abc", "25:00", "12:60", "12", "noon"]) {
      expect(ScheduleWindowSchema.safeParse(window({ start: bad })).success, bad).toBe(
        false,
      );
    }
  });

  it("rejects a weekday outside 0–6", () => {
    for (const day of [-1, 7, 99]) {
      expect(ScheduleWindowSchema.safeParse(window({ dayOfWeek: day })).success).toBe(
        false,
      );
    }
  });

  it("reports Persian messages rather than raw Zod English", () => {
    const result = ScheduleWindowSchema.safeParse(window({ start: "nope" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/[؀-ۿ]/);
    }
  });
});

describe("ProductSchema scheduling", () => {
  const base = {
    categoryId: "c-1",
    name: "پیتزا",
    price: 100_000,
  };

  /** The default that keeps every product predating this feature unchanged. */
  it("defaults to scheduling on with no windows, which constrains nothing", () => {
    const parsed = ProductSchema.parse(base);
    expect(parsed.scheduleEnabled).toBe(true);
    expect(parsed.schedule).toBeUndefined();
  });

  /**
   * Absent and empty mean different things on a PATCH: absent leaves the stored
   * hours alone, empty clears them. Anything that collapsed the two would let a
   * price edit silently wipe a venue's schedule.
   */
  it("distinguishes an absent schedule from an empty one", () => {
    expect(ProductSchema.parse(base).schedule).toBeUndefined();
    expect(ProductSchema.parse({ ...base, schedule: [] }).schedule).toEqual([]);
  });

  it("accepts several windows across several days", () => {
    const parsed = ProductSchema.parse({
      ...base,
      schedule: [
        { dayOfWeek: 6, start: "07:00", end: "11:00" },
        { dayOfWeek: 6, start: "16:00", end: "18:00" },
        { dayOfWeek: 0, start: "07:00", end: "11:00" },
      ],
    });

    expect(parsed.schedule).toHaveLength(3);
  });

  it("rejects a product whose schedule contains an invalid window", () => {
    const result = ProductSchema.safeParse({
      ...base,
      schedule: [{ dayOfWeek: 6, start: "12:00", end: "12:00" }],
    });

    expect(result.success).toBe(false);
  });

  it("bounds how many windows one request may write", () => {
    const tooMany = Array.from({ length: MAX_SCHEDULE_WINDOWS + 1 }, () => ({
      dayOfWeek: 6,
      start: "09:00",
      end: "17:00",
    }));

    expect(ProductSchema.safeParse({ ...base, schedule: tooMany }).success).toBe(false);
  });
});

describe("RecommendationListSchema", () => {
  const row = (id: string, isActive = true) => ({
    recommendedProductId: id,
    isActive,
  });

  it("accepts a list of distinct products", () => {
    const result = RecommendationListSchema.safeParse([row("p-fries"), row("p-drink")]);
    expect(result.success).toBe(true);
  });

  it("accepts an empty list — that is how an owner clears suggestions", () => {
    expect(RecommendationListSchema.safeParse([]).success).toBe(true);
  });

  it("defaults a suggestion to active", () => {
    const result = RecommendationListSchema.safeParse([
      { recommendedProductId: "p-fries" },
    ]);
    expect(result.success && result.data[0]!.isActive).toBe(true);
  });

  it("keeps a suggestion the owner switched off", () => {
    const result = RecommendationListSchema.safeParse([row("p-fries", false)]);
    expect(result.success && result.data[0]!.isActive).toBe(false);
  });

  /** Backed by a unique index; this is the message, not the guarantee. */
  it("rejects the same product twice", () => {
    expect(
      RecommendationListSchema.safeParse([row("p-fries"), row("p-fries")]).success,
    ).toBe(false);
  });

  it("rejects a blank product id", () => {
    expect(RecommendationListSchema.safeParse([row("")]).success).toBe(false);
  });

  it("rejects more than the per-product cap", () => {
    const tooMany = Array.from({ length: MAX_RECOMMENDATIONS_PER_PRODUCT + 1 }, (_, i) =>
      row(`p-${i}`),
    );
    expect(RecommendationListSchema.safeParse(tooMany).success).toBe(false);
  });

  it("accepts exactly the cap", () => {
    const atCap = Array.from({ length: MAX_RECOMMENDATIONS_PER_PRODUCT }, (_, i) =>
      row(`p-${i}`),
    );
    expect(RecommendationListSchema.safeParse(atCap).success).toBe(true);
  });
});

describe("ProductSchema — recommendations", () => {
  const base = {
    categoryId: "c-1",
    name: "برگر",
    price: 100_000,
  };

  /**
   * Absent and empty mean different things, exactly as they do for `schedule`:
   * a caller changing only a price must not wipe a venue's suggestions by
   * omitting a field it never knew about.
   */
  it("distinguishes an absent list from an empty one", () => {
    const absent = ProductSchema.safeParse(base);
    expect(absent.success && absent.data.recommendations).toBeUndefined();

    const cleared = ProductSchema.safeParse({ ...base, recommendations: [] });
    expect(cleared.success && cleared.data.recommendations).toEqual([]);
  });

  it("rejects a duplicate suggestion on the product payload", () => {
    expect(
      ProductSchema.safeParse({
        ...base,
        recommendations: [
          { recommendedProductId: "p-fries" },
          { recommendedProductId: "p-fries" },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("ProductSchema — featured fields", () => {
  const base = { categoryId: "c-1", name: "برگر", price: 100_000 };

  it("accepts a product with no merchandising at all", () => {
    const result = ProductSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.featuredLabel).toBeUndefined();
      expect(result.data.featuredFrom).toBeUndefined();
    }
  });

  it("accepts a built-in badge", () => {
    const result = ProductSchema.safeParse({ ...base, featuredLabel: "chefsChoice" });
    expect(result.success && result.data.featuredLabel).toBe("chefsChoice");
  });

  it("rejects a badge that is not in the catalogue", () => {
    expect(
      ProductSchema.safeParse({ ...base, featuredLabel: "buyNowOrElse" }).success,
    ).toBe(false);
  });

  it("treats an empty badge as no badge", () => {
    const result = ProductSchema.safeParse({ ...base, featuredLabel: "" });
    expect(result.success && result.data.featuredLabel).toBeNull();
  });

  it("bounds the custom badge text", () => {
    expect(
      ProductSchema.safeParse({ ...base, featuredLabelText: "x".repeat(21) }).success,
    ).toBe(false);
    expect(
      ProductSchema.safeParse({ ...base, featuredLabelText: "x".repeat(20) }).success,
    ).toBe(true);
  });

  /**
   * Wall-clock text read in the venue's zone, not the browser's — the same rule
   * the serving hours follow.
   */
  it("reads a promotion boundary as a venue-local wall clock", () => {
    const result = ProductSchema.safeParse({
      ...base,
      featuredFrom: "2026-09-08T12:00",
    });

    expect(result.success).toBe(true);
    // 12:00 in Tehran is 08:30 UTC.
    if (result.success) {
      expect(result.data.featuredFrom?.toISOString()).toBe("2026-09-08T08:30:00.000Z");
    }
  });

  it("treats an empty boundary as no boundary", () => {
    const result = ProductSchema.safeParse({ ...base, featuredFrom: "" });
    expect(result.success && result.data.featuredFrom).toBeNull();
  });

  it("rejects a malformed boundary", () => {
    for (const bad of [
      "not-a-date",
      "2026-13-01T00:00",
      "2026-02-31T00:00",
      "2026-09-08",
    ]) {
      expect(ProductSchema.safeParse({ ...base, featuredFrom: bad }).success, bad).toBe(
        false,
      );
    }
  });

  /** A window that ends before it starts can never open. */
  it("rejects an inverted window", () => {
    expect(
      ProductSchema.safeParse({
        ...base,
        featuredFrom: "2026-09-10T12:00",
        featuredUntil: "2026-09-08T12:00",
      }).success,
    ).toBe(false);
  });

  it("accepts an ordered window", () => {
    expect(
      ProductSchema.safeParse({
        ...base,
        featuredFrom: "2026-09-08T12:00",
        featuredUntil: "2026-09-10T12:00",
      }).success,
    ).toBe(true);
  });

  it("applies the same window rule to the patch form", () => {
    expect(
      ProductPatchSchema.safeParse({
        featuredFrom: "2026-09-10T12:00",
        featuredUntil: "2026-09-08T12:00",
      }).success,
    ).toBe(false);

    // …and still allows a partial update that mentions nothing else.
    expect(ProductPatchSchema.safeParse({ isFeatured: true }).success).toBe(true);
  });
});

/**
 * A regression guard for a bug that silently destroyed data.
 *
 * `.partial()` does not suppress `.default()` in Zod 4, so the update schema
 * used to invent values for every defaulted field the caller never mentioned.
 * The product route writes exactly what it is given and replaces collections
 * wholesale, so a request that only toggled availability also reset the cost
 * price, un-featured the dish, and deleted every info section and option group
 * it had.
 */
describe("ProductPatchSchema — absent means absent", () => {
  it("invents nothing for fields the caller did not mention", () => {
    const parsed = ProductPatchSchema.parse({ isAvailable: false });

    expect(parsed.isAvailable).toBe(false);
    // Everything below would previously have arrived with a default.
    expect(parsed.isFeatured).toBeUndefined();
    expect(parsed.costPrice).toBeUndefined();
    expect(parsed.hideWhenUnavailable).toBeUndefined();
    expect(parsed.scheduleEnabled).toBeUndefined();
    expect(parsed.infoSections).toBeUndefined();
    expect(parsed.optionGroups).toBeUndefined();
  });

  it("produces an empty object for an empty patch", () => {
    expect(Object.keys(ProductPatchSchema.parse({}))).toHaveLength(0);
  });

  it("still carries through what the caller did send", () => {
    const parsed = ProductPatchSchema.parse({
      isFeatured: true,
      costPrice: 12_000,
      infoSections: [],
    });

    expect(parsed.isFeatured).toBe(true);
    expect(parsed.costPrice).toBe(12_000);
    // An explicit empty array is still a real instruction to clear them.
    expect(parsed.infoSections).toEqual([]);
  });

  it("still validates the fields that are present", () => {
    expect(ProductPatchSchema.safeParse({ costPrice: -1 }).success).toBe(false);
    expect(ProductPatchSchema.safeParse({ name: "" }).success).toBe(false);
  });

  /** Creation genuinely wants defaults; only the update form must not. */
  it("leaves the create schema's defaults intact", () => {
    const created = ProductSchema.parse({
      categoryId: "c-1",
      name: "برگر",
      price: 100_000,
    });

    expect(created.costPrice).toBe(0);
    expect(created.isAvailable).toBe(true);
    expect(created.isFeatured).toBe(false);
    expect(created.infoSections).toEqual([]);
    expect(created.optionGroups).toEqual([]);
  });
});

describe("CampaignSchema", () => {
  const minimal = { name: "بازگرداندن مشتری‌ها", targetSegment: "atRisk" };

  it("accepts a campaign with just a name and an audience", () => {
    const parsed = CampaignSchema.parse(minimal);

    expect(parsed.name).toBe("بازگرداندن مشتری‌ها");
    expect(parsed.targetSegment).toBe("atRisk");
  });

  it("requires a name", () => {
    expect(CampaignSchema.safeParse({ ...minimal, name: "" }).success).toBe(false);
    expect(CampaignSchema.safeParse({ ...minimal, name: "   " }).success).toBe(false);
  });

  it("bounds the name", () => {
    expect(CampaignSchema.safeParse({ ...minimal, name: "x".repeat(81) }).success).toBe(
      false,
    );
  });

  /** The audience catalogue is the customer book's, not a second list. */
  it("accepts every known customer segment and nothing else", () => {
    for (const segment of CUSTOMER_SEGMENTS) {
      expect(
        CampaignSchema.safeParse({ ...minimal, targetSegment: segment }).success,
        segment,
      ).toBe(true);
    }

    expect(CampaignSchema.safeParse({ ...minimal, targetSegment: "vip" }).success).toBe(
      false,
    );
    expect(CampaignSchema.safeParse({ name: "x" }).success).toBe(false);
  });

  /** An empty select is "no context", not an id of empty string. */
  it("reads a cleared product or category as none", () => {
    const parsed = CampaignSchema.parse({ ...minimal, productId: "", categoryId: "" });

    expect(parsed.productId).toBeNull();
    expect(parsed.categoryId).toBeNull();
  });

  it("keeps a chosen product and category", () => {
    const parsed = CampaignSchema.parse({
      ...minimal,
      productId: "p-1",
      categoryId: "c-1",
    });

    expect(parsed.productId).toBe("p-1");
    expect(parsed.categoryId).toBe("c-1");
  });

  it("refuses a window that ends before it starts", () => {
    const result = CampaignSchema.safeParse({
      ...minimal,
      startsAt: "2026-10-10T18:00",
      endsAt: "2026-10-01T18:00",
    });

    expect(result.success).toBe(false);
  });

  it("accepts an ordered window", () => {
    expect(
      CampaignSchema.safeParse({
        ...minimal,
        startsAt: "2026-10-01T18:00",
        endsAt: "2026-10-10T18:00",
      }).success,
    ).toBe(true);
  });

  /**
   * The boundary is read in the venue's zone, not the browser's — the same
   * rule promotion windows and opening hours already follow.
   */
  it("reads a boundary as the venue's wall clock", () => {
    const parsed = CampaignSchema.parse({ ...minimal, startsAt: "2026-10-01T20:00" });

    expect(parsed.startsAt).toEqual(instantFromZonedWallClock("2026-10-01T20:00"));
  });

  it("rejects a malformed boundary rather than coercing it", () => {
    expect(CampaignSchema.safeParse({ ...minimal, startsAt: "not-a-date" }).success).toBe(
      false,
    );
    expect(
      CampaignSchema.safeParse({ ...minimal, startsAt: "2026-02-31T10:00" }).success,
    ).toBe(false);
  });

  it("reads a cleared boundary as open-ended", () => {
    const parsed = CampaignSchema.parse({ ...minimal, startsAt: "", endsAt: "" });

    expect(parsed.startsAt).toBeNull();
    expect(parsed.endsAt).toBeNull();
  });
});

describe("CampaignStatusSchema", () => {
  it("accepts every real status", () => {
    for (const status of CAMPAIGN_STATUSES) {
      expect(CampaignStatusSchema.safeParse({ status }).success, status).toBe(true);
    }
  });

  it("refuses a status that does not exist", () => {
    expect(CampaignStatusSchema.safeParse({ status: "SENDING" }).success).toBe(false);
    expect(CampaignStatusSchema.safeParse({ status: "DELIVERED" }).success).toBe(false);
    expect(CampaignStatusSchema.safeParse({}).success).toBe(false);
  });

  /** The state moved *from* is never taken from the client. */
  it("has no field for the current status", () => {
    const parsed = CampaignStatusSchema.parse({ status: "ACTIVE", from: "DRAFT" });
    expect(parsed).toEqual({ status: "ACTIVE" });
  });
});

describe("CampaignQuerySchema", () => {
  it("caps the page size", () => {
    expect(
      CampaignQuerySchema.safeParse({ pageSize: String(MAX_CAMPAIGN_PAGE_SIZE + 1) })
        .success,
    ).toBe(false);
  });

  it("coerces paging from the query string", () => {
    expect(CampaignQuerySchema.parse({ page: "2", pageSize: "10" })).toEqual({
      page: 2,
      pageSize: 10,
    });
  });

  it("refuses an unknown status filter", () => {
    expect(CampaignQuerySchema.safeParse({ status: "SENDING" }).success).toBe(false);
  });
});

describe("AudienceQuerySchema", () => {
  it("requires a segment to estimate against", () => {
    expect(AudienceQuerySchema.safeParse({}).success).toBe(false);
    expect(AudienceQuerySchema.safeParse({ segment: "loyal" }).success).toBe(true);
  });

  it("refuses a segment that does not exist", () => {
    expect(AudienceQuerySchema.safeParse({ segment: "whales" }).success).toBe(false);
  });
});
