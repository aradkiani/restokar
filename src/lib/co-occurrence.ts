/**
 * What a venue's own order history says about which dishes travel together.
 *
 * The one part of this engine that is not the owner's stated opinion, and
 * therefore the part that has to justify itself hardest. Everything here is
 * counting: how often two dishes appeared on the same bill, how often each
 * appeared at all, and how many bills there were. No model is fitted, nothing
 * is learned, and the same counts always produce the same ranking.
 *
 * Free of database and framework imports like every other domain module here.
 * `co-occurrence-server.ts` does the counting against the order tables and
 * stores the result; this file decides which of those counts are worth acting
 * on and in what order.
 *
 * ### The failure this module exists to prevent
 *
 * Raw pair counts do not work. On this project's own seed data the single
 * best-selling dish at the busiest venue appears in four of the top eight
 * pairs, simply because it appears in everything — rank by count and one
 * popular dish becomes the suggestion for the entire menu, which is both
 * useless to the guest and actively misleading to the owner.
 *
 * So a pair has to clear three separate bars, and they catch different things:
 *
 *   * **support** — it happened often enough to be a fact rather than an
 *     anecdote. Guards against reading meaning into two coincidences.
 *   * **confidence** — `P(target | source)`. Of the bills with the burger, a
 *     real share also had the chips. Guards against a pair that is frequent
 *     only because the source dish is frequent.
 *   * **lift** — confidence divided by how often the target appears anyway.
 *     **This is the one that stops the popular dish winning everything.** A
 *     drink on 60% of all bills will reach 60% confidence against every dish on
 *     the menu and clear no lift bar at all, because it is not associated with
 *     the burger — it is associated with dinner.
 *
 * A pair that clears all three is stated as "ordered together often", which is
 * exactly what was measured. It is never stated as a cause: see the same
 * discipline in `sales-insights.ts`.
 */

// ------------------------------- thresholds --------------------------------

/**
 * The floors below which history is not evidence.
 *
 * Chosen against the scale this product runs at — a 10–50 table venue taking
 * roughly 20–60 covers a day — and checked against the seed data, where the
 * busiest venue has ~2,900 non-cancelled orders and its strongest genuine pair
 * co-occurs 290 times. A venue in its first fortnight clears none of these, and
 * that is the intended answer: it falls back to what the owner defined.
 *
 * Every rule reads these. Retuning the sensitivity of the whole feature is one
 * edit, and no threshold is repeated at a call site.
 */
export const CO_OCCURRENCE_THRESHOLDS = {
  /**
   * 50 non-cancelled orders before a venue's history is consulted at all.
   *
   * The venue-level gate, and the one that implements the "for very small
   * datasets, fall back to owner-defined recommendations" rule. Roughly a
   * week for the smallest venue on the smallest plan.
   */
  minTotalOrders: 50,

  /**
   * 20 orders containing the source dish.
   *
   * A confidence of 50% means nothing when it is two bills out of four. This is
   * the denominator floor, and it is checked before the division rather than
   * after, so a thin denominator never reaches the ranking at all.
   */
  minSourceSupport: 20,

  /** 8 bills carrying both. Below this the pair is a handful of coincidences. */
  minPairCount: 8,

  /**
   * 15% — of the bills with the source, this share also had the target.
   *
   * Deliberately low, because a menu of thirty dishes spreads attachment thin:
   * a side ordered with one burger in six is a genuinely strong pairing in this
   * trade, not a weak one.
   */
  minConfidence: 0.15,

  /**
   * 1.25 — the pair must be a quarter more likely than the target's own
   * popularity would predict.
   *
   * Above 1 is the honest floor; the margin is there because a lift of 1.02 on
   * a few hundred orders is noise wearing a decimal point.
   */
  minLift: 1.25,
} as const;

// --------------------------------- shapes ----------------------------------

/**
 * One directional pair, as the counting pass produced it.
 *
 * Directional because `P(chips | burger)` and `P(burger | chips)` are different
 * questions with different answers — almost every burger comes with chips,
 * while plenty of chips are ordered alone — and a symmetric row could only
 * answer one of them.
 *
 * The raw counts travel rather than a pre-computed score, so the thresholds
 * above stay the only place a judgement is made and a stored row never has to
 * be recomputed when they are retuned.
 */
export interface ProductPairCounts {
  sourceProductId: string;
  targetProductId: string;
  /** Non-cancelled orders containing both dishes. */
  pairCount: number;
  /** Non-cancelled orders containing the source dish. */
  sourceSupport: number;
  /** Non-cancelled orders containing the target dish. */
  targetSupport: number;
  /** Non-cancelled orders for the venue over the same window. */
  totalOrders: number;
}

/** A pair that cleared every bar, with the arithmetic that got it there. */
export interface CoOccurrencePair extends ProductPairCounts {
  /** `pairCount / sourceSupport` — of bills with the source, the share with the target. */
  confidence: number;
  /** `confidence ÷ (targetSupport / totalOrders)` — association above mere popularity. */
  lift: number;
}

