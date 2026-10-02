import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every platform-admin API route checks the role on the server.
 *
 * The /admin pages are guarded by their layout, but API routes have no layout:
 * each handler must check for itself. Asserted against the source, so a new
 * route added under api/admin without the check fails here rather than in
 * production.
 */

const root = fileURLToPath(new URL("../app/api/admin/", import.meta.url));

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

describe("admin API routes", () => {
  const files = routes(root);

  it("finds the routes", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    const name = file.slice(root.length).replaceAll("\\", "/");
    it(`${name} checks for the platform admin in every handler`, () => {
      const source = readFileSync(file, "utf8");
      const handlers =
        source.match(/export (const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g) ??
        [];
      expect(handlers.length).toBeGreaterThan(0);
      const checks =
        (source.match(/await requireAdmin\(\)/g) ?? []).length +
        (source.match(/role !== "SUPER_ADMIN"/g) ?? []).length;
      expect(checks).toBeGreaterThanOrEqual(handlers.length);
    });
  }
});
