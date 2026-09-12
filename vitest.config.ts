import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests only — pure logic, no database, no server.
 *
 * The suite deliberately covers the code where a mistake costs money or leaks
 * data (order pricing, theme contrast, validation) rather than chasing
 * coverage of presentational components.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      /*
        `server-only` is a build-time marker Next.js resolves itself; outside
        its bundler the import simply fails. Stubbing it here lets server
        modules be unit-tested without weakening the guard in the real build,
        where the package still does its job.
      */
      "server-only": resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
