/**
 * "Make it large for ۴۰٬۰۰۰ تومان" — the smallest upsell there is.
 *
 * Built entirely on the option groups the menu already has, because they
 * already express exactly this: a single-select group whose choices carry a
 * signed `priceDelta` *is* a size ladder. What was missing was never the data
 * model — it was that a guest had to open the sheet, find the group and read
 * four rows to discover that large costs 40,000 more. This module turns that
 * group into a one-line offer.
 *
 * Marking a group as the upgrade ladder therefore adds one boolean and no new
 * pricing, no new product rows and no second notion of a variant. The price the
 * guest is quoted is `priceDelta`, which is the number `pricing.ts` will charge
 * — there is no second arithmetic here that could drift from it.
 *
 * Free of database and framework imports, and structurally typed like
 * `order-options.ts`, so the guest menu and the dashboard can each pass their
 * own shape without knowing about the other's.
 *
 * ### Why the base choice is not simply the cheapest
 *
 * It is whatever `defaultSelection` in `order-options.ts` would tick — the
 * first *available* choice of a required group, and nothing at all in an
 * optional one. That function is the existing rule for what a dish starts as,
 * and an upgrade is by definition the difference from where the guest starts.
 * Measuring from the cheapest choice instead would quote the wrong number
 * whenever an owner lists a premium cut first, which is exactly what an owner
 * listing a premium cut first is trying to say.
 *
 * `defaultSelection` is called rather than reimplemented, so the two can never
 * disagree about it.
 */

import { defaultSelection, type OptionGroupLike } from "./order-options";

/**
 * How many upgrade offers a surface shows at once.
 *
 * Two. A third row turns a nudge into a pricing table, and the ladder a
 * restaurant actually sells is small — regular, large, occasionally an
 * in-between. Configured beyond this the extras are still orderable in the
 * sheet; they simply are not advertised.
 */
export const MAX_UPGRADE_PROMPTS = 2;

export interface UpgradeChoiceLike {
  id: string;
  isAvailable: boolean;
  /** Signed change to the unit price, in whole Toman. */
  priceDelta: number;
}

export interface UpgradeGroupLike<
  Choice extends UpgradeChoiceLike = UpgradeChoiceLike,
> extends OptionGroupLike {
  /** The owner marked this group as the dish's upgrade ladder. */
  isUpgrade: boolean;
  choices: Choice[];
}

/** One rung of the ladder, and what stepping onto it actually costs. */
export type UpgradeOption<Choice extends UpgradeChoiceLike> = Choice & {
  /**
   * Whole Toman above what the guest is already paying.
   *
   * **Not** `priceDelta`. A ladder of small −10,000 / regular 0 / large +40,000
   * that starts on small costs 50,000 to reach large, and quoting 40,000 there
   * would understate the charge the server is about to apply.
   */
  extraCost: number;
};

export interface ResolvedUpgrade<Choice extends UpgradeChoiceLike> {
  groupId: string;
  /** What the dish starts as; null in an optional group, which starts empty. */
  baseChoiceId: string | null;
  /** Dearer rungs only, cheapest step first. Never empty — null is returned instead. */
  options: UpgradeOption<Choice>[];
}

/**
 * Whether a group can serve as an upgrade ladder at all.
 *
 * Single-select only, and that is a rule rather than a simplification: "make it
 * large" replaces a choice. In a multi-select group the choices accumulate, so
 * an "upgrade" would add a second size to the line rather than change the
 * first, and the quoted difference would be wrong in a way the guest only
 * discovers at the total.
 */
export function isUpgradeGroup(group: UpgradeGroupLike): boolean {
  return group.isUpgrade && group.maxSelect === 1;
}

/**
 * The dish's upgrade ladder, or null when it has none worth offering.
 *
 * Null rather than an empty shape for every case where there is nothing to
 * advertise — no marked group, a group with one choice, a ladder whose dearer
 * rungs are all sold out, or a group where every remaining choice costs the
 * same or less. A surface then renders nothing at all rather than an empty
 * control, which is the difference between a menu and a form.
 *
 * Only the *first* marked group is used. A dish with two upgrade ladders is an
 * owner mistake the editor prevents, and picking one deterministically is a
 * better answer than stacking two offers on one card.
 */
export function resolveUpgrade<Choice extends UpgradeChoiceLike>(
  groups: readonly UpgradeGroupLike<Choice>[],
): ResolvedUpgrade<Choice> | null {
  const group = groups.find((candidate) => isUpgradeGroup(candidate));
  if (!group) return null;

  /*
    Where the guest starts, taken from the one function that decides it.

    `defaultSelection` ticks the first available choice of a required group and
    leaves an optional one empty, so an optional ladder correctly measures from
    zero — nothing is selected, so nothing has been paid yet.
  */
  const baseChoiceId = defaultSelection([group])[group.id]?.[0] ?? null;
  const base = group.choices.find((choice) => choice.id === baseChoiceId);
  const baseDelta = base?.priceDelta ?? 0;

  const options = group.choices
    .filter((choice) => choice.isAvailable && choice.id !== baseChoiceId)
    .map((choice) => ({ ...choice, extraCost: choice.priceDelta - baseDelta }))
    .filter((choice) => choice.extraCost > 0)
    // Cheapest step first: the next rung up is the one a guest is most likely
    // to take, and an ascending ladder reads as a ladder.
    .sort((a, b) => a.extraCost - b.extraCost || a.id.localeCompare(b.id));

  if (options.length === 0) return null;

  return { groupId: group.id, baseChoiceId: baseChoiceId ?? null, options };
}

/**
 * The selection that applies one upgrade, ready for the existing cart path.
 *
 * Returns an `OptionSelection` rather than a bespoke shape so the caller hands
 * it straight to `selectedChoiceIds` and the ordinary add-to-cart flow. The
 * upgraded choice replaces the base in its own group; every other group keeps
 * whatever it started with, so a one-tap upgrade cannot silently discard an
 * answer the guest already gave to a different question.
 *
 * Required groups the guest has *not* answered are left unanswered, which
 * matters: a dish with a required "choice of meat" must still open its sheet
 * rather than reaching the cart on a size tap alone. The caller checks that
 * with `missingRequiredGroups`, exactly as it already does for every other add.
 */
export function selectionWithUpgrade<Choice extends UpgradeChoiceLike>(
  groups: readonly UpgradeGroupLike<Choice>[],
  upgrade: ResolvedUpgrade<Choice>,
  choiceId: string,
): Record<string, string[]> {
  const chosen = upgrade.options.some((option) => option.id === choiceId);

  return {
    ...defaultSelection(groups),
    // An id that is not on the ladder leaves the dish as it was rather than
    // writing an unverified choice into the selection.
    [upgrade.groupId]: chosen
      ? [choiceId]
      : upgrade.baseChoiceId
        ? [upgrade.baseChoiceId]
        : [],
  };
}