// -------------------------------- the rules --------------------------------

/**
 * How often the target appears on any bill at all.
 *
 * The denominator of lift, and the reason a universally popular dish cannot
 * dominate: the more often it appears everywhere, the higher the bar it must
 * clear with any one partner.
 */
export function baseRate(counts: ProductPairCounts): number {
  if (counts.totalOrders <= 0) return 0;
  return counts.targetSupport / counts.totalOrders;
}

/** `P(target | source)`. Zero when the source never sold, never a division by zero. */
export function confidenceOf(counts: ProductPairCounts): number {
  if (counts.sourceSupport <= 0) return 0;
  return counts.pairCount / counts.sourceSupport;
}

/**
 * How much more likely the target is alongside the source than in general.
 *
 * 1.0 means "no association at all" — the dish is just as likely with the
 * source as without it. Below 1 means the two are ordered together *less* than
 * chance, which is a real signal and the opposite of a recommendation.
 *
 * Zero base rate yields zero rather than infinity: a target that has never sold
 * cannot be lifted, and returning Infinity would sort it to the top of every
 * list on the strength of having no evidence whatsoever.
 */
export function liftOf(counts: ProductPairCounts): number {
  const base = baseRate(counts);
  if (base <= 0) return 0;
  return confidenceOf(counts) / base;
}

/**
 * Whether a venue has traded enough for its history to mean anything.
 *
 * Checked once against the venue rather than per pair, because the answer is
 * the same for every pair and because "this restaurant is too new" is a
 * different statement from "this particular pairing is too thin".
 */
export function hasEnoughHistory(
  totalOrders: number,
  thresholds: typeof CO_OCCURRENCE_THRESHOLDS = CO_OCCURRENCE_THRESHOLDS,
): boolean {
  return totalOrders >= thresholds.minTotalOrders;
}

/**
 * Whether one pair is worth showing a guest.
 *
 * All four bars, in cheapest-first order. Separate from the ranking below so
 * the dashboard can explain a rejection — an owner asking why two obviously
 * related dishes are not suggested deserves "they have only been ordered
 * together twice", not silence.
 */
export function qualifies(
  counts: ProductPairCounts,
  thresholds: typeof CO_OCCURRENCE_THRESHOLDS = CO_OCCURRENCE_THRESHOLDS,
): boolean {
  if (counts.sourceProductId === counts.targetProductId) return false;
  if (!hasEnoughHistory(counts.totalOrders, thresholds)) return false;
  if (counts.sourceSupport < thresholds.minSourceSupport) return false;
  if (counts.pairCount < thresholds.minPairCount) return false;
  if (confidenceOf(counts) < thresholds.minConfidence) return false;

  return liftOf(counts) >= thresholds.minLift;
}

/**
 * The pairs worth acting on, strongest association first.
 *
 * Ranked on **lift** rather than on raw count, which is the whole point of the
 * module: count ranks by popularity, lift ranks by association. Ties fall
 * through to confidence, then to the pair count, then to the product ids —
 * that last one is never a meaningful tiebreak, it is there so the order is
 * *total*. Two pairs with identical arithmetic must not swap places between
 * renders, and product id is the only remaining value guaranteed to differ.
 */
export function rankCoOccurrence(
  rows: readonly ProductPairCounts[],
  thresholds: typeof CO_OCCURRENCE_THRESHOLDS = CO_OCCURRENCE_THRESHOLDS,
): CoOccurrencePair[] {
  return rows
    .filter((row) => qualifies(row, thresholds))
    .map((row) => ({ ...row, confidence: confidenceOf(row), lift: liftOf(row) }))
    .sort(
      (a, b) =>
        b.lift - a.lift ||
        b.confidence - a.confidence ||
        b.pairCount - a.pairCount ||
        a.sourceProductId.localeCompare(b.sourceProductId) ||
        a.targetProductId.localeCompare(b.targetProductId),
    );
}

/**
 * The strongest partners for one dish.
 *
 * Used by the guest menu, where the question is always "what goes with the
 * thing in front of me" rather than "what are this venue's strongest pairs".
 * Filtering before ranking rather than after matters: ranking the whole graph
 * and then taking this dish's rows would let another dish's stronger pair
 * consume the limit and return nothing.
 */
export function partnersFor(
  sourceProductId: string,
  rows: readonly ProductPairCounts[],
  limit: number,
  thresholds: typeof CO_OCCURRENCE_THRESHOLDS = CO_OCCURRENCE_THRESHOLDS,
): CoOccurrencePair[] {
  const mine = rows.filter((row) => row.sourceProductId === sourceProductId);
  return rankCoOccurrence(mine, thresholds).slice(0, Math.max(0, limit));
}
