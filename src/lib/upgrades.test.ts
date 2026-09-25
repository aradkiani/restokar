import { describe, expect, it } from "vitest";
import { missingRequiredGroups, selectedChoiceIds } from "./order-options";
import {
  isUpgradeGroup,
  resolveUpgrade,
  selectionWithUpgrade,
  type UpgradeChoiceLike,
  type UpgradeGroupLike,
} from "./upgrades";

const choice = (
  id: string,
  priceDelta: number,
  isAvailable = true,
): UpgradeChoiceLike & { name: string } => ({
  id,
  name: id,
  priceDelta,
  isAvailable,
});

/** Regular (the default, listed first) / large / extra large. */
const sizeLadder = (
  over: Partial<UpgradeGroupLike<UpgradeChoiceLike & { name: string }>> = {},
): UpgradeGroupLike<UpgradeChoiceLike & { name: string }> => ({
  id: "g-size",
  isRequired: true,
  isUpgrade: true,
  maxSelect: 1,
  choices: [choice("c-regular", 0), choice("c-large", 40_000), choice("c-xl", 70_000)],
  ...over,
});

const meatGroup: UpgradeGroupLike<UpgradeChoiceLike & { name: string }> = {
  id: "g-meat",
  isRequired: true,
  isUpgrade: false,
  maxSelect: 1,
  choices: [choice("c-beef", 0), choice("c-chicken", 0)],
};

describe("isUpgradeGroup", () => {
  it("accepts a marked single-select group", () => {
    expect(isUpgradeGroup(sizeLadder())).toBe(true);
  });

  it("rejects an unmarked group", () => {
    expect(isUpgradeGroup(meatGroup)).toBe(false);
  });

  /** In a multi-select group an "upgrade" would add a size, not change one. */
  it("rejects a marked multi-select group", () => {
    expect(isUpgradeGroup(sizeLadder({ maxSelect: 3 }))).toBe(false);
  });
});

describe("resolveUpgrade", () => {
  it("offers the dearer rungs, cheapest step first", () => {
    const upgrade = resolveUpgrade([sizeLadder()]);

    expect(upgrade!.groupId).toBe("g-size");
    expect(upgrade!.baseChoiceId).toBe("c-regular");
    expect(upgrade!.options.map((o) => o.id)).toEqual(["c-large", "c-xl"]);
  });

  it("quotes the cost above where the guest starts", () => {
    const upgrade = resolveUpgrade([sizeLadder()]);

    expect(upgrade!.options.map((o) => o.extraCost)).toEqual([40_000, 70_000]);
  });

  /**
   * The arithmetic that makes `extraCost` worth having. Starting on small at
   * −10,000, reaching large at +40,000 costs 50,000 — quoting the stored
   * 40,000 would understate what the server is about to charge.
   */
  it("measures from the base rung, not from zero", () => {
    const upgrade = resolveUpgrade([
      sizeLadder({
        choices: [choice("c-small", -10_000), choice("c-large", 40_000)],
      }),
    ]);

    expect(upgrade!.baseChoiceId).toBe("c-small");
    expect(upgrade!.options[0]!.extraCost).toBe(50_000);
  });

  /**
   * The base is what `defaultSelection` ticks — the first *available* choice —
   * not the cheapest. An owner listing a premium cut first is saying something.
   */
  it("takes the owner's first choice as the base even when it is not cheapest", () => {
    const upgrade = resolveUpgrade([
      sizeLadder({
        choices: [
          choice("c-premium", 50_000),
          choice("c-deluxe", 90_000),
          choice("c-basic", 0),
        ],
      }),
    ]);

    expect(upgrade!.baseChoiceId).toBe("c-premium");
    // The cheaper rung is a downgrade and is not offered.
    expect(upgrade!.options.map((o) => o.id)).toEqual(["c-deluxe"]);
    expect(upgrade!.options[0]!.extraCost).toBe(40_000);
  });

  it("skips a sold-out first choice when picking the base", () => {
    const upgrade = resolveUpgrade([
      sizeLadder({
        choices: [
          choice("c-regular", 0, false),
          choice("c-large", 40_000),
          choice("c-xl", 70_000),
        ],
      }),
    ]);

    expect(upgrade!.baseChoiceId).toBe("c-large");
    expect(upgrade!.options.map((o) => o.id)).toEqual(["c-xl"]);
    expect(upgrade!.options[0]!.extraCost).toBe(30_000);
  });

  it("never offers a sold-out rung", () => {
    const upgrade = resolveUpgrade([
      sizeLadder({
        choices: [
          choice("c-regular", 0),
          choice("c-large", 40_000, false),
          choice("c-xl", 70_000),
        ],
      }),
    ]);

    expect(upgrade!.options.map((o) => o.id)).toEqual(["c-xl"]);
  });

  /** An optional ladder starts empty, so the full delta is what is charged. */
  it("measures an optional ladder from nothing selected", () => {
    const upgrade = resolveUpgrade([sizeLadder({ isRequired: false })]);

    expect(upgrade!.baseChoiceId).toBe(null);
    expect(upgrade!.options.map((o) => o.extraCost)).toEqual([40_000, 70_000]);
  });

  it("returns null when no group is marked", () => {
    expect(resolveUpgrade([meatGroup])).toBe(null);
  });

  it("returns null when every dearer rung is sold out", () => {
    expect(
      resolveUpgrade([
        sizeLadder({
          choices: [choice("c-regular", 0), choice("c-large", 40_000, false)],
        }),
      ]),
    ).toBe(null);
  });

  it("returns null when nothing costs more than the base", () => {
    expect(
      resolveUpgrade([
        sizeLadder({
          choices: [choice("c-a", 0), choice("c-b", 0), choice("c-c", -5_000)],
        }),
      ]),
    ).toBe(null);
  });

  it("returns null for a single-choice group", () => {
    expect(resolveUpgrade([sizeLadder({ choices: [choice("c-only", 0)] })])).toBe(null);
  });

  it("uses only the first marked group", () => {
    const second = sizeLadder({ id: "g-second" });
    expect(resolveUpgrade([meatGroup, sizeLadder(), second])!.groupId).toBe("g-size");
  });

  it("carries the choice through, so a surface can name it", () => {
    const upgrade = resolveUpgrade([sizeLadder()]);
    expect(upgrade!.options[0]!.name).toBe("c-large");
  });

  it("is deterministic", () => {
    expect(resolveUpgrade([sizeLadder()])).toEqual(resolveUpgrade([sizeLadder()]));
  });
});

