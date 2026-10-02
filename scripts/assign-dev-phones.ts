// Refuses to run against anything but a local development database. Must stay
// the first import: see prisma/demo-seed-guard.ts.
import "../prisma/demo-seed-guard";
import pg from "pg";
import { devPhone } from "../prisma/dev-phones";
import { normalisePhone } from "../src/lib/phone";

/**
 * Gives every development account a sign-in number. Development only.
 *
 * Sign-in moved from email + password to phone + one-time code, and on the dev
 * database 42 of 44 accounts had no phone. Approved by the owner on 2026-09-28:
 *
 *   - an account that already holds a valid, unshared mobile keeps it;
 *   - the owner's own mobile was on two of their test accounts; the one on the
 *     venue «سنتی-حشمت» keeps it, the other gets a test number. The number
 *     itself is read from OWNER_TEST_PHONE in .env so it never enters git;
 *   - everyone else gets the stable test number `devPhone(email)` — the same
 *     one the seeds now use, so a later re-seed finds these rows again.
 *
 * Nothing is deleted and no email is touched. Prints the plan and changes
 * nothing unless run with `--apply`. Must run before the migration that makes
 * `User.phone` unique, which refuses to apply while numbers are shared.
 *
 *   npx tsx scripts/assign-dev-phones.ts           # show the plan
 *   npx tsx scripts/assign-dev-phones.ts --apply   # write it
 */

const SHARED_NUMBER_KEEPER = {
  phone: process.env.OWNER_TEST_PHONE ?? "",
  slug: "سنتی-حشمت",
};
const MOBILE = /^09\d{9}$/;

interface UserRow {
  id: string;
  email: string | null;
  name: string;
  role: string;
  phone: string | null;
  slug: string | null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL!.replace(/\?schema=public$/, ""),
  });
  await client.connect();

  const { rows } = await client.query<UserRow>(`
    SELECT u.id, u.email, u.name, u.role::text AS role, u.phone, r.slug
      FROM "User" u LEFT JOIN "Restaurant" r ON r.id = u."restaurantId"
     ORDER BY u."createdAt"`);

  // Valid mobiles already on file, and who holds each.
  const holders = new Map<string, UserRow[]>();
  for (const user of rows) {
    const phone = normalisePhone(user.phone);
    if (phone && MOBILE.test(phone))
      holders.set(phone, [...(holders.get(phone) ?? []), user]);
  }

  const plan = new Map<string, { phone: string; reason: string }>();

  for (const [phone, users] of holders) {
    const keeper =
      users.length === 1
        ? users[0]!
        : phone === SHARED_NUMBER_KEEPER.phone
          ? users.find((u) => u.slug === SHARED_NUMBER_KEEPER.slug)
          : undefined;
    if (!keeper) {
      throw new Error(
        `${phone} is shared by ${users.length} accounts and no keeper is agreed.`,
      );
    }
    plan.set(keeper.id, { phone, reason: "kept" });
  }

  for (const user of rows) {
    if (plan.has(user.id)) continue;
    const key = user.email ?? user.id;
    plan.set(user.id, {
      phone: devPhone(key),
      reason: user.phone ? "shared, reassigned" : "test number",
    });
  }

  // Every number must be unique before anything is written.
  const seen = new Map<string, string>();
  for (const [id, { phone }] of plan) {
    const other = seen.get(phone);
    if (other) throw new Error(`Collision: ${phone} planned for ${other} and ${id}.`);
    seen.set(phone, id);
  }

  const mask = (phone: string) =>
    phone.startsWith("0900") ? phone : `${phone.slice(0, 4)}***${phone.slice(-4)}`;
  console.table(
    rows.map((u) => ({
      role: u.role,
      name: u.name,
      venue: u.slug ?? "",
      before: u.phone ? mask(u.phone) : "",
      after: mask(plan.get(u.id)!.phone),
      why: plan.get(u.id)!.reason,
    })),
  );

  if (!apply) {
    console.log("\nPlan only. Re-run with --apply to write it.\n");
    await client.end();
    return;
  }

  await client.query("BEGIN");
  try {
    // Clear first so a number moving between two accounts never collides.
    await client.query(`UPDATE "User" SET phone = NULL`);
    for (const [id, { phone }] of plan) {
      await client.query(`UPDATE "User" SET phone = $1 WHERE id = $2`, [phone, id]);
    }
    await client.query("COMMIT");
    console.log(`\n✓ ${plan.size} accounts updated.\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
