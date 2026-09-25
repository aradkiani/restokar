import { parseCreditResult, parseTransactionalResult } from "./parse";
import type { CreditResult, SmsProvider, TransactionalResult } from "./types";
import { SmsError } from "./types";

/**
 * Melipayamak over SOAP, spoken directly.
 *
 * **Why not the `melipayamak-api` npm package.** Three reasons, each sufficient:
 * it does not implement `SendByBaseNumber` at all, so pattern messages — which
 * is every one-time code this product sends — are impossible through it; it
 * hardcodes `http://` for the WSDL and every call, putting the account password
 * on the wire in clear text; and it depends on `soap@0.23.0`, which brings
 * `lodash@3`, `ejs@2`, `request` and `xml-crypto@0.8` and with them seven
 * critical advisories, into a codebase that otherwise has one outbound HTTP
 * call in the entire source tree.
 *
 * SOAP is an HTTP POST with an XML body. Writing the envelopes this product
 * needs is a few dozen lines, adds no dependency, and is the same decision the
 * codebase already made for CSV (`export/csv.ts`) and for charts
 * (`components/charts.tsx`).
 *
 * **Pattern sends only.** `SendSimpleSMS` — free text to many numbers — was
 * implemented once and removed on purpose: promotional messages are paid for by
 * the venue and sent by platform staff through a separate tool (see
 * `sms-broadcast.ts`), so no code path here can reach a customer list.
 *
 * This is the only file that knows Melipayamak exists. Everything above it talks
 * to `SmsProvider`.
 *
 * **Deliberately not marked `server-only`**, mirroring `payments/zarinpal.ts`:
 * the `server-only` guard sits on `sms/index.ts`, the factory that reads
 * credentials out of the environment. This file receives them as constructor
 * arguments and reads no configuration of its own, so it holds no secret to
 * leak — and keeping the marker off it is what lets `scripts/sms-live-test.ts`
 * exercise the real transport, since `server-only` does not resolve outside
 * Next's bundler.
 */

/**
 * The SOAP endpoint. **https**, unlike the vendor's own client.
 *
 * `?wsdl` is deliberately absent: fetching the service description on every call
 * is what the npm client does, and it doubles the round trips to discover a
 * contract that has not changed since 2012. The envelopes below are written
 * against it directly.
 */
const SEND_ENDPOINT = "https://api.payamak-panel.com/post/send.asmx";

/** ASMX default namespace. Worth re-checking against the live WSDL once. */
const SOAP_NAMESPACE = "http://tempuri.org/";

/**
 * Per-call ceiling.
 *
 * A one-time code is sent while someone waits on screen to type it, so a
 * gateway that has stopped answering must not hold that request open. Ten
 * seconds is generous for a single SMS and short enough that the caller's own
 * timeout is never the thing that fires.
 */
const REQUEST_TIMEOUT_MS = 10_000;

export class MelipayamakProvider implements SmsProvider {
  readonly name = "melipayamak";

