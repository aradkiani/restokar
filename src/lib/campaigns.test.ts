import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TRANSITIONS,
  COMMUNICATION_CHANNELS,
  MEASURABLE_METRICS,
  UNMEASURABLE_METRICS,
  canTransition,
  capturesAudience,
  isCampaignStatus,
  isChannelAvailable,
  isEditable,
  isMetricMeasurable,
  isTerminal,
  recipientEligibility,
  scheduleIssue,
  summariseAudience,
} from "./campaigns";
import { LOYAL_ORDER_THRESHOLD } from "./customers";
import { instantFromZonedWallClock } from "./time";

const NOW = new Date("2026-09-09T12:00:00Z");
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("campaign statuses", () => {
  it("recognises exactly the catalogue", () => {
    for (const status of CAMPAIGN_STATUSES) expect(isCampaignStatus(status)).toBe(true);
    expect(isCampaignStatus("SENDING")).toBe(false);
    expect(isCampaignStatus("")).toBe(false);
  });

  it("gives every status a transition list", () => {
    for (const status of CAMPAIGN_STATUSES) {
      expect(CAMPAIGN_TRANSITIONS[status], status).toBeDefined();
    }
  });

  it("never lets a status transition to itself", () => {
    for (const status of CAMPAIGN_STATUSES) {
      expect(canTransition(status, status), status).toBe(false);
    }
  });

  it("only ever names known statuses as targets", () => {
    for (const status of CAMPAIGN_STATUSES) {
      for (const target of CAMPAIGN_TRANSITIONS[status]) {
        expect(CAMPAIGN_STATUSES, `${status} -> ${target}`).toContain(target);
      }
    }
  });
});

describe("canTransition", () => {
  it("lets a draft be scheduled, started, or abandoned", () => {
    expect(canTransition("DRAFT", "SCHEDULED")).toBe(true);
    expect(canTransition("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransition("DRAFT", "CANCELED")).toBe(true);
  });

  it("refuses to finish or pause a campaign that never ran", () => {
    expect(canTransition("DRAFT", "COMPLETED")).toBe(false);
    expect(canTransition("DRAFT", "PAUSED")).toBe(false);
  });

  it("lets a scheduled campaign start, pause, or go back to the drawer", () => {
    expect(canTransition("SCHEDULED", "ACTIVE")).toBe(true);
    expect(canTransition("SCHEDULED", "PAUSED")).toBe(true);
    expect(canTransition("SCHEDULED", "DRAFT")).toBe(true);
    expect(canTransition("SCHEDULED", "CANCELED")).toBe(true);
  });

  it("refuses to complete a campaign that has not started", () => {
    expect(canTransition("SCHEDULED", "COMPLETED")).toBe(false);
  });

  it("lets an active campaign pause, finish, or stop", () => {
    expect(canTransition("ACTIVE", "PAUSED")).toBe(true);
    expect(canTransition("ACTIVE", "COMPLETED")).toBe(true);
    expect(canTransition("ACTIVE", "CANCELED")).toBe(true);
  });

  /** Editing is what DRAFT is for; a running campaign is not re-openable. */
  it("refuses to send a running campaign back to draft or schedule", () => {
    expect(canTransition("ACTIVE", "DRAFT")).toBe(false);
    expect(canTransition("ACTIVE", "SCHEDULED")).toBe(false);
  });

  it("lets a paused campaign resume, finish, or stop", () => {
    expect(canTransition("PAUSED", "ACTIVE")).toBe(true);
    expect(canTransition("PAUSED", "COMPLETED")).toBe(true);
    expect(canTransition("PAUSED", "CANCELED")).toBe(true);
  });

  it("refuses to reopen a paused campaign for editing", () => {
    expect(canTransition("PAUSED", "DRAFT")).toBe(false);
  });

  it("allows nothing at all out of a terminal state", () => {
    for (const target of CAMPAIGN_STATUSES) {
      expect(canTransition("COMPLETED", target), `COMPLETED -> ${target}`).toBe(false);
      expect(canTransition("CANCELED", target), `CANCELED -> ${target}`).toBe(false);
    }
  });
});

describe("isTerminal", () => {
  it("names exactly the states nothing leaves", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("CANCELED")).toBe(true);
    expect(isTerminal("DRAFT")).toBe(false);
    expect(isTerminal("SCHEDULED")).toBe(false);
    expect(isTerminal("ACTIVE")).toBe(false);
    expect(isTerminal("PAUSED")).toBe(false);
  });

  it("agrees with the transition table", () => {
    for (const status of CAMPAIGN_STATUSES) {
      expect(CAMPAIGN_TRANSITIONS[status].length === 0, status).toBe(isTerminal(status));
    }
  });
});

