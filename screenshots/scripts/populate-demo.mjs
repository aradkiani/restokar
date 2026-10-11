/**
 * Gives the demo chain owner «پیتزا تنور» the few things the demo seed leaves
 * empty — discount codes and marketing campaigns — so those pages are not
 * blank in the screenshots, and turns on its English menu and the checkout's
 * discount-code field. Goes through the app's own API, as the owner, on
 * the local dev server only; safe to run twice.
 *
 *   node screenshots/scripts/populate-demo.mjs      (from core/)
 *
 * A fresh `npm run db:seed:demo` removes them again.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../package.json"));
const { request } = require("playwright");

const BASE = process.env.SHOTS_BASE_URL ?? "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  throw new Error(`refusing to write demo data to ${BASE}`);
}

const api = await request.newContext({ baseURL: BASE });
const login = await api.post("/api/auth/login", {
  data: { phone: "09120000013", password: "demo1405" },
});
if (!login.ok()) throw new Error(`sign-in failed: ${login.status()}`);

const CODES = [
  { code: "WELCOME10", type: "PERCENT", value: 10, maxDiscount: 100_000 },
  { code: "TANOOR50", type: "FIXED", value: 50_000 },
  { code: "STUDENT15", type: "PERCENT", value: 15, maxDiscount: 80_000 },
  { code: "SUMMER20", type: "PERCENT", value: 20, isActive: false },
];
for (const code of CODES) {
  const res = await api.post("/api/discounts", { data: code });
  console.log(`discount ${code.code}: ${res.status()}`);
}

const existing = await api.get("/api/campaigns?pageSize=100");
const body = await existing.json();
const rows = body.data?.items ?? body.data?.campaigns ?? body.data ?? [];
const have = new Set((Array.isArray(rows) ? rows : []).map((c) => c.name));

const CAMPAIGNS = [
  {
    data: {
      name: "بازگشت مشتریان قدیمی",
      targetSegment: "atRisk",
      startsAt: "2026-10-01T00:00",
      endsAt: "2026-10-31T23:59",
    },
    status: "ACTIVE",
  },
  {
    data: {
      name: "خوش‌آمد مشتریان تازه",
      targetSegment: "new",
      startsAt: "2026-10-15T00:00",
      endsAt: "2026-11-15T23:59",
    },
    status: "SCHEDULED",
  },
  {
    data: {
      name: "قدردانی از مشتریان وفادار",
      targetSegment: "loyal",
      startsAt: "2026-09-01T00:00",
      endsAt: "2026-09-30T23:59",
    },
    status: "ACTIVE",
    then: "COMPLETED",
  },
  {
    data: {
      name: "پیشنهاد شب یلدا",
      targetSegment: "returning",
      startsAt: "2026-12-18T00:00",
      endsAt: "2026-12-21T23:59",
    },
  },
];
for (const { data, status, then } of CAMPAIGNS) {
  if (have.has(data.name)) {
    console.log(`campaign ${data.name}: already there`);
    continue;
  }
  const res = await api.post("/api/campaigns", { data });
  const created = await res.json();
  console.log(
    `campaign ${data.name}: ${res.status()}${res.ok() ? "" : " " + JSON.stringify(created)}`,
  );
  const id = created.data?.id;
  for (const next of [status, then].filter(Boolean)) {
    if (!id) break;
    const move = await api.post(`/api/campaigns/${id}/status`, {
      data: { status: next },
    });
    console.log(`  → ${next}: ${move.status()}`);
  }
}
// The English menu and the checkout's discount-code field are off in the
// seed; switch both on so the public menu shows its language button and the
// codes above can be used. Only these fields are sent (the schema has no
// defaults, so nothing else changes).
const options = await api.patch("/api/settings/options", {
  data: { bilingualEnabled: true, discountCodesEnabled: true },
});
console.log(`english menu + discount field on: ${options.status()}`);

await api.dispose();
