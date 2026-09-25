import { describe, expect, it } from "vitest";
import {
  isIranianMobile,
  maskPhone,
  prepareRecipients,
  toSendableNumber,
} from "./recipients";

describe("toSendableNumber", () => {
  it("accepts every spelling of an Iranian mobile", () => {
    for (const form of [
      "09121234567",
      "9121234567",
      "+989121234567",
      "0098 912 123 4567",
      "۰۹۱۲۱۲۳۴۵۶۷",
    ]) {
      expect(toSendableNumber(form), form).toBe("09121234567");
    }
  });

  /**
   * The one place this deliberately disagrees with `normalisePhone`. That
   * function keeps a landline because it is still a way to reach a guest; SMS
   * cannot use one, so sending to it would spend a message on a number that can
   * never receive it.
   */
  it("rejects what cannot receive an SMS", () => {
    expect(toSendableNumber("02188776655")).toBeNull();
    expect(toSendableNumber("+442079460958")).toBeNull();
    expect(toSendableNumber("تماس بگیرید")).toBeNull();
    expect(toSendableNumber("")).toBeNull();
    expect(toSendableNumber(null)).toBeNull();
  });

  it("recognises every mobile operator prefix", () => {
    for (const number of ["09121234567", "09351234567", "09011234567", "09901234567"]) {
      expect(isIranianMobile(number), number).toBe(true);
    }
  });

  it("refuses a number of the wrong length", () => {
    expect(isIranianMobile("0912123456")).toBe(false);
    expect(isIranianMobile("091212345678")).toBe(false);
  });
});

describe("prepareRecipients", () => {
  it("normalises, keeps first-seen order, and reports nothing when all are valid", () => {
    const { phones, dropped } = prepareRecipients([
      "+989121111111",
      "۰۹۱۲۲۲۲۲۲۲۲",
      "9123333333",
    ]);

    expect(phones).toEqual(["09121111111", "09122222222", "09123333333"]);
    expect(dropped).toEqual([]);
  });

  /**
   * The same person written two ways is one recipient. Without this they receive
   * the announcement twice and the venue pays for both.
   */
  it("de-duplicates across different spellings of one number", () => {
    const { phones, dropped } = prepareRecipients([
      "09121111111",
      "+989121111111",
      "۰۹۱۲۱۱۱۱۱۱۱",
    ]);

    expect(phones).toEqual(["09121111111"]);
    expect(dropped).toHaveLength(2);
    expect(dropped.every((d) => d.reason === "DUPLICATE")).toBe(true);
  });

  it("drops what cannot be texted and says which value it was", () => {
    const { phones, dropped } = prepareRecipients([
      "09121111111",
      "02188776655",
      "بدون شماره",
    ]);

    expect(phones).toEqual(["09121111111"]);
    expect(dropped).toHaveLength(2);
    expect(dropped[0]).toEqual({ raw: "02188776655", reason: "INVALID" });
    expect(dropped[1]!.reason).toBe("INVALID");
  });

  it("accounts for every input exactly once", () => {
    const input = ["09121111111", "09121111111", "02188776655", "", "09122222222"];
    const { phones, dropped } = prepareRecipients(input);

    expect(phones.length + dropped.length).toBe(input.length);
  });
});

describe("maskPhone", () => {
  /** Logs get pasted into tickets and chats; a full number must not travel. */
  it("keeps a number recognisable without revealing it", () => {
    expect(maskPhone("09121234567")).toBe("0912***4567");
  });

  it("reveals nothing for a value too short to mask", () => {
    expect(maskPhone("0912")).toBe("***");
    expect(maskPhone("")).toBe("***");
  });
});