describe("isEditable", () => {
  /**
   * Configuration may change while a campaign is still a plan. Once it is
   * running, what it was set up to do is a matter of record.
   */
  it("allows editing only before a campaign runs", () => {
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("SCHEDULED")).toBe(true);
    expect(isEditable("ACTIVE")).toBe(false);
    expect(isEditable("PAUSED")).toBe(false);
    expect(isEditable("COMPLETED")).toBe(false);
    expect(isEditable("CANCELED")).toBe(false);
  });
});

describe("capturesAudience", () => {
  /** The size is recorded when the plan is committed to, not while drafting. */
  it("captures when a campaign is committed to", () => {
    expect(capturesAudience("SCHEDULED")).toBe(true);
    expect(capturesAudience("ACTIVE")).toBe(true);
  });

  it("does not capture for drafts or endings", () => {
    expect(capturesAudience("DRAFT")).toBe(false);
    expect(capturesAudience("PAUSED")).toBe(false);
    expect(capturesAudience("COMPLETED")).toBe(false);
    expect(capturesAudience("CANCELED")).toBe(false);
  });
});

describe("scheduleIssue", () => {
  it("accepts a draft with no dates at all", () => {
    expect(scheduleIssue("DRAFT", {}, NOW)).toBeNull();
    expect(scheduleIssue("DRAFT", { startsAt: null, endsAt: null }, NOW)).toBeNull();
  });

  it("accepts an ordered future window", () => {
    expect(
      scheduleIssue(
        "SCHEDULED",
        { startsAt: daysFromNow(1), endsAt: daysFromNow(8) },
        NOW,
      ),
    ).toBeNull();
  });

  it("refuses a window that ends before it starts", () => {
    expect(
      scheduleIssue(
        "SCHEDULED",
        { startsAt: daysFromNow(8), endsAt: daysFromNow(1) },
        NOW,
      ),
    ).toBe("END_BEFORE_START");
  });

  /** A zero-length window can never be open. */
  it("refuses a window that ends exactly when it starts", () => {
    const at = daysFromNow(3);
    expect(scheduleIssue("SCHEDULED", { startsAt: at, endsAt: at }, NOW)).toBe(
      "END_BEFORE_START",
    );
  });

  it("refuses an impossible window even on a draft", () => {
    expect(
      scheduleIssue("DRAFT", { startsAt: daysFromNow(8), endsAt: daysFromNow(1) }, NOW),
    ).toBe("END_BEFORE_START");
  });

  it("requires a start date to schedule", () => {
    expect(scheduleIssue("SCHEDULED", { endsAt: daysFromNow(5) }, NOW)).toBe(
      "MISSING_START",
    );
  });

  it("does not require a start date to activate immediately", () => {
    expect(scheduleIssue("ACTIVE", {}, NOW)).toBeNull();
  });

  /** A window that already closed describes a campaign that can never run. */
  it("refuses to schedule a window that has already closed", () => {
    expect(
      scheduleIssue(
        "SCHEDULED",
        { startsAt: daysFromNow(-9), endsAt: daysFromNow(-2) },
        NOW,
      ),
    ).toBe("ENDS_IN_PAST");
  });

  it("refuses to activate a window that has already closed", () => {
    expect(scheduleIssue("ACTIVE", { endsAt: daysFromNow(-2) }, NOW)).toBe(
      "ENDS_IN_PAST",
    );
  });

  /**
   * A start already past is fine — an owner backdating the beginning of a run
   * is describing something that is already true, not something impossible.
   */
  it("accepts a start in the past when the window is still open", () => {
    expect(
      scheduleIssue(
        "SCHEDULED",
        { startsAt: daysFromNow(-2), endsAt: daysFromNow(5) },
        NOW,
      ),
    ).toBeNull();
  });

  it("does not police dates on a campaign being cancelled", () => {
    expect(scheduleIssue("CANCELED", { endsAt: daysFromNow(-30) }, NOW)).toBeNull();
  });

  /**
   * Boundaries arrive as venue wall-clock text, the same as promotion windows.
   * Ordering has to survive that conversion, not just raw instants.
   */
  it("orders boundaries built from venue wall-clock text", () => {
    const start = instantFromZonedWallClock("2026-10-01T20:00")!;
    const end = instantFromZonedWallClock("2026-10-01T23:00")!;

    expect(scheduleIssue("SCHEDULED", { startsAt: start, endsAt: end }, NOW)).toBeNull();
    expect(scheduleIssue("SCHEDULED", { startsAt: end, endsAt: start }, NOW)).toBe(
      "END_BEFORE_START",
    );
  });
});

