/**
 * The catalogue of pattern messages, and the variable order each one expects.
 *
 * A pattern send does not carry text — it carries *values* for a template that a
 * human at Melipayamak has read and approved, identified by a numeric `bodyId`.
 * The provider matches the values to the template positionally, so the order in
 * `variables` below is not documentation: it is the contract.
 *
 * **One-time codes only.** The API is reserved for OTP; order notifications
 * and promotional messages do not go through it. A second message type belongs
 * here only if it is also a single-recipient code a person is waiting for.
 *
 * The pattern is unapproved until an operator creates it in the panel and puts
 * the issued id in the environment. `resolveBodyId` returns `null` until then,
 * and `sendTransactional` treats that as "cannot send this type" rather than as
 * an error.
 *
 * Pure: the catalogue is a constant, and the id lookup takes the map as an
 * argument so it can be tested without configuration.
 */

export const MESSAGE_TYPES = ["OTP"] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface PatternSpec {
  /** Ordered placeholder names, matching the approved template. */
  variables: readonly string[];
  /** The Persian text to submit for approval. `{n}` marks each placeholder. */
  suggestedText: string;
  /** Why this message is sent, for whoever reviews the pattern. */
  purpose: string;
}

/**
 * What to create in the panel.
 *
 * Short on purpose: Persian is UCS-2, so 70 characters is one SMS and 71 is two,
 * and every code a venue's guests request is billed at that rate.
 *
 * No link. `SendByBaseNumber` rejects variables containing a URL with code
 * `-10`, and a verification code has no reason to carry one.
 */
export const PATTERNS: Record<MessageType, PatternSpec> = {
  OTP: {
    variables: ["code"],
    suggestedText: "کد تایید شما: {0}\nاین کد تا ۲ دقیقه معتبر است.",
    purpose: "Verifies that a person owns the phone number they typed.",
  },
};

/** Ids as configured, keyed by type. A missing or zero id means "not set up". */
export type PatternIdMap = Partial<Record<MessageType, number>>;

/**
 * The approved id for a message type, or `null` when none is configured.
 *
 * Zero and negative ids are treated as unset rather than passed through: a
 * `bodyId` of 0 reaches the provider and comes back `-4` (invalid or not
 * approved), which costs a call and reports a configuration gap as a send
 * failure.
 */
export function resolveBodyId(type: MessageType, ids: PatternIdMap): number | null {
  const id = ids[type];
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Orders a caller's named values into the positional array the provider wants.
 *
 * Callers pass an object because `{ code }` at a call site is checkable and a
 * bare array is not — the class of bug this guards against is two same-typed
 * values in the wrong order, which only matters once a pattern has two, and is
 * cheapest to rule out before it does.
 *
 * A missing key becomes an empty string rather than `undefined`: the provider
 * compares the *count* of supplied values against the pattern and answers `-5`
 * when they disagree, so dropping a key would turn a blank field into a failed
 * send.
 */
export function orderVariables(
  type: MessageType,
  values: Record<string, string>,
): string[] {
  return PATTERNS[type].variables.map((name) => values[name] ?? "");
}
