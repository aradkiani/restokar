import { describe, expect, it } from "vitest";
import {
  defaultSelection,
  missingRequiredGroups,
  selectedChoiceIds,
  toggleChoice,
  type OptionGroupLike,
} from "./order-options";

/**
 * The rules two different screens have to agree on: the guest picking options
 * on their phone and a member of staff writing the same order down over the
 * telephone. Both send choice ids to the same server, so a disagreement here
 * shows up as one of them being refused at submission.
 *
 * Named for what it tests rather than after the module, because
 * `order-options.test.ts` already exists and covers the *server's* half — that
 * a choice the product never offered cannot be priced.
 */

const SIZE: OptionGroupLike = {
  id: "size",
  isRequired: true,
  maxSelect: 1,
  choices: [
    { id: "small", isAvailable: false },
    { id: "medium", isAvailable: true },
    { id: "large", isAvailable: true },
  ],
};

const EXTRAS: OptionGroupLike = {
  id: "extras",
  isRequired: false,
  maxSelect: 2,
  choices: [
    { id: "cheese", isAvailable: true },
    { id: "bacon", isAvailable: true },
    { id: "egg", isAvailable: true },
  ],
};

/** Optional, single-select — the one shape that can be emptied by tapping. */
const SAUCE: OptionGroupLike = {
  id: "sauce",
  isRequired: false,
  maxSelect: 1,
  choices: [
    { id: "garlic", isAvailable: true },
    { id: "chilli", isAvailable: true },
  ],
};

describe("defaultSelection", () => {
  it("pre-ticks the first available choice of a required single-select group", () => {
    // "small" is first but unavailable, so the default is the first the venue
    // can actually make.
    expect(defaultSelection([SIZE])).toEqual({ size: ["medium"] });
  });

  it("leaves optional groups empty", () => {
    // A pre-ticked paid extra would be charging by inattention.
    expect(defaultSelection([EXTRAS])).toEqual({ extras: [] });
  });

  it("leaves a required group empty when nothing in it is available", () => {
    const soldOut: OptionGroupLike = {
      ...SIZE,
      choices: [{ id: "small", isAvailable: false }],
    };
    expect(defaultSelection([soldOut])).toEqual({ size: [] });
  });

  it("does not pre-tick a required multi-select group", () => {
    // Which two of five would it choose? Answering that is the person's job.
    expect(defaultSelection([{ ...EXTRAS, isRequired: true }])).toEqual({ extras: [] });
  });
});

describe("toggleChoice", () => {
  it("replaces the answer in a single-select group", () => {
    const next = toggleChoice({ size: ["medium"] }, SIZE, "large");
    expect(next).toEqual({ size: ["large"] });
  });

  it("refuses to empty a required single-select group", () => {
    // There is no "no size" to return to, so tapping the current answer is a
    // no-op rather than an unanswered question.
    const next = toggleChoice({ size: ["large"] }, SIZE, "large");
    expect(next).toEqual({ size: ["large"] });
  });

  it("lets an optional single-select group go back to none", () => {
    const next = toggleChoice({ sauce: ["garlic"] }, SAUCE, "garlic");
    expect(next).toEqual({ sauce: [] });
  });

  it("adds and removes in a multi-select group", () => {
    const added = toggleChoice({ extras: [] }, EXTRAS, "cheese");
    expect(added).toEqual({ extras: ["cheese"] });
    expect(toggleChoice(added, EXTRAS, "cheese")).toEqual({ extras: [] });
  });

  it("declines a choice past maxSelect rather than swapping one out", () => {
    // Silently dropping a choice the person deliberately made is worse than
    // declining the new one, which they can see not happening.
    const full = { extras: ["cheese", "bacon"] };
    expect(toggleChoice(full, EXTRAS, "egg")).toEqual(full);
  });

  it("does not mutate the selection it was given", () => {
    const before = { extras: ["cheese"] };
    toggleChoice(before, EXTRAS, "bacon");
    expect(before).toEqual({ extras: ["cheese"] });
  });
});

describe("missingRequiredGroups", () => {
  it("names the required group that has not been answered", () => {
    const missing = missingRequiredGroups([SIZE, EXTRAS], { size: [], extras: [] });
    expect(missing.map((group) => group.id)).toEqual(["size"]);
  });

  it("is empty once every required group has an answer", () => {
    expect(
      missingRequiredGroups([SIZE, EXTRAS], { size: ["large"], extras: [] }),
    ).toEqual([]);
  });

  it("ignores optional groups however empty they are", () => {
    expect(missingRequiredGroups([EXTRAS, SAUCE], {})).toEqual([]);
  });
});

describe("selectedChoiceIds", () => {
  it("returns ids in menu order, not tap order", () => {
    /*
      Two people who picked the same options in a different sequence must
      produce the same line — otherwise an identical order reads as a second
      variant of the dish rather than as a repeat of the first.
    */
    const tappedBackwards = { extras: ["egg", "cheese"] };
    expect(selectedChoiceIds([EXTRAS], tappedBackwards)).toEqual(["cheese", "egg"]);
  });

  it("spans groups in the order the menu lists them", () => {
    const selection = { extras: ["bacon"], size: ["large"] };
    expect(selectedChoiceIds([SIZE, EXTRAS], selection)).toEqual(["large", "bacon"]);
  });

  it("ignores a stored id the group no longer offers", () => {
    // A choice deleted since the basket was filled simply stops being sent;
    // the server would refuse it anyway.
    expect(selectedChoiceIds([SIZE], { size: ["xl"] })).toEqual([]);
  });
});