describe("communication channels", () => {
  it("names the channels a future gateway might use", () => {
    expect(COMMUNICATION_CHANNELS).toContain("sms");
    expect(COMMUNICATION_CHANNELS).toContain("email");
    expect(COMMUNICATION_CHANNELS).toContain("push");
  });

  /** There is no provider. Nothing is deliverable through any channel. */
  it("reports every channel as unavailable", () => {
    for (const channel of COMMUNICATION_CHANNELS) {
      expect(isChannelAvailable(channel), channel).toBe(false);
    }
  });
});

describe("recipientEligibility", () => {
  const reachable = { phone: "09121234567", marketingConsent: true };

  it("reports a missing contact method first", () => {
    expect(recipientEligibility({ phone: null, marketingConsent: true }, "sms")).toBe(
      "NO_CONTACT_METHOD",
    );
  });

  it("reports withheld consent", () => {
    expect(
      recipientEligibility({ phone: "09121234567", marketingConsent: false }, "sms"),
    ).toBe("NO_CONSENT");
  });

  /**
   * Consent and a number are not enough while nothing can carry a message.
   * ELIGIBLE is deliberately unreachable today — that is the safety property.
   */
  it("stops at the unavailable channel even for a reachable guest", () => {
    for (const channel of COMMUNICATION_CHANNELS) {
      expect(recipientEligibility(reachable, channel), channel).toBe(
        "CHANNEL_UNAVAILABLE",
      );
    }
  });

  it("never reports anyone as eligible while no channel exists", () => {
    for (const channel of COMMUNICATION_CHANNELS) {
      expect(recipientEligibility(reachable, channel)).not.toBe("ELIGIBLE");
    }
  });
});

describe("campaign metrics", () => {
  it("measures only what orders and consent can actually answer", () => {
    expect(MEASURABLE_METRICS).toContain("estimatedAudience");
    expect(MEASURABLE_METRICS).toContain("eligibleAudience");
    expect(MEASURABLE_METRICS).toContain("audienceSnapshotSize");
  });

  it("refuses to claim delivery or engagement figures", () => {
    for (const metric of [
      "sent",
      "delivered",
      "interactions",
      "conversions",
      "attributedOrders",
      "attributedRevenue",
    ] as const) {
      expect(UNMEASURABLE_METRICS, metric).toContain(metric);
      expect(isMetricMeasurable(metric), metric).toBe(false);
    }
  });

  it("keeps the two lists disjoint", () => {
    for (const metric of MEASURABLE_METRICS) {
      expect(UNMEASURABLE_METRICS as readonly string[], metric).not.toContain(metric);
      expect(isMetricMeasurable(metric), metric).toBe(true);
    }
  });
});

