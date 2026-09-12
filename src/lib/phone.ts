import { toEnglishDigits } from "./format";

/**
 * One customer, one string.
 *
 * `Order.customerPhone` is the only thing tying a guest's orders together —
 * there is no account, no login and no card, just a number typed at a table.
 * The moment anything groups orders by customer, the *storage* form of that
 * number decides whether a regular looks like one person or like five: a guest
 * who types «۰۹۱۲۱۲۳۴۵۶۷», then `0912 123 4567`, then `+98 912 123 4567` has
 * placed three orders that no `GROUP BY` will ever put together.
 *
 * Normalising at the point of writing rather than at the point of reading is
 * deliberate. A read-time fix has to be repeated in every query that ever
 * touches the column and silently rots when one of them forgets; and by the
 * time customer features are built there would be real order history in mixed
 * formats, making the correction a migration over live data rather than a
 * function. Cheap now, expensive later.
 *
 * Free of database and framework imports so the rule can be tested directly,
 * the same discipline `pricing.ts` and `inventory.ts` follow.
 */

/** Longest value `Order.customerPhone` accepts, matching the input schema. */
const MAX_LENGTH = 20;

/**
 * Iranian mobile numbers, in every form a guest actually types them.
 *
 * All four reduce to the same subscriber number: a `9` followed by nine digits.
 * The country code may arrive as `+98`, `0098` or a bare `98`, and the trunk
 * prefix `0` is present or absent depending on whether the guest is thinking
 * domestically. Landlines are deliberately *not* matched — «۰۲۱۸۸…» is a valid
 * contact number, but its area-code conventions are not something to guess at,
 * and a wrong guess corrupts the number rather than tidying it.
 */
const IRANIAN_MOBILE = /^(?:\+?98|0098|0)?(9\d{9})$/;

/**
 * The canonical form of a phone number, or `null` when nothing was given.
 *
 * Iranian mobiles come back as `09XXXXXXXXX`, which is how they are written on
 * every receipt and dialled from every handset in the country. Anything else —
 * a landline, a foreign number, a guest who typed something that is not a
 * number at all — comes back cleaned of separators but otherwise untouched:
 * preserving what a person actually wrote is worth more than forcing a shape
 * onto a value this function does not understand.
 *
 * Never throws. It sits on the order path, and a badly formed phone number is
 * not a reason to refuse a guest their dinner.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Persian and Arabic-Indic digits first: everything downstream counts on
  // `\d` matching, and «۰۹۱۲» matches nothing until it is ASCII.
  const ascii = toEnglishDigits(String(raw)).trim();
  if (!ascii) return null;

  // Separators people put in phone numbers, and nothing else — a `+` is
  // meaningful and is left for the pattern below to interpret.
  const cleaned = ascii.replace(/[\s\-().]/g, "");
  if (!cleaned) return null;

  const mobile = IRANIAN_MOBILE.exec(cleaned);
  if (mobile) return `0${mobile[1]}`;

  // Not a form we recognise. Return it bounded rather than dropped: an
  // unrecognised number is still the only way the venue can call this guest.
  return cleaned.slice(0, MAX_LENGTH);
}
