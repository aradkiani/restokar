import { describe, expect, it } from "vitest";
import {
  FEATURED_LABELS,
  MAX_FEATURED_SHOWN,
  isFeaturedLabel,
  isFeaturedNow,
  resolveFeaturedLabel,
  sortFeatured,
  withinFeaturedWindow,
} from "./featured";

const T = (iso: string) => new Date(iso);

/** Mid-window instant used throughout, so each test states only what it varies. */
const NOW = T("2026-09-08T12:00:00Z");

const unscheduled = { isFeatured: true, featuredFrom: null, featuredUntil: null };

describe("withinFeaturedWindow", () => {
  it("is open when neither end is set", () => {
    expect(withinFeaturedWindow(unscheduled, NOW)).toBe(true);
  });

  it("is open inside a bounded window", () => {
    expect(
      withinFeaturedWindow(
        {
          ...unscheduled,
          featuredFrom: T("2026-09-01T00:00:00Z"),
          featuredUntil: T("2026-09-30T00:00:00Z"),
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("is closed before it starts", () => {
    expect(
      withinFeaturedWindow(
        { ...unscheduled, featuredFrom: T("2026-09-09T00:00:00Z") },
        NOW,
      ),
    ).toBe(false);
  });

  it("is closed after it ends", () => {
    expect(
      withinFeaturedWindow(
        { ...unscheduled, featuredUntil: T("2026-09-07T00:00:00Z") },
        NOW,
      ),
    ).toBe(false);
  });

  /** Half-open, matching how the weekly opening-hours windows treat theirs. */
  it("includes the start instant and excludes the end instant", () => {
    expect(withinFeaturedWindow({ ...unscheduled, featuredFrom: NOW }, NOW)).toBe(true);
    expect(withinFeaturedWindow({ ...unscheduled, featuredUntil: NOW }, NOW)).toBe(false);
  });

  it("supports an open-ended start", () => {
    const config = { ...unscheduled, featuredUntil: T("2026-09-30T00:00:00Z") };
    expect(withinFeaturedWindow(config, T("2020-01-01T00:00:00Z"))).toBe(true);
    expect(withinFeaturedWindow(config, T("2026-10-01T00:00:00Z"))).toBe(false);
  });

  it("supports an open-ended finish", () => {
    const config = { ...unscheduled, featuredFrom: T("2026-09-01T00:00:00Z") };
    expect(withinFeaturedWindow(config, T("2030-01-01T00:00:00Z"))).toBe(true);
    expect(withinFeaturedWindow(config, T("2026-08-01T00:00:00Z"))).toBe(false);
  });
});

describe("isFeaturedNow", () => {
  it("promotes an available dish with no window", () => {
    expect(isFeaturedNow({ ...unscheduled, isAvailable: true }, NOW)).toBe(true);
  });

  it("does not promote a dish the owner never featured", () => {
    expect(
      isFeaturedNow({ ...unscheduled, isFeatured: false, isAvailable: true }, NOW),
    ).toBe(false);
  });

  /**
   * The rule the whole feature turns on: merchandising must never advertise
   * something a guest cannot buy. `isAvailable` is the effective answer from
   * the availability module — sold out, outside serving hours, or in a closed
   * category all arrive here as `false`.
   */
  it("never promotes a dish that cannot be ordered", () => {
    expect(isFeaturedNow({ ...unscheduled, isAvailable: false }, NOW)).toBe(false);
  });

  it("refuses an unavailable dish even inside an open window", () => {
    expect(
      isFeaturedNow(
        {
          isFeatured: true,
          featuredFrom: T("2026-09-01T00:00:00Z"),
          featuredUntil: T("2026-09-30T00:00:00Z"),
          isAvailable: false,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("refuses an available dish outside its window", () => {
    expect(
      isFeaturedNow(
        { ...unscheduled, featuredFrom: T("2026-09-09T00:00:00Z"), isAvailable: true },
        NOW,
      ),
    ).toBe(false);
  });

  it("promotes an available dish inside its window", () => {
    expect(
      isFeaturedNow(
        {
          isFeatured: true,
          featuredFrom: T("2026-09-08T11:00:00Z"),
          featuredUntil: T("2026-09-08T13:00:00Z"),
          isAvailable: true,
        },
        NOW,
      ),
    ).toBe(true);
  });
});

describe("resolveFeaturedLabel", () => {
  it("returns a key for a built-in badge", () => {
    expect(
      resolveFeaturedLabel({ featuredLabel: "chefsChoice", featuredLabelText: null }),
    ).toEqual({ kind: "key", value: "chefsChoice" });
  });

  it("returns the owner's text for a custom badge", () => {
    expect(
      resolveFeaturedLabel({ featuredLabel: "custom", featuredLabelText: "ویژه جمعه" }),
    ).toEqual({ kind: "text", value: "ویژه جمعه" });
  });

  it("returns nothing when no badge was chosen", () => {
    expect(
      resolveFeaturedLabel({ featuredLabel: null, featuredLabelText: "ignored" }),
    ).toBeNull();
  });

  /** An empty pill is worse than no pill. */
  it("returns nothing for a custom badge with no text", () => {
    expect(
      resolveFeaturedLabel({ featuredLabel: "custom", featuredLabelText: "   " }),
    ).toBeNull();
    expect(
      resolveFeaturedLabel({ featuredLabel: "custom", featuredLabelText: null }),
    ).toBeNull();
  });

  it("ignores a key that is not in the catalogue", () => {
    expect(
      resolveFeaturedLabel({ featuredLabel: "retiredLabel", featuredLabelText: null }),
    ).toBeNull();
  });

  it("recognises exactly the catalogue", () => {
    for (const key of FEATURED_LABELS) expect(isFeaturedLabel(key)).toBe(true);
    expect(isFeaturedLabel("somethingElse")).toBe(false);
  });
});

describe("sortFeatured", () => {
  const dish = (name: string, featuredOrder: number) => ({ name, featuredOrder });

  it("orders by the owner's arrangement", () => {
    expect(
      sortFeatured([dish("c", 2), dish("a", 0), dish("b", 1)]).map((d) => d.name),
    ).toEqual(["a", "b", "c"]);
  });

  /** Two dishes left at the default must not reshuffle between page loads. */
  it("is stable for dishes left at the default", () => {
    const dishes = [dish("چای", 0), dish("قهوه", 0), dish("آب", 0)];
    expect(sortFeatured(dishes)).toEqual(sortFeatured([...dishes].reverse()));
  });

  it("does not mutate its input", () => {
    const dishes = [dish("c", 2), dish("a", 0)];
    sortFeatured(dishes);
    expect(dishes.map((d) => d.name)).toEqual(["c", "a"]);
  });
});

describe("MAX_FEATURED_SHOWN", () => {
  it("bounds what a guest is shown", () => {
    expect(MAX_FEATURED_SHOWN).toBeGreaterThan(0);
    expect(MAX_FEATURED_SHOWN).toBeLessThanOrEqual(12);
  });
});