describe("summariseAudience", () => {
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

  /** A regular seen this week: five counted orders, none of them stale. */
  const loyal = {
    phone: "09121111111",
    marketingConsent: true,
    orderCount: LOYAL_ORDER_THRESHOLD,
    lastOrderAt: daysAgo(3),
  };

  const loyalNoConsent = { ...loyal, phone: "09122222222", marketingConsent: false };
  const loyalNoPhone = { ...loyal, phone: null };
  const firstTimer = {
    phone: "09124444444",
    marketingConsent: true,
    orderCount: 1,
    lastOrderAt: daysAgo(3),
  };

  it("counts nobody when there are no customers", () => {
    expect(summariseAudience([], "loyal", NOW)).toEqual({
      estimatedAudience: 0,
      eligibleAudience: 0,
    });
  });

  it("counts only customers in the target segment", () => {
    const result = summariseAudience([loyal, firstTimer], "loyal", NOW);
    expect(result.estimatedAudience).toBe(1);
  });

  it("counts the same customer under the segment they actually fall in", () => {
    expect(summariseAudience([loyal, firstTimer], "new", NOW).estimatedAudience).toBe(1);
  });

  /**
   * Reuses `resolveSegment`, so recency outranks volume here exactly as it does
   * on the customer book — an absent regular is not a loyal audience member.
   */
  it("defers to the shared segment rules rather than order count alone", () => {
    const absent = { ...loyal, orderCount: 40, lastOrderAt: daysAgo(200) };

    expect(summariseAudience([absent], "loyal", NOW).estimatedAudience).toBe(0);
    expect(summariseAudience([absent], "inactive", NOW).estimatedAudience).toBe(1);
  });

  it("requires both a number and consent to be eligible", () => {
    const result = summariseAudience([loyal, loyalNoConsent, loyalNoPhone], "loyal", NOW);

    expect(result.estimatedAudience).toBe(3);
    expect(result.eligibleAudience).toBe(1);
  });

  it("never reports more eligible than targeted", () => {
    for (const segment of ["new", "returning", "loyal", "atRisk", "inactive"] as const) {
      const result = summariseAudience(
        [loyal, loyalNoConsent, loyalNoPhone, firstTimer],
        segment,
        NOW,
      );
      expect(result.eligibleAudience, segment).toBeLessThanOrEqual(
        result.estimatedAudience,
      );
    }
  });
});

/**
 * The hard safety property of this phase: campaign code cannot send anything.
 *
 * Asserted against the source text rather than by mocking a client, because the
 * risk is not that a call fails — it is that a call exists at all.
 */
describe("communication safety", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const sources = [
    `${here}campaigns.ts`,
    `${here}campaigns-server.ts`,
    `${here}../app/api/campaigns/route.ts`,
    `${here}../app/api/campaigns/errors.ts`,
    `${here}../app/api/campaigns/audience/route.ts`,
    `${here}../app/api/campaigns/[id]/route.ts`,
    `${here}../app/api/campaigns/[id]/status/route.ts`,
  ];

  const FORBIDDEN = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bnodemailer\b/,
    /\bkavenegar\b/i,
    /\bmelipayamak\b/i,
    /\btwilio\b/i,
    /https?:\/\/(?!\s)/,
    /\bnode:https?\b/,
    /\bsendMessage\b/,
    /\bsendSms\b/i,
  ];

  it("makes no outbound call from any campaign module", () => {
    for (const file of sources) {
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(source), `${file} matched ${pattern}`).toBe(false);
      }
    }
  });
});
