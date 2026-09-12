/**
 * Test-only stand-in for Next.js's `server-only` package.
 *
 * In the real build `server-only` throws if a server module is pulled into a
 * client bundle. Vitest runs outside that bundler, so the import needs
 * something to resolve to — see the alias in vitest.config.ts. Deliberately
 * empty: it must not change behaviour, only satisfy the module graph.
 */
export {};
