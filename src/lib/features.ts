/**
 * Temporary feature switches.
 *
 * Payments and public signup are off until the Zarinpal gateway is connected.
 * Both are read from the environment rather than deleted from the codebase, so
 * turning them back on is a variable and a restart — not a revert of a large
 * commit against a product that has moved on in the meantime.
 *
 * The default is **off**. A deployment that forgets the variable gets a
 * disabled checkout, never a checkout that takes money nobody can settle.
 */

/**
 * Whether an explicit opt-in string means "on".
 *
 * Only `true` and `1` count. Values that clearly read as intent — `yes`, `on` —
 * are deliberately rejected, because once those are accepted the next question
 * is what to do with `ture`, and for a payment switch the safe answer to every
 * ambiguous string is off.
 */
export function featureEnabled(value: string | undefined): boolean {
  const normalised = value?.trim().toLowerCase();
  return normalised === "true" || normalised === "1";
}

/**
 * A guest paying a restaurant for their order.
 *
 * With `PAYMENT_PROVIDER="mock"` this runs the full redirect-and-callback
 * flow without a network call and confirms the order — enough to demonstrate
 * the checkout end to end, and incapable of moving money.
 */
export const PAYMENTS_ENABLED = featureEnabled(process.env.ENABLE_PAYMENTS);

/**
 * A venue paying *us* for its subscription. Separate switch, deliberately.
 *
 * These were one flag, which meant demonstrating a guest checkout would also
 * have opened plan checkout — a venue could "renew" against a mock provider and
 * be recorded as paid for a month nobody was billed for. A demo of someone
 * else's payment flow must not be able to write our own billing history, so the
 * platform side stays off until a real merchant id exists.
 */
export const SUBSCRIPTION_CHECKOUT_ENABLED = featureEnabled(
  process.env.ENABLE_SUBSCRIPTION_CHECKOUT,
);

/**
 * A venue paying *us* for a promotional SMS broadcast. Its own switch, for the
 * same reason subscription checkout has one — and a sharper one.
 *
 * A paid broadcast lands in the admin queue, where platform staff send it with
 * a separate tool and pay the SMS line out of pocket. Were this to follow
 * `ENABLE_PAYMENTS`, a demo against the mock gateway would put a "paid" request
 * in that queue that nobody paid for, and sending it would cost real money. So
 * it stays off until a real merchant id exists, and the admin queue marks any
 * request settled through the mock gateway as unpaid regardless.
 */
export const SMS_CHECKOUT_ENABLED = featureEnabled(process.env.ENABLE_SMS_CHECKOUT);

/**
 * Self-service signup. Off while onboarding runs through platform staff, who
 * create accounts from the admin console instead.
 */
export const PUBLIC_REGISTRATION_ENABLED = featureEnabled(
  process.env.ENABLE_PUBLIC_REGISTRATION,
);
