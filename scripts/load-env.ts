/**
 * Loads `.env` before anything that reads it.
 *
 * Import this *first* in any CLI script that pulls in `src/lib/env.ts`. ES
 * module imports are evaluated before the importing module's own body runs, so
 * calling `process.loadEnvFile()` inside a script is too late — `env.ts` has
 * already parsed a still-empty `process.env` and thrown. A side-effect module
 * placed at the top of the import list runs before its siblings, which is the
 * one ordering that works.
 *
 * Prisma 7 stopped auto-loading .env; Node 22 does it natively.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // Optional: production, CI and systemd populate the environment directly.
}

export {};
