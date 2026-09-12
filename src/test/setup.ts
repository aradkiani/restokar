/**
 * Test bootstrap.
 *
 * Some modules under test import server code that reaches `src/lib/env.ts`,
 * which validates configuration at import time and throws when it is missing.
 * Loading .env here mirrors what `next dev` does, so tests exercise the same
 * fail-fast validation as the app instead of working around it.
 *
 * The fallbacks keep the suite runnable on a machine with no .env (CI, a fresh
 * clone). They are placeholders for module loading only — no test asserts on
 * them, and nothing here touches a real database.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // No .env present — fall through to the placeholders below.
}

process.env.AUTH_SECRET ??= "test-only-secret-not-used-for-anything-real-0123456789";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5433/test?schema=public";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