  /**
   * `onResponse` receives the raw XML of each reply, for diagnostics.
   *
   * Opt-in and undefined by default, so normal operation logs nothing. It exists
   * because the only way to be certain the parser matches reality is to look at
   * an actual reply, and the alternative — a script that builds its own
   * envelopes to see them — would be a second implementation that can drift from
   * this one and prove nothing about it.
   *
   * Only the *response* is exposed, never the request: the request carries the
   * account password in clear text, and a hook that could hand it to a caller is
   * a hook that will eventually hand it to a log file.
   */
  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly onResponse?: (operation: string, xml: string) => void,
  ) {}

  async sendByPattern(input: {
    to: string;
    bodyId: number;
    variables: string[];
  }): Promise<TransactionalResult> {
    const body = envelope("SendByBaseNumber", [
      field("username", this.username),
      field("password", this.password),
      arrayField("text", input.variables),
      field("to", input.to),
      field("bodyId", String(input.bodyId)),
    ]);

    const xml = await this.call("SendByBaseNumber", body);
    const result = extractFirst(xml, "SendByBaseNumberResult");

    return parseTransactionalResult(result);
  }

  /**
   * Remaining account balance.
   *
   * Not part of `SmsProvider` — it is Melipayamak-specific and costs nothing to
   * call, which makes it the right way to prove credentials work before spending
   * a message on finding out. Code `2` (insufficient credit) is a `FATAL`
   * outcome that stops every send, so this is also the check worth running on a
   * schedule once SMS is live.
   *
   * Account-level refusals arrive in the same field as the balance, as negative
   * numbers (`-110`: this account requires an API key in place of the
   * password). `parseCreditResult` separates the two, so a refusal can never
   * be read as a balance.
   */
  async getCredit(): Promise<CreditResult> {
    const body = envelope("GetCredit", [
      field("username", this.username),
      field("password", this.password),
    ]);

    const xml = await this.call("GetCredit", body);
    return parseCreditResult(extractFirst(xml, "GetCreditResult"));
  }

  /**
   * Delivery state for one receipt id.
   *
   * `GetDelivery2` takes **only** the recId — no username, no password. That is
   * the service's own design, confirmed against the live WSDL, and it is why
   * this method does not send credentials: adding them would be extra elements
   * outside the declared sequence.
   *
   * The returned integer is the provider's delivery status, not one of the send
   * codes in `codes.ts`. The two vocabularies are unrelated and must not be
   * looked up in each other's tables.
   */
  async getDeliveryStatus(recId: string): Promise<number | null> {
    const body = envelope("GetDelivery2", [field("recId", recId)]);

    const xml = await this.call("GetDelivery2", body);
    const raw = extractFirst(xml, "GetDelivery2Result");
    if (raw === null) return null;

    const value = Number(raw);
    return Number.isInteger(value) ? value : null;
  }

  /**
   * One SOAP call.
   *
   * Nothing from `body` is ever logged or attached to a thrown error: it carries
   * the account password in clear text inside the envelope, and an error object
   * that quotes the request it failed on is how credentials reach a log file.
   * The thrown message names the operation and the status, which is what a
   * reader actually needs.
   */
  private async call(operation: string, body: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(SEND_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "text/xml; charset=utf-8",
          soapaction: `"${SOAP_NAMESPACE}${operation}"`,
        },
        body,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "AbortError" ? "timed out" : "failed";
      throw new SmsError(`${operation} ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new SmsError(`${operation} returned HTTP ${response.status}`);
    }

    const xml = await response.text();

    // Before the fault check, so a diagnostic run can see the fault document
    // itself rather than only the message extracted from it.
    this.onResponse?.(operation, xml);

    // A SOAP fault is a 200 with an error document, so the status check above
    // does not catch it.
    const fault = extractFirst(xml, "faultstring");
    if (fault) throw new SmsError(`${operation} faulted: ${fault}`);

    return xml;
  }
}

// ------------------------------ envelope ------------------------------------

/**
 * Escapes text for an XML body.
 *
 * Non-negotiable for `text`: an announcement containing `&` or `<` produces a
 * malformed envelope, and the provider answers with a fault rather than with
 * anything that explains why. Ampersands in Persian marketing copy are common
 * enough («قهوه & دسر») that this would have been found in production.
 */
function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function field(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

/**
 * An `ArrayOfString` parameter.
 *
 * The inner element is `<string>` regardless of the parameter's own name — that
 * is what the WSDL's `ArrayOfString` type declares, and using the parameter name
 * for the items produces a request the service parses as an empty array and
 * answers with an unhelpful code.
 */
function arrayField(name: string, values: readonly string[]): string {
  const items = values.map((value) => `<string>${escapeXml(value)}</string>`).join("");
  return `<${name}>${items}</${name}>`;
}

function envelope(operation: string, fields: readonly string[]): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"' +
    ' xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    "<soap:Body>" +
    `<${operation} xmlns="${SOAP_NAMESPACE}">` +
    fields.join("") +
    `</${operation}>` +
    "</soap:Body>" +
    "</soap:Envelope>"
  );
}

// ------------------------------- response -----------------------------------

/**
 * Reads values out of the response without an XML parser.
 *
 * The documents involved are machine-generated, shallow and contain nothing
 * but digits — adding a parser to read them would mean adding back the
 * dependency this file exists to avoid. The extraction is deliberately narrow:
 * it looks for one known element name and takes its text, rather than trying to
 * be a general XML reader.
 *
 * Namespace prefixes are tolerated because ASMX emits the response body
 * unprefixed but a proxy may not.
 */
function extractFirst(xml: string, tag: string): string | null {
  const match = new RegExp(
    `<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`,
    "i",
  ).exec(xml);
  return match ? decodeXml(match[1]!.trim()) : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
