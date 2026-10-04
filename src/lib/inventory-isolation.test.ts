import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A site can only ever move its own shelves.
 *
 * Asserted against the source text, like the other isolation tests here: the
 * danger is not a scoped query returning the wrong rows but an unscoped write
 * existing at all. Two properties:
 *
 *  1. every inventory route is guarded, and
 *  2. a site id from a request reaches nothing except `resolveStockScope`,
 *     which honours it only for a chain owner choosing among their own sites.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const apiRoot = join(here, "..", "app", "api", "inventory");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

describe("inventory isolation", () => {
  const routes = routeFiles(apiRoot);

  it("finds the inventory routes", () => {
    expect(routes.length).toBeGreaterThanOrEqual(8);
  });

  it("guards every handler", () => {
    for (const path of routes) {
      const source = readFileSync(path, "utf8");
      const handlers = source.match(/export const (GET|POST|PATCH|PUT|DELETE)/g) ?? [];
      const guards =
        source.match(/await (requireOwner|requireTab\("inventory"\))\(?\)?/g) ?? [];
      expect(guards.length, path).toBeGreaterThanOrEqual(handlers.length);
    }
  });

  it("never takes a tenant from the request", () => {
    for (const path of routes) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/input\.restaurantId|query\.restaurantId/);
      // A requested site is only ever handed to the resolver.
      const siteLines = source
        .split("\n")
        .filter((line) => /(input|query)\.(siteId|site)\b/.test(line));
      for (const line of siteLines) {
        expect(line, path).toMatch(/resolveStockScope/);
      }
    }
  });

  it("lets only a chain owner pick a site", () => {
    const source = readFileSync(join(here, "inventory-server.ts"), "utf8");
    const resolver = source.slice(
      source.indexOf("export async function resolveStockScope"),
      source.indexOf("export async function siteScope"),
    );
    expect(resolver).toMatch(
      /ctx\.user\.role !== "OWNER" \|\| venue\.parentRestaurantId/,
    );
    // The choice is matched against the owner's own sites, never trusted.
    expect(resolver).toMatch(/sites\.find\(\(site\) => site\.id === requestedSiteId\)/);
  });

  it("writes stock in exactly one place", () => {
    const writers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "generated") walk(path);
        } else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) {
          const source = readFileSync(path, "utf8");
          if (
            /stockLevel\.(update|upsert|create|createMany)\(|stockMovement\.(create|createMany)\(/.test(
              source,
            )
          ) {
            writers.push(path.replace(/\\/g, "/").split("/src/")[1]!);
          }
        }
      }
    };
    walk(join(here, ".."));
    expect(writers).toEqual(["lib/stock.ts"]);
  });
});
