import { describe, expect, it } from "vitest";
import type { AudienceCandidate } from "./campaigns";
import {
  isRealPayment,
  MAX_BROADCAST_PARTS,
  quoteBroadcast,
  recipientsFileContent,
  recipientsFileName,
  selectRecipients,
  SMS_BROADCAST_TRANSITIONS,
  staffCanMove,
} from "./sms-broadcast";

const NOW = new Date("2026-09-25T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

function guest(overrides: Partial<AudienceCandidate> = {}): AudienceCandidate {
  return {
    phone: "09121111111",
    marketingConsent: true,
    orderCount: 1,
    lastOrderAt: daysAgo(2),
    ...overrides,
  };
}

const quote = (text: string, recipientCount = 10, pricePerPart = 200) =>
  quoteBroadcast({ text, recipientCount, pricePerPart, optOutSuffix: "لغو11" });

describe("selectRecipients", () => {
  /** The rule the whole feature rests on: nobody is texted without consent. */
  it("excludes every guest who did not consent, however valuable", () => {
    const { phones } = selectRecipients(
      [
        guest({ phone: "09121111111", marketingConsent: true }),
        guest({ phone: "09122222222", marketingConsent: false, orderCount: 40 }),
      ],
      "all",
      NOW,
    );

    expect(phones).toEqual(["09121111111"]);
  });

  it("excludes a consenting guest with no number", () => {
    const { phones } = selectRecipients([guest({ phone: null })], "all", NOW);
    expect(phones).toEqual([]);
  });

  it("takes every consenting guest for the whole-venue audience", () => {
    const { phones } = selectRecipients(
      [
        guest({ phone: "09121111111", orderCount: 1, lastOrderAt: daysAgo(1) }),
        guest({ phone: "09122222222", orderCount: 30, lastOrderAt: daysAgo(400) }),
      ],
      "all",
      NOW,
    );

    expect(phones).toHaveLength(2);
  });

  /**
   * Segments come from `resolveSegment`, the customer book's own rule — so a
   * broadcast to "at risk" and the customer book's "at risk" are the same people.
   */
  it("narrows to one segment using the customer book's own rule", () => {
    const fresh = guest({ phone: "09121111111", orderCount: 1, lastOrderAt: daysAgo(1) });
    const lapsed = guest({
      phone: "09122222222",
      orderCount: 1,
      lastOrderAt: daysAgo(400),
    });

    const newOnes = selectRecipients([fresh, lapsed], "new", NOW).phones;
    const inactive = selectRecipients([fresh, lapsed], "inactive", NOW).phones;

    expect(newOnes).toEqual(["09121111111"]);
    expect(inactive).toEqual(["09122222222"]);
  });

  /** A landline is a real contact number that cannot receive a text. */
  it("never charges for a number that cannot receive an SMS", () => {
    const { phones, dropped } = selectRecipients(
      [guest({ phone: "02188776655" }), guest({ phone: "09121111111" })],
      "all",
      NOW,
    );

    expect(phones).toEqual(["09121111111"]);
    expect(dropped).toEqual([{ raw: "02188776655", reason: "INVALID" }]);
  });

  it("counts one person once whatever form their number was stored in", () => {
    const { phones } = selectRecipients(
      [guest({ phone: "09121111111" }), guest({ phone: "+989121111111" })],
      "all",
      NOW,
    );

    expect(phones).toEqual(["09121111111"]);
  });

  /**
   * The database returns customers in no promised order. A frozen list must be
   * the same file on every download, whatever order the rows arrived in.
   */
  it("returns the same sorted list whatever order the rows arrive in", () => {
    const rows = ["09123333333", "09121111111", "09122222222"].map((phone) =>
      guest({ phone }),
    );

    const forward = selectRecipients(rows, "all", NOW).phones;
    const backward = selectRecipients([...rows].reverse(), "all", NOW).phones;

    expect(forward).toEqual(["09121111111", "09122222222", "09123333333"]);
    expect(backward).toEqual(forward);
  });
});

describe("quoteBroadcast", () => {
  it("prices recipients × parts × rate", () => {
    const q = quote("تخفیف ویژه امروز", 10, 200);

    expect(q.parts).toBe(1);
    expect(q.amount).toBe(10 * 1 * 200);
    expect(q.issue).toBeNull();
  });

  it("appends the opt-out marker to what is sent", () => {
    expect(quote("تخفیف ویژه").body).toBe("تخفیف ویژه\nلغو11");
  });

  /**
   * The marker is part of every message that goes out, so a text just under a
   * part boundary becomes two parts once it is added. Pricing the bare text
   * would undercharge on exactly those messages.
   */
  it("prices the text with the marker, not without it", () => {
    const sixtySix = "ا".repeat(66);
    const q = quote(sixtySix, 1, 100);

    // 66 characters alone is one part; with "\nلغو11" it is 72, which is two.
    expect(q.characters).toBe(72);
    expect(q.parts).toBe(2);
    expect(q.amount).toBe(200);
  });

  it("refuses an empty text", () => {
    expect(quote("   ").issue).toBe("EMPTY");
  });

  it("refuses a link, which the operator rejects for everybody", () => {
    expect(quote("منوی جدید در restokar.ir").issue).toBe("CONTAINS_LINK");
  });

  it("refuses a message longer than the part ceiling", () => {
    const tooLong = "ا".repeat(67 * MAX_BROADCAST_PARTS + 1);
    expect(quote(tooLong).issue).toBe("TOO_LONG");
  });

  it("refuses an audience nobody can receive", () => {
    expect(quote("سلام", 0).issue).toBe("NO_RECIPIENTS");
    expect(quote("سلام", 0).amount).toBe(0);
  });

  /** What the owner can fix on this screen comes before facts about customers. */
  it("reports a text problem before an empty audience", () => {
    expect(quote("", 0).issue).toBe("EMPTY");
    expect(quote("ببینید restokar.ir", 0).issue).toBe("CONTAINS_LINK");
  });
});

describe("the lifecycle", () => {
  /**
   * PAID is the gateway's word that money arrived. No person may write it, so
   * staff cannot mark an unpaid request paid — or cancel one mid-payment.
   */
  it("gives staff no way to touch a request that is still being paid", () => {
    expect(staffCanMove("PENDING_PAYMENT", "PAID")).toBe(false);
    expect(staffCanMove("PENDING_PAYMENT", "CANCELED")).toBe(false);
    expect(staffCanMove("PENDING_PAYMENT", "SENT")).toBe(false);
  });

  it("lets staff mark a paid request sent, or refuse it", () => {
    expect(staffCanMove("PAID", "SENT")).toBe(true);
    expect(staffCanMove("PAID", "CANCELED")).toBe(true);
  });

  it("treats sent and cancelled as final", () => {
    expect(SMS_BROADCAST_TRANSITIONS.SENT).toEqual([]);
    expect(SMS_BROADCAST_TRANSITIONS.CANCELED).toEqual([]);
    expect(staffCanMove("SENT", "CANCELED")).toBe(false);
    expect(staffCanMove("CANCELED", "SENT")).toBe(false);
  });

  it("never lets staff move anything back to PAID", () => {
    expect(staffCanMove("SENT", "PAID")).toBe(false);
    expect(staffCanMove("CANCELED", "PAID")).toBe(false);
  });
});

describe("isRealPayment", () => {
  /** A mock settlement moved no money; sending for it would cost real credit. */
  it("does not count the mock gateway as payment", () => {
    expect(isRealPayment("mock")).toBe(false);
    expect(isRealPayment(null)).toBe(false);
    expect(isRealPayment("zarinpal")).toBe(true);
  });
});

describe("the recipient file", () => {
  it("writes one number per line, leading zeros intact", () => {
    expect(recipientsFileContent(["09121111111", "09122222222"])).toBe(
      "09121111111\r\n09122222222\r\n",
    );
  });

  it("writes nothing for an empty list", () => {
    expect(recipientsFileContent([])).toBe("");
  });

  /** A .csv opens in Excel, which strips the leading zero from every number. */
  it("is a text file, never a spreadsheet", () => {
    expect(recipientsFileName("cmabc123xyz", "burger-khaneh")).toMatch(/\.txt$/);
  });

  it("names the venue and keeps two broadcasts apart", () => {
    expect(recipientsFileName("cmabc123xyz", "burger-khaneh")).toBe(
      "restokar-sms-burger-khaneh-bc123xyz.txt",
    );
  });

  it("keeps anything unsafe out of the download header", () => {
    const name = recipientsFileName('id"\r\n', 'bad"slug/../x');
    expect(name).toMatch(/^restokar-sms-[a-z0-9-]+-[a-z0-9]+\.txt$/);
  });
});