describe("selectionWithUpgrade", () => {
  const groups = [meatGroup, sizeLadder()];

  it("swaps the base rung for the chosen one", () => {
    const upgrade = resolveUpgrade(groups)!;
    const selection = selectionWithUpgrade(groups, upgrade, "c-large");

    expect(selection["g-size"]).toEqual(["c-large"]);
  });

  it("leaves every other group at its default", () => {
    const upgrade = resolveUpgrade(groups)!;
    const selection = selectionWithUpgrade(groups, upgrade, "c-large");

    expect(selection["g-meat"]).toEqual(["c-beef"]);
  });

  /** An unverified id must not be written into the selection. */
  it("ignores a choice that is not on the ladder", () => {
    const upgrade = resolveUpgrade(groups)!;
    const selection = selectionWithUpgrade(groups, upgrade, "c-not-a-real-choice");

    expect(selection["g-size"]).toEqual(["c-regular"]);
  });

  it("ignores a sold-out rung", () => {
    const ladder = sizeLadder({
      choices: [
        choice("c-regular", 0),
        choice("c-large", 40_000, false),
        choice("c-xl", 70_000),
      ],
    });
    const upgrade = resolveUpgrade([ladder])!;

    expect(selectionWithUpgrade([ladder], upgrade, "c-large")["g-size"]).toEqual([
      "c-regular",
    ]);
  });

  /** The result must feed the ordinary cart path unchanged. */
  it("produces a selection the existing option helpers accept", () => {
    const upgrade = resolveUpgrade(groups)!;
    const selection = selectionWithUpgrade(groups, upgrade, "c-xl");

    expect(selectedChoiceIds(groups, selection)).toEqual(["c-beef", "c-xl"]);
    expect(missingRequiredGroups(groups, selection)).toEqual([]);
  });

  /**
   * A dish with an unanswered required question must still open its sheet — a
   * size tap is not an answer to "which meat".
   */
  it("leaves an unanswerable required group outstanding", () => {
    const unanswerable = { ...meatGroup, choices: [choice("c-beef", 0, false)] };
    const withLadder = [unanswerable, sizeLadder()];
    const upgrade = resolveUpgrade(withLadder)!;
    const selection = selectionWithUpgrade(withLadder, upgrade, "c-large");

    expect(missingRequiredGroups(withLadder, selection).map((g) => g.id)).toEqual([
      "g-meat",
    ]);
  });
});
