import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Two product decisions, held against the source text.
 *
 *   1. **Promotional SMS never goes through the API.** A venue pays; platform
 *      staff send by hand. If a broadcast module ever imported the SMS sender,
 *      the platform's credit could be spent on a customer list with nobody
 *      deciding to — and no unit test would notice, because the call would
 *      simply work.
 *   2. **A venue never sees its customers' numbers through this feature.** The
 *      list goes to platform staff only, through one audited download.
 *
 * Asserted against source, like `campaigns.test.ts`'s communication-safety
 * block and the three `*-isolation` tests: the risk is not that a call fails,
 * it is that one exists.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (path: string) => readFileSync(path, "utf8");

const BROADCAST_SOURCES = [
  `${here}sms-broadcast.ts`,
  `${here}sms-broadcast-server.ts`,
  `${here}../app/api/sms-broadcasts/route.ts`,
  `${here}../app/api/sms-broadcasts/quote/route.ts`,
  `${here}../app/api/sms-broadcasts/errors.ts`,
  `${here}../app/api/admin/sms-broadcasts/[id]/route.ts`,
  `${here}../app/api/admin/sms-broadcasts/[id]/recipients/route.ts`,
  `${here}../app/dashboard/campaigns/sms.tsx`,
  `${here}../app/admin/sms/page.tsx`,
  `${here}../app/admin/sms/queue.tsx`,
];

/** Anything that could put a broadcast on an SMS line. */
const SENDING = [
  /from\s+["'](?:@\/lib|\.{1,2}(?:\/lib)?)\/sms["']/, // the service entry point
  /from\s+["'][^"']*\/sms\/(?:index|melipayamak|mock)["']/,
  /\bsendTransactional\w*\b/,
  /\bsendByPattern\b/,
  /\bMelipayamakProvider\b/,
  /\bSendSimpleSMS\b/,
  /\bfetch\s*\(/,
];

describe("promotional SMS never touches the SMS API", () => {
  it("no broadcast module can reach a sender", () => {
    for (const file of BROADCAST_SOURCES) {
      const source = read(file);
      for (const pattern of SENDING) {
        expect(pattern.test(source), `${file} matched ${pattern}`).toBe(false);
      }
    }
  });

  /** The free-text envelope was removed; this keeps it from being re-added. */
  it("the SMS transport has no multi-recipient operation", () => {
    const transport = read(`${here}sms/melipayamak.ts`);
    expect(transport).not.toMatch(/envelope\(\s*["']SendSimpleSMS["']/);
    expect(transport).not.toMatch(/\bsendBulk\s*\(/);
  });
});

describe("a venue never receives the recipient list", () => {
  it("the venue's history does not select the numbers", () => {
    const server = read(`${here}sms-broadcast-server.ts`);
    const start = server.indexOf("export async function listVenueBroadcasts");
    const end = server.indexOf("\n}\n", start);
    expect(start, "listVenueBroadcasts not found").toBeGreaterThan(-1);

    const body = server.slice(start, end);
    expect(body).not.toMatch(/\brecipients\s*:/);
  });

  it("the venue's routes are owner-scoped and return no list", () => {
    for (const file of [
      `${here}../app/api/sms-broadcasts/route.ts`,
      `${here}../app/api/sms-broadcasts/quote/route.ts`,
    ]) {
      const source = read(file);
      expect(source, file).toMatch(/requireOwner\(\)/);
      expect(source, file).not.toMatch(/\bphones\b/);
      expect(source, file).not.toMatch(/\.recipients\b/);
    }
  });

  it("only platform staff can download or move a broadcast", () => {
    for (const file of [
      `${here}../app/api/admin/sms-broadcasts/[id]/route.ts`,
      `${here}../app/api/admin/sms-broadcasts/[id]/recipients/route.ts`,
    ]) {
      const source = read(file);
      expect(source, file).toMatch(/await requireAdmin\(\)/);
      expect(source, file).not.toMatch(/requireOwner|requireTenant/);
    }
  });

  /** "Who took a copy of our customers' numbers" must include us. */
  it("every download is written to the venue's audit log", () => {
    const source = read(
      `${here}../app/api/admin/sms-broadcasts/[id]/recipients/route.ts`,
    );
    expect(source).toMatch(/action:\s*"DATA_EXPORTED"/);
    expect(source).toMatch(/restaurantId:\s*broadcast\.restaurantId/);
  });
});
