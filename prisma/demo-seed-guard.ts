/**
 * Refuses to let a demo seed run anywhere but a local development database.
 *
 * The seeds create accounts with a known password and fill the database with
 * invented restaurants, menus and months of fake orders. On a real server that
 * is two separate disasters at once: sample data mixed into a customer's books,
 * and working credentials for a platform-admin account.
 *
 * Imported for its side effect, and it must be the *first* import in any seed
 * that uses it. ES module imports are evaluated before the importing module's
 * body, so a check placed at the top of the seed's own code would still run
 * after that module's `const prisma = new PrismaClient(...)` had been
 * constructed. A side-effect module placed first runs before its siblings,
 * which is the one ordering that gets in front of the connection. Same reason
 * `scripts/load-env.ts` exists.
 *
 * It loads `.env` itself for the same reason: the seeds call `loadEnvFile` in
 * their body, which has not run yet when this executes.
 *
 * Every check fails closed. An unreadable DATABASE_URL is treated as dangerous
 * rather than assumed local, because the whole point is to be wrong in the
 * direction that does not destroy a customer's data.
 */
import { randomBytes } from "node:crypto";

try {
  process.loadEnvFile(".env");
} catch {
  // Environment may already be populated (CI, Docker, an explicit export).
}

/** Hosts that cannot be anyone's production database. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function refusals(): string[] {
  const reasons: string[] = [];

  if (process.env.NODE_ENV === "production") {
    reasons.push('NODE_ENV is "production".');
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    reasons.push("DATABASE_URL is not set, so the target cannot be checked.");
  } else {
    let hostname: string | null = null;
    try {
      hostname = new URL(url).hostname;
    } catch {
      reasons.push("DATABASE_URL could not be parsed, so the target cannot be checked.");
    }

    if (hostname !== null && !LOCAL_HOSTS.has(hostname)) {
      reasons.push(
        `DATABASE_URL points at "${hostname}", which is not localhost or 127.0.0.1.`,
      );
    }
  }

  if (process.env.ALLOW_DEMO_SEED !== "true") {
    reasons.push('ALLOW_DEMO_SEED is not set to "true".');
  }

  return reasons;
}

const reasons = refusals();

if (reasons.length > 0) {
  console.error(
    [
      "",
      "REFUSING TO SEED — this does not look like a local development database.",
      "",
      ...reasons.map((reason) => `  • ${reason}`),
      "",
      "The demo seeds create sample restaurants, months of invented orders and",
      "accounts with a known password. They must never touch a real server.",
      "",
      'If this really is your development machine, set ALLOW_DEMO_SEED="true"',
      "in .env. Nothing has been read or written.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

let resolvedPassword: string | null = null;

/**
 * The password every seeded account gets.
 *
 * Taken from `DEMO_SEED_PASSWORD`, or generated per run and printed once when
 * that is unset. Deliberately not a constant in the source: a committed string
 * that is a working password somewhere is worth exactly as much to an attacker
 * reading the repository as it is to a developer, and this one used to be the
 * platform admin's.
 *
 * Cached so that a seed calling it several times still prints one line and
 * every account it creates shares the same password.
 */
export function demoSeedPassword(): string {
  if (resolvedPassword) return resolvedPassword;

  const fromEnv = process.env.DEMO_SEED_PASSWORD?.trim();
  if (fromEnv) {
    resolvedPassword = fromEnv;
    return resolvedPassword;
  }

  // base64url so it can be typed into a login form without escaping.
  resolvedPassword = randomBytes(12).toString("base64url");

  console.log(
    [
      "",
      "DEMO_SEED_PASSWORD is not set, so one was generated for this run:",
      "",
      `    ${resolvedPassword}`,
      "",
      "It is not stored anywhere. Copy it now, or set DEMO_SEED_PASSWORD in",
      ".env to choose your own and have it stay the same between runs.",
      "",
    ].join("\n"),
  );

  return resolvedPassword;
}
