/**
 * Choosing a dish's options — which choices start ticked, what a tap does, and
 * whether the selection is complete enough to order.
 *
 * Database-free and framework-free, like pricing.ts and discounts.ts, and for
 * the same reason: a guest picking "large, no onion" and a member of staff
 * writing down the same order over the telephone must arrive at the same set of
 * choice ids. The server prices those ids and refuses anything the product did
 * not offer, so this is about what the two screens agree to *ask*, not about
 * what anything costs.
 *
 * Types are structural rather than imported from the template or the Prisma
 * client, so the guest menu and the dashboard can both pass their own shapes in
 * without either having to know about the other's.
 */

export interface OptionChoiceLike {
  id: string;
  isAvailable: boolean;
}

export interface OptionGroupLike {
  id: string;
  isRequired: boolean;
  maxSelect: number;
  choices: OptionChoiceLike[];
}

/** Group id → the choice ids ticked in it. */
export type OptionSelection = Record<string, string[]>;

/**
 * Pre-ticks the first available choice of every required single-select group.
 *
 * A required question that starts blank makes the person do work to reach the
 * state the venue already considers normal — and an owner lists the default cut
 * first for exactly that reason. Optional groups start empty, because a
 * pre-ticked paid extra would be charging by inattention.
 */
export function defaultSelection(groups: readonly OptionGroupLike[]): OptionSelection {
  const out: OptionSelection = {};

  for (const group of groups) {
    if (group.isRequired && group.maxSelect === 1) {
      const first = group.choices.find((choice) => choice.isAvailable);
      out[group.id] = first ? [first.id] : [];
    } else {
      out[group.id] = [];
    }
  }

  return out;
}

/**
 * What tapping a choice does.
 *
 * Single-select behaves like a radio: the tap replaces whatever was there. The
 * one exception is unticking the current answer of an *optional* single-select
 * group, which is the only way back to "none" — a required group has no such
 * state, so tapping its current answer leaves it alone rather than emptying a
 * question that must be answered.
 *
 * Multi-select stops accepting at `maxSelect` rather than pushing the oldest
 * choice out: silently swapping a choice the person deliberately made is worse
 * than declining the new one, which they can see.
 */
export function toggleChoice(
  selected: OptionSelection,
  group: OptionGroupLike,
  choiceId: string,
): OptionSelection {
  const current = selected[group.id] ?? [];

  if (group.maxSelect <= 1) {
    const isSame = current.length === 1 && current[0] === choiceId;
    if (isSame && !group.isRequired) return { ...selected, [group.id]: [] };
    return { ...selected, [group.id]: [choiceId] };
  }

  if (current.includes(choiceId)) {
    return { ...selected, [group.id]: current.filter((id) => id !== choiceId) };
  }

  if (current.length >= group.maxSelect) return selected;

  return { ...selected, [group.id]: [...current, choiceId] };
}

/**
 * Required groups that have not been answered.
 *
 * Returned as the groups themselves rather than a boolean so a caller can name
 * which question is outstanding. The server refuses the same thing when the
 * order is submitted; this exists so the refusal happens while the person can
 * still see what they missed.
 */
export function missingRequiredGroups<Group extends OptionGroupLike>(
  groups: readonly Group[],
  selected: OptionSelection,
): Group[] {
  // Generic rather than returning the structural type: a caller that passed
  // groups carrying a name gets groups carrying a name back, which is what
  // makes "you have not chosen a size" possible to write.
  return groups.filter(
    (group) => group.isRequired && (selected[group.id]?.length ?? 0) === 0,
  );
}

/**
 * The selection flattened into choice ids, in menu order.
 *
 * Menu order rather than tap order, so two people who picked the same options
 * in a different sequence produce the same line — which is what makes an
 * identical line identifiable as a repeat rather than as a second variant.
 */
export function selectedChoiceIds(
  groups: readonly OptionGroupLike[],
  selected: OptionSelection,
): string[] {
  return groups.flatMap((group) =>
    group.choices
      .filter((choice) => (selected[group.id] ?? []).includes(choice.id))
      .map((choice) => choice.id),
  );
}
