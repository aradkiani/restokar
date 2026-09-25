import "./load-env";
import { MelipayamakProvider } from "../src/lib/sms/melipayamak";
import { maskPhone, toSendableNumber } from "../src/lib/sms/recipients";

/**
 * Manual live check against the real Melipayamak account.
 *
 * **This sends real SMS and spends real credit.** It is deliberately not part of
 * the test suite, is never imported by the application, and does nothing unless
 * a phone number is named on the command line.
 *
 * Why it exists: `npm run verify` proves the parsing and retry rules against a
 * fake provider, which is the right place for those. What it cannot prove is
 * that the SOAP envelope this codebase writes is one the live service accepts.
 * That question can only be answered by asking the live service, and it is
 * worth being able to ask it again — after a provider change, a new pattern, or
 * an account that has gone quiet.
 *
 *   npx tsx scripts/sms-live-test.ts --phone 09123456789 --step credit
 *   npx tsx scripts/sms-live-test.ts --phone 09123456789 --step pattern --bodyid 12345 --confirm
 *   npx tsx scripts/sms-live-test.ts --phone 09123456789 --step delivery --recid 1234567890123456
 *
 * Pattern (OTP) sends only — the product uses the API for nothing else, so a
 * free-text send is not something this script can do.
 *
 * Safety rules, all enforced below rather than documented and hoped for:
 *
 *   - **No phone number, no run.** There is no default and no fallback, so an
 *     accidental `tsx scripts/sms-live-test.ts` does nothing at all.
 *   - **The number comes from the command line only.** This script never opens
 *     the database, so it cannot text a customer even by mistake.
 *   - **Anything that costs money needs `--confirm`.** `credit` and `delivery`
 *     are free and run without it.
 *   - **One message per invocation.** Sending in a loop is not expressible here.
 *   - **Credentials are read from the environment and never printed.** The only
 *     number this prints is masked.
 */

// --------------------------------- arguments --------------------------------

type Step = "credit" | "pattern" | "delivery";

const STEPS: readonly Step[] = ["credit", "pattern", "delivery"];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const rawPhone = arg("phone");
if (!rawPhone) {
  fail(
    "A phone number is required. This script will not run without one.\n" +
      "  npx tsx scripts/sms-live-test.ts --phone 09123456789 --step credit",
  );
}

/**
 * Normalised through the same function the service uses.
 *
 * Not merely convenience: if this rejects the number, the service would have
 * rejected it too, and finding that out here costs nothing.
 */
const phone = toSendableNumber(rawPhone);
if (!phone) {
  fail(`"${rawPhone}" is not a valid Iranian mobile number.`);
}

const step = (arg("step") ?? "credit") as Step;
if (!STEPS.includes(step)) {
  fail(`Unknown step "${step}". One of: ${STEPS.join(", ")}`);
}

// ------------------------------- credentials --------------------------------

const username = process.env.MELIPAYAMAK_USERNAME ?? "";
const password = process.env.MELIPAYAMAK_PASSWORD ?? "";

if (!username || !password) {
  fail("MELIPAYAMAK_USERNAME and MELIPAYAMAK_PASSWORD must be set in core/.env");
}

/** Raw replies, captured for the report. Requests are never exposed. */
const rawResponses: { operation: string; xml: string }[] = [];

const provider = new MelipayamakProvider(username, password, (operation, xml) => {
  rawResponses.push({ operation, xml });
});

function showRaw(): void {
  for (const { operation, xml } of rawResponses) {
    console.log(`\n--- raw response: ${operation} ---`);
    console.log(xml.trim());
  }
  rawResponses.length = 0;
}

/**
 * Melipayamak's delivery vocabulary, which is **not** the send-code vocabulary.
 *
 * Kept here rather than in `codes.ts` precisely so the two cannot be looked up
 * in each other's tables: `2` means "insufficient credit" as a send code and
 * "delivered to handset" here. Values are as published; anything unrecognised is
 * reported as-is rather than guessed at.
 */
const DELIVERY_STATUS: Record<number, string> = {
  // Seen live: -1 right after a send, then 1 a few seconds later.
  [-1]: "no delivery report yet — check again in a few seconds",
  0: "ارسال شده به مخابرات — handed to the operator, no verdict yet",
  1: "رسیده به گیرنده — delivered to the handset",
  2: "نرسیده به گیرنده — not delivered",
  3: "ارسال نشده — never sent",
  5: "ارسال به مخابرات — queued at the operator",
  8: "رسیده به مخابرات — reached the operator",
  16: "نرسیده — failed at the operator",
};

// ---------------------------------- steps -----------------------------------

async function stepCredit(): Promise<void> {
  console.log("\n▸ GetCredit (free, proves the credentials work)");

  const result = await provider.getCredit();
  showRaw();

  if (!result.ok) {
    const code = result.code === undefined ? "" : `code ${result.code} — `;
    fail(`GetCredit failed: ${code}${result.message}`);
  }

  console.log(`\n✓ Credit: ${result.credit}`);
  if (result.credit === 0) {
    console.warn(
      "⚠ Balance is 0 — every send will return code 2. If the account does have\n" +
        "  credit, 0 is also the provider's code for a wrong username or password.",
    );
  }
}

async function stepDelivery(): Promise<void> {
  const recId = arg("recid");
  if (!recId) fail("--recid is required for the delivery step.");

  console.log(`\n▸ GetDelivery2 (free) for recId ${recId}`);

  const status = await provider.getDeliveryStatus(recId);
  showRaw();

  if (status === null) {
    fail("GetDelivery2 returned a non-numeric answer.");
  }

  const meaning = DELIVERY_STATUS[status] ?? "undocumented status — reporting raw";
  console.log(`\n✓ Delivery status: ${status} — ${meaning}`);
}

async function stepPattern(): Promise<void> {
  if (!flag("confirm")) {
    fail("This step sends a real SMS and costs credit. Re-run with --confirm.");
  }

  const bodyId = Number(arg("bodyid"));
  if (!Number.isInteger(bodyId) || bodyId <= 0) {
    fail("--bodyid must be an approved pattern id from the Melipayamak panel.");
  }

  const code = arg("code") ?? "12345";

  console.log("\n▸ SendByBaseNumber (ONE real message)");
  console.log(`  to:        ${maskPhone(phone!)}`);
  console.log(`  bodyId:    ${bodyId}`);
  console.log(`  variables: ["${code}"]`);

  const result = await provider.sendByPattern({ to: phone!, bodyId, variables: [code] });
  showRaw();

  console.log("\n  parsed:", JSON.stringify(result, null, 2));

  if (!result.success) {
    fail(`Not sent. code=${result.code ?? "?"} — ${result.message}`);
  }

  console.log(`\n✓ Sent. recId = ${result.recId}`);
  console.log(
    "  Check delivery with (put the full test number in place of the masked one):",
  );
  console.log(
    `  npx tsx scripts/sms-live-test.ts --phone ${maskPhone(phone!)} --step delivery --recid ${result.recId}`,
  );
}

// ---------------------------------- runner ----------------------------------

const RUNNERS: Record<Step, () => Promise<void>> = {
  credit: stepCredit,
  pattern: stepPattern,
  delivery: stepDelivery,
};

async function main(): Promise<void> {
  console.log(`\nMelipayamak live check — step "${step}", target ${maskPhone(phone!)}`);

  try {
    await RUNNERS[step]();
  } catch (error) {
    showRaw();
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  console.log("");
}

void main();
