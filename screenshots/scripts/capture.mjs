/**
 * Screenshots every page a restaurant owner with an active subscription can
 * open, at desktop (1440×900) and mobile (390×844) size, plus the important
 * states inside pages (tabs, dialogs, forms).
 *
 *   node screenshots/scripts/capture.mjs          (from core/)
 *   node screenshots/scripts/capture.mjs menu-    (re-shoot names containing it)
 *
 * Account: the demo chain owner «پیتزا تنور» (09120000013, chain plan — the
 * highest tier, active), from `npm run db:seed:demo`. Nothing is submitted:
 * dialogs and forms are opened and photographed, never saved. Writes
 * screenshots/desktop/*.png, screenshots/mobile/*.png and
 * screenshots/manifest.json (status of every capture).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const core = path.resolve(root, "..");
const require = createRequire(path.join(core, "package.json"));
const { chromium } = require("playwright");

const BASE = process.env.SHOTS_BASE_URL ?? "http://localhost:3000";
const OWNER = { phone: "09120000013", password: "demo1405" };
const SLUG = "pizza-tanoor";
const BRANCH = "pizza-tanoor-vanak";

// Real records of the demo account, looked up before the run.
const IDS = {
  order: process.env.SHOTS_ORDER_ID ?? "dmo000kw10",
  token:
    process.env.SHOTS_ORDER_TOKEN ?? "8785e650eeec3d3ab315cf5ec30850a34bdf2072ee1d6905",
  openTable: process.env.SHOTS_OPEN_TABLE ?? "15",
  closedDay: process.env.SHOTS_CLOSED_DAY ?? "2026-10-09",
};

/** Presentation-only CSS for the camera: no dev badge, no mid-animation frames. */
const CAMERA_CSS = `
  nextjs-portal { display: none !important; }
  *, *::before, *::after {
    animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

// ------------------------------------------------------------------ helpers

async function settle(page) {
  await page.waitForLoadState("load").catch(() => {});
  // The order board and the guest tracker keep a live connection open, so the
  // network is never fully idle there; wait a bounded time for it instead.
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  await page
    .waitForFunction(
      () => document.querySelectorAll(".animate-pulse, [aria-busy='true']").length === 0,
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Lazy images: bring each into view once so it loads, then go back up.
    for (const img of [...document.images]) {
      if (!img.complete) img.loading = "eager";
    }
    await Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", resolve, { once: true });
              setTimeout(resolve, 8_000);
            }),
        ),
    );
  });
  await page.waitForTimeout(500);
}

/** What would make a screenshot worthless: a login page, an error page, a 404. */
async function problemsOn(page) {
  const problems = [];
  const url = page.url();
  if (/\/login(\b|\/|\?|$)/.test(new URL(url).pathname))
    problems.push("redirected to login");
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  if (/خطای سرور|Application error|Internal Server Error/.test(text)) {
    problems.push("error page");
  }
  if (/صفحه پیدا نشد|This page could not be found/.test(text)) problems.push("404 page");
  if (text.trim().length < 20) problems.push("blank page");
  return problems;
}

/**
 * Photographs an open <dialog> in full: the window grows by however much the
 * dialog's body scrolls, so a long form is captured top to bottom, then
 * returns to its size.
 */
async function shootDialog(page, file) {
  const base = page.viewportSize();
  const overflow = () =>
    page.evaluate(() => {
      const body = document.querySelector("dialog[open] .overflow-y-auto");
      return body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0;
    });
  // The panel's height is a share of the window, so one step of growth can
  // fall short; grow until nothing is left to scroll.
  let height = base.height;
  for (let step = 0; step < 6; step += 1) {
    await page.waitForTimeout(step ? 400 : 200);
    const extra = await overflow();
    if (extra <= 1 || height >= 7_000) break;
    height = Math.min(height + extra + 40, 7_000);
    await page.setViewportSize({ width: base.width, height });
  }
  await page.screenshot({ path: file });
  if (height !== base.height) await page.setViewportSize(base);
}

/**
 * A full-page shot paints fixed elements once, at the window's size, so the
 * desktop sidebar would stop after 900px. Pin anything fixed to the top that
 * fills the window's height to the whole page instead (camera only).
 */
async function pinFixedColumns(page) {
  await page.evaluate(() => {
    const full = document.documentElement.scrollHeight;
    if (full <= window.innerHeight) return;
    for (const el of document.querySelectorAll("body *")) {
      const style = getComputedStyle(el);
      if (style.position !== "fixed" || el.offsetWidth === 0) continue;
      const box = el.getBoundingClientRect();
      if (box.top > 1 || Math.abs(box.height - window.innerHeight) > 2) continue;
      if (box.width >= window.innerWidth - 2) continue; // an overlay, not a column
      el.style.position = "absolute";
      el.style.bottom = "auto";
      el.style.height = `${full}px`;
    }
  });
}

// ------------------------------------------------------------------ the list

/**
 * Every capture, in navigation order. `url` opens the page; `then` optionally
 * brings it into a state (a tab, a dialog) and returns "dialog" when the
 * result should be shot as a dialog rather than a full page. `only` limits a
 * capture to one viewport.
 */
const P = [];
const page = (name, title, url, then, only) => P.push({ name, title, url, then, only });

// Dashboard home and orders
page("dashboard", "Dashboard (overview)", "/dashboard");
page(
  "dashboard-mobile-menu",
  "Dashboard — navigation menu open",
  "/dashboard",
  async (p) => {
    await p.getByRole("button", { name: "باز کردن منو" }).click();
    await p.waitForTimeout(400);
    return "overlay";
  },
  "mobile",
);
page("orders-board", "Orders — live order board", "/dashboard/orders");
page(
  "orders-tables-tab",
  "Orders — tables tab (open bills)",
  "/dashboard/orders",
  async (p) => {
    await p.getByRole("tab", { name: "میزها" }).click();
    await p.waitForTimeout(800);
  },
);
page(
  "orders-order-detail",
  "Orders — order detail dialog",
  "/dashboard/orders",
  async (p) => {
    await p.locator('[aria-label^="مشاهدهٔ جزئیات سفارش"]').first().click();
    await p.waitForSelector("dialog[open]");
    await p.waitForTimeout(800);
    return "dialog";
  },
);
page(
  "orders-sold-out",
  "Orders — sold out today dialog",
  "/dashboard/orders",
  async (p) => {
    await p
      .getByRole("button", { name: /^تمام شد/ })
      .first()
      .click();
    await p.waitForSelector("dialog[open]");
    await p.waitForTimeout(600);
    return "dialog";
  },
);
page("orders-manual", "Orders — manual (counter) order", "/dashboard/orders/new");
page("orders-till-close", "Orders — close the till (today)", "/dashboard/orders/close");
page("branches", "Branches (chain console and branch hours)", "/dashboard/branches");

// Menu
page("menu-builder", "Menu builder", "/dashboard/menu");
page(
  "menu-edit-dish",
  "Menu — edit dish dialog (options, recipe, suggestions)",
  "/dashboard/menu",
  async (p) => {
    await p.locator('[aria-label="ویرایش پیتزا پپرونی"]').first().click();
    await p.waitForSelector("dialog[open]");
    await p.waitForTimeout(800);
    return "dialog";
  },
);
page("menu-add-dish", "Menu — add dish dialog", "/dashboard/menu", async (p) => {
  await p.getByRole("button", { name: "افزودن محصول" }).first().click();
  await p.waitForSelector("dialog[open]");
  await p.waitForTimeout(600);
  return "dialog";
});
page(
  "menu-edit-category",
  "Menu — edit category dialog",
  "/dashboard/menu",
  async (p) => {
    await p.locator('[aria-label="ویرایش پیتزای تنوری"]').first().click();
    await p.waitForSelector("dialog[open]");
    await p.waitForTimeout(600);
    return "dialog";
  },
);
page(
  "menu-merchandising",
  "Menu — sales and suggestions (merchandising)",
  "/dashboard/menu/merchandising",
);
page("design", "Menu design editor", "/dashboard/design");
page("qr-codes", "Table QR codes", "/dashboard/qr");

// Reports and finance
page("analytics", "Sales report", "/dashboard/analytics");
page(
  "analytics-tables",
  "Sales report — table performance",
  "/dashboard/analytics/tables",
);
page("finance", "Finance (profit and loss, expenses)", "/dashboard/finance");
page(
  "finance-add-expense",
  "Finance — add expense dialog",
  "/dashboard/finance",
  async (p) => {
    await p.getByRole("button", { name: "ثبت هزینه" }).first().click();
    await p.waitForSelector("dialog[open]");
    await p.waitForTimeout(600);
    return "dialog";
  },
);
page(
  "finance-report",
  "Finance — printable financial report (Shahrivar 1405)",
  "/dashboard/finance/report?preset=month&year=1405&month=6",
);

// Inventory
page("inventory-stock", "Inventory — stock", "/dashboard/inventory");
page(
  "inventory-purchases",
  "Inventory — purchases",
  "/dashboard/inventory?view=purchases",
);
page("inventory-waste", "Inventory — waste", "/dashboard/inventory?view=waste");
page("inventory-count", "Inventory — stocktake", "/dashboard/inventory?view=count");
page(
  "inventory-suppliers",
  "Inventory — suppliers",
  "/dashboard/inventory?view=suppliers",
);
page(
  "inventory-history",
  "Inventory — stock history",
  "/dashboard/inventory?view=history",
);

// Customers and marketing
page("customers", "Customers", "/dashboard/customers");
page(
  "customers-detail",
  "Customers — customer detail dialog",
  "/dashboard/customers",
  async (p) => {
    await p.getByRole("button", { name: "مشاهده" }).first().click();
    await p.waitForSelector("dialog[open]");
    await p.waitForTimeout(1_000);
    return "dialog";
  },
);
page("campaigns", "Campaigns", "/dashboard/campaigns");
page(
  "campaigns-new",
  "Campaigns — new campaign dialog",
  "/dashboard/campaigns",
  async (p) => {
    await p.getByRole("button", { name: "کمپین جدید" }).first().click();
    await p.waitForSelector("dialog[open]");
    await p.waitForTimeout(800);
    return "dialog";
  },
);
page(
  "campaigns-sms",
  "Campaigns — promotional SMS dialog",
  "/dashboard/campaigns",
  async (p) => {
    await p.getByRole("button", { name: "پیامک تبلیغاتی" }).first().click();
    await p.waitForSelector("dialog[open]");
    await p.waitForTimeout(1_000);
    return "dialog";
  },
);

// Account, settings, options
page("subscription", "Subscription", "/dashboard/subscription");
page("settings", "Settings", "/dashboard/settings");
page("options-pricing", "More options — pricing and payment", "/dashboard/options");
page(
  "options-discounts",
  "More options — discount codes",
  "/dashboard/options/discounts",
);
page(
  "options-ingredients",
  "More options — ingredients and recipes",
  "/dashboard/options/inventory",
);
page("options-staff", "More options — staff accounts", "/dashboard/options/staff");
page(
  "options-staff-password",
  "More options — staff: set a new password",
  "/dashboard/options/staff",
  async (p) => {
    await p.getByRole("button", { name: "رمز تازه" }).first().click();
    await p.waitForTimeout(500);
  },
);
page("options-reviews", "More options — guest reviews", "/dashboard/options/reviews");
page("options-support", "More options — support tickets", "/dashboard/options/support");
page("account", "My account (password and phone)", "/dashboard/account");

// Printouts
page(
  "print-bill",
  `Print — guest bill (order ${IDS.order})`,
  `/print/order/${IDS.order}?kind=bill`,
);
page("print-ticket", "Print — kitchen ticket", `/print/order/${IDS.order}?kind=ticket`);
page(
  "print-table-bill",
  `Print — table ${IDS.openTable} combined bill`,
  `/print/table?table=${IDS.openTable}`,
);
page(
  "print-till-close",
  `Print — till close (${IDS.closedDay})`,
  `/print/close?day=${IDS.closedDay}`,
);

// The restaurant's public menu, as guests see it
page("public-menu", "Public menu", `/menu/${SLUG}?table=3`);
page("public-menu-branch", "Public menu — Vanak branch", `/menu/${BRANCH}?table=3`);
page(
  "public-dish-sheet",
  "Public menu — dish detail",
  `/menu/${SLUG}?table=3`,
  async (p) => {
    await p.getByText("پیتزا پپرونی", { exact: true }).first().click();
    await p.waitForTimeout(900);
    return "overlay";
  },
);
/**
 * Puts a dish in the basket and leaves the cart sheet open. This template
 * opens the cart by itself after an add (with its "complete your order"
 * suggestions); a template that does not gets its cart button pressed.
 */
async function openCart(p) {
  await p.getByText("سیب‌زمینی سرخ‌کرده", { exact: true }).first().click();
  await p.waitForTimeout(700);
  await p
    .getByRole("dialog")
    .getByRole("button", { name: /^افزودن/ })
    .last()
    .click();
  await p.waitForTimeout(1_000);
  const decline = p.getByRole("button", { name: "نه، ممنون" });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  const checkout = p.getByRole("dialog").getByRole("button", { name: "ثبت سفارش" });
  if (!(await checkout.isVisible().catch(() => false))) {
    await p.getByRole("button", { name: "سبد خرید" }).first().click();
    await p.waitForTimeout(900);
  }
  return checkout;
}
page(
  "public-cart",
  "Public menu — cart with suggestions",
  `/menu/${SLUG}?table=3`,
  async (p) => {
    await openCart(p);
    return "overlay";
  },
);
page(
  "public-checkout",
  "Public menu — checkout form (not submitted)",
  `/menu/${SLUG}?table=3`,
  async (p) => {
    const checkout = await openCart(p);
    await checkout.click();
    await p.waitForTimeout(900);
    return "overlay";
  },
);
page(
  "public-call-waiter",
  "Public menu — call a waiter",
  `/menu/${SLUG}?table=3`,
  async (p) => {
    await p
      .getByRole("button", { name: /صدا زدن گارسون/ })
      .first()
      .click();
    await p.waitForTimeout(800);
    return "overlay";
  },
);
page(
  "public-order-tracking",
  "Public menu — order tracking and review",
  `/menu/${SLUG}/order/${IDS.token}`,
);
page(
  "public-menu-english",
  "Public menu — English",
  `/menu/${SLUG}?table=3`,
  async (p) => {
    await p.getByRole("button", { name: "نمایش منو به انگلیسی" }).first().click();
    await p.waitForTimeout(1_200);
    await settle(p);
  },
);

// ----------------------------------------------------------------------- run

const ONLY = process.argv[2] ?? "";
const OUT = { desktop: path.join(root, "desktop"), mobile: path.join(root, "mobile") };
const manifestPath = path.join(root, "manifest.json");
for (const dir of Object.values(OUT)) {
  // A partial re-run keeps everything else it did not re-shoot.
  if (!ONLY) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

const browser = await chromium.launch({ channel: "chrome" });
const contextOptions = {
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
  colorScheme: "light",
};

// Sign in once; both viewports reuse the session.
const login = await browser.newContext(contextOptions);
const res = await login.request.post(`${BASE}/api/auth/login`, { data: OWNER });
if (!res.ok()) throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
const storageState = await login.storageState();
await login.close();

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};

const previous =
  ONLY && existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : [];
const manifest = [];
for (const [kind, options] of Object.entries(VIEWPORTS)) {
  let n = 0;
  for (const entry of P) {
    if (entry.only && entry.only !== kind) continue;
    n += 1;
    const file = `${String(n).padStart(2, "0")}-${entry.name}.png`;
    if (ONLY && !entry.name.includes(ONLY)) {
      const kept = previous.find((r) => r.kind === kind && r.file === file);
      if (kept) manifest.push(kept);
      continue;
    }
    const record = {
      kind,
      file,
      title: entry.title,
      url: entry.url,
      status: "ok",
      notes: [],
    };
    // A fresh context per capture: no cart, sheet or language left over from
    // the previous one; the signed-in session is carried in.
    const context = await browser.newContext({
      ...contextOptions,
      ...options,
      storageState,
    });
    await context.addInitScript((css) => {
      window.print = () => {};
      const add = () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.documentElement.appendChild(style);
      };
      if (document.documentElement) add();
      else document.addEventListener("DOMContentLoaded", add);
    }, CAMERA_CSS);
    const tab = await context.newPage();
    const errors = [];
    tab.on("pageerror", (error) =>
      errors.push(`pageerror: ${error.message.split("\n")[0]}`),
    );
    tab.on("response", (response) => {
      const url = response.url();
      if (response.status() >= 400 && url.startsWith(BASE) && !url.includes("favicon")) {
        errors.push(`${response.status()} ${url.replace(BASE, "")}`);
      }
    });
    try {
      const response = await tab.goto(`${BASE}${entry.url}`, {
        waitUntil: "domcontentloaded",
      });
      if (response && response.status() >= 400)
        record.notes.push(`HTTP ${response.status()}`);
      await settle(tab);
      const mode = entry.then ? await entry.then(tab) : undefined;
      const problems = await problemsOn(tab);
      if (problems.length) {
        record.status = "problem";
        record.notes.push(...problems);
      }
      const target = path.join(OUT[kind], file);
      if (mode === "dialog") await shootDialog(tab, target);
      else {
        if (mode !== "overlay") {
          await tab.evaluate(() => window.scrollTo(0, 0));
          await pinFixedColumns(tab);
        }
        // An open sheet or menu is shot at window size; pages and tabs in full.
        await tab.screenshot({ path: target, fullPage: mode !== "overlay" });
      }
    } catch (error) {
      record.status = "failed";
      record.notes.push(error.message.split("\n")[0]);
    }
    if (errors.length) record.notes.push(...errors.slice(0, 5));
    manifest.push(record);
    console.log(
      `${record.status.padEnd(7)} ${kind.padEnd(7)} ${file}${record.notes.length ? "  — " + record.notes.join("; ") : ""}`,
    );
    await context.close();
  }
}
await browser.close();

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
const bad = manifest.filter((r) => r.status !== "ok");
console.log(`\n${manifest.length} captures, ${bad.length} with problems`);
