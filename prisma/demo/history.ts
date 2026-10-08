/**
 * Months of trading for the demo businesses, written the way the application
 * itself writes it, so every screen agrees with every other:
 *
 *   - an order's money is priced by `calculatePrice`, its lines snapshot the
 *     price and cost of the day it was placed, and it is filed under the
 *     business date of its site's hours (an order at 01:30 in a café open until
 *     02:00 belongs to the evening before);
 *   - stock leaves the ordering site's shelf at placement, comes back at the
 *     same cost on cancellation, arrives by purchase invoice at the weighted
 *     average, and is corrected by waste and month-end counts — so the ledger
 *     sums to the shelf;
 *   - a till close is `summariseDay` over that business date's orders, plus
 *     the opening float, against what was counted;
 *   - online payments have their gateway record, subscriptions their receipts.
 *
 * Pure: no database. Deterministic: the same seed text gives the same months.
 */
import type { Prisma } from "../../src/generated/prisma/client";
import { calculatePrice, type PricingOptions } from "../../src/lib/pricing";
import { summariseDay } from "../../src/lib/cash-close";
import { weightedAverage } from "../../src/lib/inventory-ledger";
import {
  businessDateKey,
  cutoffMinute,
  dbDate,
  shiftDateKey,
  type BusinessHours,
} from "../../src/lib/business-day";
import { formatMoney } from "../../src/lib/format";
import type { Basket, DemoBusiness, DemoItem, Profile, Role } from "./catalog";
import { FIRST_NAMES, LAST_NAMES } from "./catalog";

// ---------------------------------------------------------------- random

export type Rand = () => number;

/** mulberry32 seeded from text. */
export function rng(seedText: string): Rand {
  let seed = 0;
  for (const char of seedText) seed = (Math.imul(seed, 31) + char.codePointAt(0)!) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rand: Rand, list: readonly T[]): T =>
  list[Math.floor(rand() * list.length)]!;

export function weighted<T>(
  rand: Rand,
  list: readonly T[],
  weight: (item: T) => number,
): T {
  let total = 0;
  for (const item of list) total += weight(item);
  let roll = rand() * total;
  for (const item of list) {
    roll -= weight(item);
    if (roll < 0) return item;
  }
  return list[list.length - 1]!;
}

const between = (rand: Rand, low: number, high: number) => low + rand() * (high - low);
const int = (rand: Rand, low: number, high: number) =>
  Math.floor(between(rand, low, high + 1));

const HEX = "0123456789abcdef";
export const hexToken = (rand: Rand, length = 48) =>
  Array.from({ length }, () => HEX[Math.floor(rand() * 16)]).join("");

const DIGITS = (rand: Rand, length: number) =>
  Array.from({ length }, () => Math.floor(rand() * 10)).join("");

/** Row ids: short, unique per run, stable across runs. */
let idCounter = 0;
export function nextId(tag: string): string {
  idCounter += 1;
  return `dm${tag}${idCounter.toString(36).padStart(7, "0")}`;
}

// ------------------------------------------------------------------ time

const MINUTE = 60_000;
const DAY = 86_400_000;
/** Tehran has kept +03:30 all year since 2022. */
const TEHRAN = 210 * MINUTE;

export const midnightOf = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - TEHRAN);
};

export const calendarKey = (instant: Date): string =>
  new Date(instant.getTime() + TEHRAN).toISOString().slice(0, 10);

/** Same answer as `businessDateKey`, without Intl, for hot loops. */
export function fastBusinessKey(instant: Date, hours: BusinessHours): string {
  const cutoff = cutoffMinute(hours);
  const key = calendarKey(new Date(instant.getTime() - cutoff * MINUTE));
  return cutoff > hours.start ? shiftDateKey(key, 1) : key;
}

const weekday = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

export const openMinutes = (hours: BusinessHours) =>
  hours.start === hours.end ? 1440 : (hours.end - hours.start + 1440) % 1440;

export const openingOf = (key: string, hours: BusinessHours) =>
  new Date(midnightOf(key).getTime() + hours.start * MINUTE);

export const closingOf = (key: string, hours: BusinessHours) =>
  new Date(openingOf(key, hours).getTime() + openMinutes(hours) * MINUTE);

const PERSIAN_PARTS = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  timeZone: "UTC",
  day: "numeric",
  month: "numeric",
});
const PERSIAN_MONTH = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "UTC",
  month: "long",
});

export function persianDay(key: string): { day: number; month: number; name: string } {
  const date = new Date(`${key}T12:00:00Z`);
  const parts = PERSIAN_PARTS.formatToParts(date);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { day: read("day"), month: read("month"), name: PERSIAN_MONTH.format(date) };
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

/** Busier on Thursday and Friday, the Iranian weekend; quieter early week. */
const WEEKDAY_FACTOR: Record<number, number> = {
  6: 0.92,
  0: 0.86,
  1: 0.9,
  2: 0.95,
  3: 1.06,
  4: 1.38,
  5: 1.28,
};

/** Tasua and Ashura: most venues stay closed. Arbaeen and a few mourning days are quiet. */
const CLOSED_DAYS = new Set(["2026-06-24", "2026-06-25"]);
const QUIET_DAYS: Record<string, number> = {
  "2026-08-03": 0.6,
  "2026-08-12": 0.7,
  "2026-08-14": 0.75,
};

/** Orders by clock hour, before the venue's hours cut them off. */
const HOURLY: Record<Profile, number[]> = {
  // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
  cafe: [0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 5, 5, 5, 5, 5, 5, 6, 8, 10, 10, 9, 7, 4, 1],
  persian: [0, 0, 0, 0, 0, 0, 0, 3, 6, 5, 3, 3, 8, 12, 10, 4, 2, 2, 3, 7, 11, 11, 6, 2],
  fastfood: [6, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 8, 7, 4, 3, 4, 6, 9, 11, 12, 11, 9],
  bistro: [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 7, 4, 2, 2, 3, 6, 10, 12, 10, 6],
  pizza: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 6, 8, 6, 3, 3, 4, 6, 9, 11, 11, 8, 5],
};

/** Minutes from opening to the dish being ready, by kind of kitchen. */
const PREP: Record<Profile, [number, number]> = {
  cafe: [4, 12],
  persian: [14, 28],
  fastfood: [9, 20],
  bistro: [18, 38],
  pizza: [12, 22],
};

const LINE_NOTES: Record<Profile, string[]> = {
  cafe: ["شیر کم‌چرب لطفاً", "داغ‌تر باشد", "بدون شکر", "قهوه جدا"],
  persian: ["گوجه بیشتر", "برنج کمتر", "پیاز اضافه", "کره کنار"],
  fastfood: ["بدون پیاز", "سس جدا", "تند باشد", "بدون خیارشور"],
  bistro: ["بدون گلوتن اگر ممکن است", "سس کنار", "پخت دقیقاً مدیوم"],
  pizza: ["برش هشت‌تکه", "کراست ترد", "سس کچاپ جدا", "پنیر کمتر"],
};

const REVIEW_COMMENTS: Record<number, (string | null)[]> = {
  5: [
    "عالی بود، حتماً دوباره می‌آییم",
    "برخورد پرسنل خیلی خوب بود",
    "بهترین در این محدوده",
    null,
    null,
  ],
  4: ["خوب بود، فقط کمی شلوغ بود", "کیفیت عالی، قیمت کمی بالا", null, null],
  3: ["سرو کمی طول کشید", "معمولی بود", null],
  2: ["غذا سرد رسید", "انتظار بیشتری داشتیم"],
  1: ["سفارش اشتباه آمد"],
};

// ----------------------------------------------------------------- types

export interface Actor {
  id: string;
  phone: string;
  name: string;
  role: "OWNER" | "STAFF" | "BRANCH_MANAGER" | "SUPER_ADMIN";
}

export interface RuntimeChoice {
  name: string;
  price: number;
  cost: number;
  w: number;
}

export interface RuntimeProduct {
  id: string;
  name: string;
  role: Role;
  pop: number;
  price: number;
  cost: number;
  /** Before the menu-wide price rise, about eleven weeks ago. */
  oldPrice: number;
  oldCost: number;
  window: [number, number] | null;
  orderable: boolean;
  groups: { name: string; required: boolean; max: number; choices: RuntimeChoice[] }[];
  recipe: { itemId: string; perUnitMilli: number }[];
  featured: boolean;
}

export interface RuntimeItem {
  id: string;
  spec: DemoItem;
}

export interface Site {
  id: string;
  slug: string;
  hours: BusinessHours;
  /** First instant the site trades. */
  opensAt: Date;
  /** Nothing happens from here on (an expired subscription). */
  until: Date;
  volume: number;
  rampFrom: number;
  rampDays: number;
  tables: string[];
  closer: Actor;
  stockActor: Actor;
  openingCash: number;
  rent: number;
  payroll: number;
  marketing: number;
  maxDailyViews: number;
}

export interface Business {
  spec: DemoBusiness;
  menuOwnerId: string;
  sites: Site[];
  products: RuntimeProduct[];
  items: RuntimeItem[];
  supplierIds: Map<string, string>;
  pricing: PricingOptions;
  /** Price rise day: orders before it carry the old prices. */
  priceRiseAt: Date;
  /** Dish → the dishes suggested under it on the menu. */
  suggestions: Map<string, string[]>;
  now: Date;
}

export interface GeneratedCustomer {
  id: string;
  phone: string;
  name: string;
  consent: boolean;
  createdAt: Date;
}

interface OrderPlan {
  row: Prisma.OrderCreateManyInput & { id: string; placedAt: Date };
  siteId: string;
  businessKey: string;
  consumption: Map<string, number>;
}

export interface History {
  customers: GeneratedCustomer[];
  orders: Prisma.OrderCreateManyInput[];
  items: Prisma.OrderItemCreateManyInput[];
  options: Prisma.OrderItemOptionCreateManyInput[];
  events: Prisma.OrderEventCreateManyInput[];
  payments: Prisma.PaymentCreateManyInput[];
  reviews: Prisma.OrderReviewCreateManyInput[];
  closes: Prisma.DailyCloseCreateManyInput[];
  views: Prisma.MenuDailyViewCreateManyInput[];
  expenses: Prisma.ExpenseCreateManyInput[];
  audits: Prisma.AuditLogCreateManyInput[];
  purchases: Prisma.PurchaseCreateManyInput[];
  purchaseLines: Prisma.PurchaseLineCreateManyInput[];
  stocktakes: Prisma.StocktakeCreateManyInput[];
  stocktakeLines: Prisma.StocktakeLineCreateManyInput[];
  movements: Prisma.StockMovementCreateManyInput[];
  levels: Prisma.StockLevelCreateManyInput[];
  featuredEvents: Prisma.FeaturedProductEventCreateManyInput[];
  suggestionEvents: Prisma.RecommendationEventCreateManyInput[];
  /** Latest price paid per item, for the catalogue's reference price. */
  referencePrices: Map<string, { price: number; at: Date }>;
  sequences: Map<string, number>;
}

const audit = (
  actor: Actor,
  restaurantId: string,
  action: Prisma.AuditLogCreateManyInput["action"],
  summary: string,
  at: Date,
  extra: Partial<Prisma.AuditLogCreateManyInput> = {},
): Prisma.AuditLogCreateManyInput => ({
  id: nextId("a"),
  restaurantId,
  actorUserId: actor.id,
  actorLabel: actor.phone,
  actorRole: actor.role,
  action,
  summary,
  createdAt: at,
  ...extra,
});

// ------------------------------------------------------------- generate

export function generateHistory(business: Business): History {
  const rand = rng(`history:${business.spec.slug}`);
  const history: History = {
    customers: [],
    orders: [],
    items: [],
    options: [],
    events: [],
    payments: [],
    reviews: [],
    closes: [],
    views: [],
    expenses: [],
    audits: [],
    purchases: [],
    purchaseLines: [],
    stocktakes: [],
    stocktakeLines: [],
    movements: [],
    levels: [],
    featuredEvents: [],
    suggestionEvents: [],
    referencePrices: new Map(),
    sequences: new Map(),
  };

  const plansBySite = generateOrders(business, rand, history);
  for (const site of business.sites) {
    const plans = plansBySite.get(site.id) ?? [];
    simulateStock(business, site, plans, rng(`stock:${site.slug}`), history);
    closeTills(business, site, plans, rng(`till:${site.slug}`), history);
    countViews(business, site, plans, rng(`views:${site.slug}`), history);
    recordExpenses(business, site, rng(`expenses:${site.slug}`), history);
  }
  return history;
}

// ---------------------------------------------------------------- orders

interface Customer extends GeneratedCustomer {
  weight: number;
  home: string;
  first: Date | null;
}

let guestNumber = 0;
/** Guests: 0912 001 0000 upwards, clear of the account numbers. */
const nextGuestPhone = () => `0912${String(10_000 + guestNumber++).padStart(7, "0")}`;
export const resetGuestNumbers = () => {
  guestNumber = 0;
};

function dayList(from: Date, to: Date, hours: BusinessHours): string[] {
  const keys: string[] = [];
  let key = fastBusinessKey(from, hours);
  const last = fastBusinessKey(to, hours);
  while (key <= last) {
    keys.push(key);
    key = shiftDateKey(key, 1);
  }
  return keys;
}

function generateOrders(
  business: Business,
  rand: Rand,
  history: History,
): Map<string, OrderPlan[]> {
  const { spec, now } = business;
  const plans = new Map<string, OrderPlan[]>();
  const customers: Customer[] = [];
  const sequence = new Map<string, number>();

  if (spec.volume === 0) return plans;

  // Interleave the sites day by day so the guest book grows in time order.
  const firstOpen = Math.min(...business.sites.map((s) => s.opensAt.getTime()));
  const allKeys = dayList(new Date(firstOpen), now, business.sites[0]!.hours);

  for (const calendar of allKeys) {
    for (const site of business.sites) {
      const key = calendar;
      const opening = openingOf(key, site.hours);
      if (opening.getTime() < site.opensAt.getTime() - DAY / 2) continue;
      if (opening.getTime() >= site.until.getTime()) continue;
      if (CLOSED_DAYS.has(key)) continue;

      const age = (opening.getTime() - site.opensAt.getTime()) / DAY;
      const ramp = Math.min(
        1,
        site.rampFrom + (1 - site.rampFrom) * (age / site.rampDays),
      );
      const count = Math.round(
        site.volume *
          ramp *
          WEEKDAY_FACTOR[weekday(key)]! *
          (QUIET_DAYS[key] ?? 1) *
          between(rand, 0.84, 1.16),
      );

      const { slots, span } = slotsFor(site, spec.profile);
      const offsets: number[] = [];
      for (let n = 0; n < count; n++) {
        // Hour by the profile, minute uniformly within it, inside opening hours.
        const slot = weighted(rand, slots, (s) => s.weight).start;
        const width = Math.max(1, Math.min(60, span - slot - 3));
        offsets.push(slot + Math.floor(rand() * width));
      }
      offsets.sort((a, b) => a - b);

      for (const offset of offsets) {
        const placedAt = new Date(
          opening.getTime() + offset * MINUTE + Math.floor(rand() * 60) * 1000,
        );
        if (placedAt.getTime() > now.getTime() - 2 * MINUTE) continue;
        if (placedAt.getTime() >= site.until.getTime()) continue;
        const next = (sequence.get(site.id) ?? 0) + 1;
        sequence.set(site.id, next);
        const plan = buildOrder(
          business,
          site,
          key,
          placedAt,
          next,
          customers,
          rand,
          history,
        );
        const list = plans.get(site.id) ?? [];
        list.push(plan);
        plans.set(site.id, list);
      }
    }
  }

  for (const [siteId, last] of sequence) history.sequences.set(siteId, last);
  for (const customer of customers) {
    if (!customer.first) continue;
    history.customers.push({
      id: customer.id,
      phone: customer.phone,
      name: customer.name,
      consent: customer.consent,
      createdAt: customer.first,
    });
  }
  return plans;
}

const slotCache = new Map<
  string,
  { slots: { start: number; weight: number }[]; span: number }
>();

/** The opening hours cut into hour slots, weighted by the kind of venue. */
function slotsFor(site: Site, profile: Profile) {
  const cached = slotCache.get(site.id);
  if (cached) return cached;
  const span = openMinutes(site.hours);
  const slots: { start: number; weight: number }[] = [];
  for (let start = 0; start < span; start += 60) {
    const clockHour = Math.floor(((site.hours.start + start) % 1440) / 60);
    slots.push({ start, weight: HOURLY[profile][clockHour]! + 0.05 });
  }
  const result = { slots, span };
  slotCache.set(site.id, result);
  return result;
}

function chooseCustomer(
  site: Site,
  at: Date,
  customers: Customer[],
  rand: Rand,
): Customer {
  const fresh = customers.length < 10 || rand() < 0.2;
  if (!fresh) {
    const chosen = weighted(
      rand,
      customers,
      (c) => c.weight * (c.home === site.id ? 1 : 0.12),
    );
    chosen.first ??= at;
    return chosen;
  }
  // The first few dozen become the regulars; a third of the rest come back.
  const regular = customers.length < 18;
  const customer: Customer = {
    id: nextId("c"),
    phone: nextGuestPhone(),
    name: `${pick(rand, FIRST_NAMES)} ${pick(rand, LAST_NAMES)}`,
    consent: rand() < 0.35,
    createdAt: at,
    weight: regular ? between(rand, 7, 12) : rand() < 0.35 ? between(rand, 0.8, 2) : 0.05,
    home: site.id,
    first: at,
  };
  customers.push(customer);
  return customer;
}

function pickProduct(business: Business, role: Role, minuteOfDay: number, rand: Rand) {
  const candidates = business.products.filter(
    (p) =>
      p.role === role &&
      p.orderable &&
      (!p.window || (minuteOfDay >= p.window[0] && minuteOfDay < p.window[1])),
  );
  if (candidates.length === 0) return null;
  return weighted(rand, candidates, (p) => p.pop);
}

interface Line {
  product: RuntimeProduct;
  choices: { group: string; choice: RuntimeChoice }[];
  quantity: number;
  note: string | null;
  /** Added from the suggestion shown under this dish. */
  recommendedFrom?: string;
  /** Found through the featured strip at the top of the menu. */
  fromFeatured?: boolean;
}

function composeBasket(
  business: Business,
  basket: Basket,
  guests: number,
  minuteOfDay: number,
  rand: Rand,
): Line[] {
  const lines: Line[] = [];
  const add = (role: Role, quantity = 1) => {
    const product = pickProduct(business, role, minuteOfDay, rand);
    if (!product) return false;
    addProduct(product, quantity);
    return true;
  };
  function addProduct(
    product: RuntimeProduct,
    quantity: number,
    extra: Pick<Line, "recommendedFrom"> = {},
  ) {
    const choices: Line["choices"] = [];
    for (const group of product.groups) {
      if (group.required) {
        choices.push({
          group: group.name,
          choice: weighted(rand, group.choices, (c) => c.w),
        });
      } else if (rand() < 0.22) {
        const picks = Math.min(group.max, rand() < 0.8 ? 1 : 2);
        const taken = new Set<string>();
        for (let i = 0; i < picks; i++) {
          const choice = weighted(rand, group.choices, (c) => c.w);
          if (taken.has(choice.name)) continue;
          taken.add(choice.name);
          choices.push({ group: group.name, choice });
        }
      }
    }
    const note = rand() < 0.04 ? pick(rand, LINE_NOTES[business.spec.profile]) : null;
    // Some guests reach a featured dish through the strip at the top.
    const fromFeatured = product.featured && !extra.recommendedFrom && rand() < 0.3;
    lines.push({ product, choices, quantity, note, fromFeatured, ...extra });
  }

  const breakfastNow =
    basket.breakfast !== undefined &&
    business.products.some(
      (p) =>
        p.role === "breakfast" &&
        p.window &&
        minuteOfDay >= p.window[0] &&
        minuteOfDay < p.window[1],
    );

  for (let g = 0; g < guests; g++) {
    if (breakfastNow) {
      if (rand() < basket.breakfast!) add("breakfast");
    } else if (basket.main && rand() < basket.main) add("main");
    if (basket.drink && rand() < basket.drink) add("drink");
    if (basket.dessert && rand() < basket.dessert) add("dessert");
  }
  if (!breakfastNow && basket.side && rand() < basket.side)
    add("side", guests > 3 ? 2 : 1);
  if (basket.retail && rand() < basket.retail) add("retail");
  if (lines.length === 0 && !add(basket.main ? "main" : "drink")) add("drink");

  // Now and then a guest takes the suggestion shown under a dish they chose.
  for (const line of [...lines]) {
    const targets = business.suggestions.get(line.product.id);
    if (!targets || rand() > 0.12) continue;
    const target = business.products.find(
      (p) => p.id === pick(rand, targets) && p.orderable,
    );
    if (!target || lines.some((l) => l.product.id === target.id)) continue;
    addProduct(target, 1, { recommendedFrom: line.product.id });
  }

  // Two of the same dish with the same choices are one line of two.
  const merged = new Map<string, Line>();
  for (const line of lines) {
    const key = `${line.product.id}|${line.choices.map((c) => c.choice.name).join(",")}|${line.note ?? ""}|${line.recommendedFrom ?? ""}|${line.fromFeatured ? 1 : 0}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += line.quantity;
    else merged.set(key, { ...line });
  }
  return [...merged.values()];
}

const BANKS = ["603799", "589210", "610433", "627412", "502229", "627353", "622106"];
const cardPan = (rand: Rand) => `${pick(rand, BANKS)}******${DIGITS(rand, 4)}`;
let authorityCounter = 0;
export const nextAuthority = (rand: Rand) =>
  `A${String(++authorityCounter).padStart(10, "0")}${DIGITS(rand, 25)}`;

function buildOrder(
  business: Business,
  site: Site,
  businessKey: string,
  placedAt: Date,
  orderNumber: number,
  customers: Customer[],
  rand: Rand,
  history: History,
): OrderPlan {
  const { spec, now } = business;
  const shares = spec.shares;
  const minuteOfDay = Math.floor(((placedAt.getTime() + TEHRAN) % DAY) / MINUTE);
  const ageMinutes = (now.getTime() - placedAt.getTime()) / MINUTE;
  const isToday =
    ageMinutes < 24 * 60 && businessKey === fastBusinessKey(now, site.hours);

  const takeaway = spec.settings.takeaway && rand() < shares.takeaway;
  const manual = rand() < shares.manual;
  const online = !manual && spec.settings.onlinePayment && rand() < shares.online;
  const guests = takeaway
    ? weighted(rand, [1, 2, 3], (n) => [6, 3, 1][n - 1]!)
    : weighted(rand, [1, 2, 3, 4, 5, 6], (n) => [24, 40, 15, 14, 5, 2][n - 1]!);
  const lines = composeBasket(business, spec.basket, guests, minuteOfDay, rand);

  const oldPrices = placedAt.getTime() < business.priceRiseAt.getTime();
  const unit = (line: Line) =>
    (oldPrices ? line.product.oldPrice : line.product.price) +
    line.choices.reduce((sum, c) => sum + c.choice.price, 0);
  const unitCost = (line: Line) =>
    (oldPrices ? line.product.oldCost : line.product.cost) +
    line.choices.reduce((sum, c) => sum + c.choice.cost, 0);
  const subtotal = lines.reduce((sum, line) => sum + unit(line) * line.quantity, 0);
  const costTotal = lines.reduce((sum, line) => sum + unitCost(line) * line.quantity, 0);

  const code = spec.settings.discountCode;
  const discounted =
    code && placedAt.getTime() > now.getTime() - code.sinceDaysAgo * DAY && rand() < 0.07;
  const discount = discounted
    ? Math.min(code.max, Math.round((subtotal * code.percent) / 100))
    : 0;
  const tip =
    spec.settings.tip && !takeaway && rand() < 0.12
      ? Math.round((subtotal * (rand() < 0.6 ? 5 : 10)) / 100 / 1000) * 1000
      : 0;
  const price = calculatePrice(subtotal, business.pricing, { discount, tip });

  // Who ordered: online always leaves a number, otherwise some guests do.
  const withPhone = online || (spec.settings.phoneCollection && rand() < shares.phone);
  const customer = withPhone ? chooseCustomer(site, placedAt, customers, rand) : null;

  // How far it got.
  const [prepLow, prepHigh] = PREP[spec.profile];
  const preparingAt = new Date(placedAt.getTime() + int(rand, 1, 4) * MINUTE);
  const readyAt = new Date(preparingAt.getTime() + int(rand, prepLow, prepHigh) * MINUTE);
  const deliveredAt = new Date(readyAt.getTime() + int(rand, 2, 8) * MINUTE);

  type Fate = "served" | "canceled" | "gatewayFailed" | "refunded";
  let fate: Fate = "served";
  const roll = rand();
  if (online && roll < 0.02) fate = "gatewayFailed";
  else if (online && roll < 0.03) fate = "refunded";
  // Paid online and then cancelled: the money goes back, an hour or two later.
  else if (roll < 0.045) fate = online ? "refunded" : "canceled";
  if (isToday && ageMinutes < 12 && fate !== "served") fate = "served";

  let status: "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELED" = "DELIVERED";
  if (fate !== "served") status = "CANCELED";
  else if (deliveredAt.getTime() > now.getTime()) {
    status =
      readyAt.getTime() <= now.getTime()
        ? "READY"
        : preparingAt.getTime() <= now.getTime()
          ? "PREPARING"
          : "RECEIVED";
  }
  const canceledAt =
    status === "CANCELED"
      ? new Date(
          placedAt.getTime() +
            (fate === "gatewayFailed" ? 15 : int(rand, 4, 14)) * MINUTE,
        )
      : null;

  let paymentStatus: "PENDING" | "PAID" | "FAILED" = "PENDING";
  let paidAt: Date | null = null;
  if (fate === "gatewayFailed") paymentStatus = "FAILED";
  else if (online) {
    paymentStatus = "PAID";
    paidAt = new Date(placedAt.getTime() + int(rand, 1, 3) * MINUTE);
  } else if (fate === "served") {
    // Takeaway pays at the counter; tables pay when they leave.
    const at = takeaway
      ? new Date(placedAt.getTime() + MINUTE)
      : new Date(deliveredAt.getTime() + int(rand, 12, 55) * MINUTE);
    if (at.getTime() <= now.getTime()) {
      paymentStatus = "PAID";
      paidAt = at;
    }
  }
  const refundedAt =
    fate === "refunded" && canceledAt
      ? new Date(canceledAt.getTime() + int(rand, 65, 200) * MINUTE)
      : null;

  const id = nextId("o");
  const row: OrderPlan["row"] = {
    id,
    restaurantId: site.id,
    orderNumber,
    publicToken: hexToken(rand),
    tableNumber: takeaway ? null : pick(rand, site.tables),
    customerName: customer?.name ?? (manual ? "مشتری حضوری" : pick(rand, FIRST_NAMES)),
    customerPhone: customer?.phone ?? null,
    customerId: customer?.id ?? null,
    status,
    paymentMethod: online ? "ONLINE" : "CASH_ON_SITE",
    paymentStatus,
    isManual: manual,
    serviceType: takeaway ? "TAKEAWAY" : "DINE_IN",
    subtotal: price.subtotal,
    discount: price.discount,
    discountCode: discounted ? code!.code : null,
    serviceCharge: price.serviceCharge,
    tax: price.tax,
    tip: price.tip,
    roundingAdjustment: price.roundingAdjustment,
    total: price.total,
    costTotal,
    placedAt,
    businessDate: dbDate(businessKey),
    preparingAt: status === "RECEIVED" || fate === "gatewayFailed" ? null : preparingAt,
    readyAt: ["READY", "DELIVERED"].includes(status) ? readyAt : null,
    deliveredAt: status === "DELIVERED" ? deliveredAt : null,
    canceledAt,
    paidAt,
    refundedAt: refundedAt && refundedAt.getTime() <= now.getTime() ? refundedAt : null,
    createdAt: placedAt,
    updatedAt: paidAt ?? canceledAt ?? placedAt,
  };
  if (fate === "canceled" && canceledAt && canceledAt.getTime() < preparingAt.getTime()) {
    row.preparingAt = null;
  }
  history.orders.push(row);

  for (const line of lines) {
    const itemId = nextId("i");
    history.items.push({
      id: itemId,
      orderId: id,
      productId: line.product.id,
      nameSnapshot: line.product.name,
      priceSnapshot: oldPrices ? line.product.oldPrice : line.product.price,
      costSnapshot: oldPrices ? line.product.oldCost : line.product.cost,
      quantity: line.quantity,
      note: line.note,
      recommendedFromProductId: line.recommendedFrom ?? null,
      fromFeatured: line.fromFeatured ?? false,
    });
    line.choices.forEach((c, sortOrder) =>
      history.options.push({
        id: nextId("p"),
        orderItemId: itemId,
        groupNameSnapshot: c.group,
        choiceNameSnapshot: c.choice.name,
        priceDeltaSnapshot: c.choice.price,
        costDeltaSnapshot: c.choice.cost,
        sortOrder,
      }),
    );
  }

  history.events.push({
    id: nextId("e"),
    orderId: id,
    status: "RECEIVED",
    createdAt: placedAt,
  });
  if (row.preparingAt)
    history.events.push({
      id: nextId("e"),
      orderId: id,
      status: "PREPARING",
      createdAt: preparingAt,
    });
  if (row.readyAt)
    history.events.push({
      id: nextId("e"),
      orderId: id,
      status: "READY",
      createdAt: readyAt,
    });
  if (row.deliveredAt)
    history.events.push({
      id: nextId("e"),
      orderId: id,
      status: "DELIVERED",
      createdAt: deliveredAt,
    });
  if (canceledAt)
    history.events.push({
      id: nextId("e"),
      orderId: id,
      status: "CANCELED",
      createdAt: canceledAt,
    });

  if (online) {
    history.payments.push({
      id: nextId("y"),
      restaurantId: site.id,
      purpose: "ORDER",
      orderId: id,
      provider: "zarinpal",
      amount: price.total,
      status: fate === "gatewayFailed" ? "FAILED" : "PAID",
      authority: nextAuthority(rand),
      refId: fate === "gatewayFailed" ? null : DIGITS(rand, 10),
      cardPan: fate === "gatewayFailed" ? null : cardPan(rand),
      failureReason: fate === "gatewayFailed" ? "پرداخت توسط کاربر لغو شد" : null,
      verifiedAt: paidAt,
      createdAt: placedAt,
      updatedAt: paidAt ?? canceledAt ?? placedAt,
    });
  }

  if (row.refundedAt) {
    const actor = site.closer;
    history.audits.push(
      audit(
        actor,
        site.id,
        "ORDER_REFUNDED",
        `بازگشت وجه سفارش شماره ${orderNumber} به مبلغ ${formatMoney(price.total)} تومان ثبت شد`,
        row.refundedAt as Date,
        { entityType: "Order", entityId: id },
      ),
    );
  }

  if (status === "DELIVERED" && rand() < (customer ? 0.09 : 0.03)) {
    const rating = weighted(rand, [5, 4, 3, 2, 1], (r) => [2, 5, 10, 28, 55][r - 1]!);
    const reviewedAt = new Date(deliveredAt.getTime() + int(rand, 20, 150) * MINUTE);
    if (reviewedAt.getTime() < now.getTime()) {
      history.reviews.push({
        id: nextId("r"),
        orderId: id,
        restaurantId: site.id,
        rating,
        comment: pick(rand, REVIEW_COMMENTS[rating]!),
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      });
    }
  }

  if (!manual && now.getTime() - placedAt.getTime() < 90 * DAY) {
    recordBrowsing(business, lines, placedAt, rand, history);
  }

  // What the order takes off the shelf: the recipe of every line.
  const consumption = new Map<string, number>();
  for (const line of lines) {
    for (const ingredient of line.product.recipe) {
      consumption.set(
        ingredient.itemId,
        (consumption.get(ingredient.itemId) ?? 0) +
          ingredient.perUnitMilli * line.quantity,
      );
    }
  }

  return { row, siteId: site.id, businessKey, consumption };
}

// ------------------------------------------------------------ browsing

/**
 * What the menu reported while this guest browsed: the featured strip seen,
 * suggestions shown under the dishes they opened, and the taps that led to
 * the basket. Plus, for about half the orders, someone else who browsed the
 * same menu and left without ordering.
 */
function recordBrowsing(
  business: Business,
  lines: Line[],
  placedAt: Date,
  rand: Rand,
  history: History,
) {
  const restaurantId = business.menuOwnerId;
  const featured = business.products.filter((p) => p.featured);
  const at = (minutes: number) => new Date(placedAt.getTime() - minutes * MINUTE);

  const session = hexToken(rand, 32);
  for (const product of featured) {
    const bought = lines.some((l) => l.product.id === product.id && l.fromFeatured);
    history.featuredEvents.push({
      id: nextId("fe"),
      restaurantId,
      productId: product.id,
      type: "IMPRESSION",
      sessionKey: session,
      createdAt: at(7),
    });
    if (bought || rand() < 0.06) {
      history.featuredEvents.push({
        id: nextId("fe"),
        restaurantId,
        productId: product.id,
        type: "VIEW",
        sessionKey: session,
        createdAt: at(6),
      });
    }
    if (bought) {
      history.featuredEvents.push({
        id: nextId("fe"),
        restaurantId,
        productId: product.id,
        type: "ADD_TO_CART",
        sessionKey: session,
        createdAt: at(5),
      });
    }
  }

  const sources = new Set(lines.map((l) => l.product.id));
  for (const source of sources) {
    for (const target of business.suggestions.get(source) ?? []) {
      const taken = lines.some(
        (l) => l.product.id === target && l.recommendedFrom === source,
      );
      const event = (
        type: "IMPRESSION" | "INTERACTION" | "ADD_TO_CART",
        minutes: number,
      ) =>
        history.suggestionEvents.push({
          id: nextId("re"),
          restaurantId,
          sourceProductId: source,
          recommendedProductId: target,
          type,
          sessionKey: session,
          createdAt: at(minutes),
        });
      event("IMPRESSION", 4);
      if (taken || rand() < 0.1) event("INTERACTION", 3);
      if (taken) event("ADD_TO_CART", 3);
    }
  }

  if (rand() < 0.5) {
    const browser = hexToken(rand, 32);
    const when = at(int(rand, 20, 240));
    for (const product of featured) {
      history.featuredEvents.push({
        id: nextId("fe"),
        restaurantId,
        productId: product.id,
        type: "IMPRESSION",
        sessionKey: browser,
        createdAt: when,
      });
      if (rand() < 0.05) {
        history.featuredEvents.push({
          id: nextId("fe"),
          restaurantId,
          productId: product.id,
          type: "VIEW",
          sessionKey: browser,
          createdAt: new Date(when.getTime() + MINUTE),
        });
      }
    }
  }
}

// ----------------------------------------------------------------- stock

interface Level {
  qty: number;
  avg: number | null;
}

/** What one unit of an item cost at a moment: prices rise ~2.5% a month. */
function priceAt(item: DemoItem, at: Date, now: Date, rand: Rand): number {
  const monthsBefore = (now.getTime() - at.getTime()) / (30 * DAY);
  return item.price * Math.pow(1.025, -monthsBefore) * between(rand, 0.98, 1.02);
}

const PERISHABLE_WASTE: [string, number][] = [
  ["spoiled", 5],
  ["expired", 3],
  ["damaged", 1],
  ["staffMeal", 1],
];
const DRY_WASTE: [string, number][] = [
  ["damaged", 3],
  ["staffMeal", 2],
  ["other", 1],
];

const UNIT_STEP: Record<DemoItem["unit"], number> = {
  kg: 50,
  l: 50,
  g: 1000,
  piece: 1000,
};
const roundTo = (milli: number, step: number) => Math.round(milli / step) * step;

function simulateStock(
  business: Business,
  site: Site,
  plans: OrderPlan[],
  rand: Rand,
  history: History,
) {
  const items = business.items;
  if (items.length === 0 || plans.length === 0) return;
  const { now } = business;
  const end = new Date(Math.min(now.getTime(), site.until.getTime()));
  const keys = dayList(site.opensAt, end, site.hours);
  const dayIndex = new Map(keys.map((key, i) => [key, i]));

  // Exactly what each day will use, so deliveries can be sized like a manager
  // who knows their own trade.
  const need = new Map<string, number[]>(
    items.map((item) => [item.id, keys.map(() => 0)]),
  );
  for (const plan of plans) {
    if (plan.row.status === "CANCELED") continue;
    const index = dayIndex.get(plan.businessKey);
    if (index === undefined) continue;
    for (const [itemId, amount] of plan.consumption) need.get(itemId)![index]! += amount;
  }
  const sumNeed = (itemId: string, from: number, to: number) => {
    const days = need.get(itemId)!;
    let total = 0;
    for (let i = from; i <= Math.min(to, days.length - 1); i++) total += days[i]!;
    return total;
  };

  const levels = new Map<string, Level>(
    items.map((item) => [item.id, { qty: 0, avg: null }]),
  );
  const placedCost = new Map<string, number | null>();
  const actor = site.stockActor;
  const finalWindow = Math.max(0, keys.length - 12);

  const movement = (
    itemId: string,
    deltaMilli: number,
    reason: Prisma.StockMovementCreateManyInput["reason"],
    unitCost: number | null,
    at: Date,
    extra: Partial<Prisma.StockMovementCreateManyInput> = {},
  ) => {
    history.movements.push({
      id: nextId("m"),
      itemId,
      restaurantId: site.id,
      deltaMilli,
      reason,
      unitCost,
      businessDate: dbDate(fastBusinessKey(at, site.hours)),
      createdAt: at,
      ...extra,
    });
  };

  const supplierOffset = (name: string) =>
    [...name].reduce((sum, char) => sum + char.codePointAt(0)!, 0);
  const invoiceNumbers = new Map<string, number>();

  const deliver = (dayIdx: number, at: Date, emergencyOnly: boolean) => {
    const bySupplier = new Map<string, { item: RuntimeItem; milli: number }[]>();
    for (const item of items) {
      const spec = item.spec;
      const level = levels.get(item.id)!;
      const deliveryDay = (dayIdx + supplierOffset(spec.supplier)) % spec.every === 0;
      const low = spec.low * 1000;
      let want = 0;
      if (spec.endLow !== undefined && dayIdx >= finalWindow) {
        // Run this one down: buy only what the rest of the period needs, so
        // it ends below its warning level.
        if (deliveryDay || level.qty < need.get(item.id)![dayIdx]!) {
          want =
            sumNeed(item.id, dayIdx, keys.length - 1) + spec.endLow * 1000 - level.qty;
          if (want > 0) want = Math.ceil(want / 50) * 50;
        }
      } else if (deliveryDay && !emergencyOnly) {
        want = sumNeed(item.id, dayIdx, dayIdx + spec.every) + low - level.qty;
      } else if (level.qty < need.get(item.id)![dayIdx]! + low / 2) {
        // Ran short before the next delivery: an emergency top-up.
        let next = dayIdx + 1;
        while ((next + supplierOffset(spec.supplier)) % spec.every !== 0) next++;
        want = sumNeed(item.id, dayIdx, next) + low - level.qty;
      }
      if (want <= 0) continue;
      const packMilli = spec.pack * 1000;
      const milli =
        spec.endLow !== undefined && dayIdx >= finalWindow
          ? want
          : Math.ceil(want / packMilli) * packMilli;
      const list = bySupplier.get(spec.supplier) ?? [];
      list.push({ item, milli });
      bySupplier.set(spec.supplier, list);
    }

    for (const [supplier, lines] of bySupplier) {
      const purchaseId = nextId("u");
      const invoice =
        (invoiceNumbers.get(supplier) ?? int(rand, 1200, 8800)) + int(rand, 1, 9);
      invoiceNumbers.set(supplier, invoice);
      const priced = lines.map(({ item, milli }) => {
        const units = milli / 1000;
        const lineTotal = Math.max(
          1000,
          Math.round((units * priceAt(item.spec, at, now, rand)) / 1000) * 1000,
        );
        return { item, milli, lineTotal, unitCost: lineTotal / units };
      });
      const total = priced.reduce((sum, line) => sum + line.lineTotal, 0);
      const onCredit =
        business.spec.suppliers
          .find((s) => s.name === supplier)
          ?.note?.includes("تسویه") && now.getTime() - at.getTime() < 15 * DAY;
      history.purchases.push({
        id: purchaseId,
        restaurantId: site.id,
        supplierId: business.supplierIds.get(supplier) ?? null,
        purchasedAt: at,
        invoiceNumber: String(invoice),
        total,
        paymentStatus: onCredit ? "UNPAID" : "PAID",
        paidAt: onCredit ? null : at,
        createdById: actor.id,
        createdByLabel: actor.name,
        createdAt: at,
      });
      for (const line of priced) {
        history.purchaseLines.push({
          id: nextId("l"),
          purchaseId,
          itemId: line.item.id,
          quantityMilli: line.milli,
          unit: line.item.spec.unit,
          lineTotal: line.lineTotal,
        });
        const level = levels.get(line.item.id)!;
        level.avg = weightedAverage(
          { quantityMilli: level.qty, avgCost: level.avg },
          { quantityMilli: line.milli, unitCost: line.unitCost },
        );
        level.qty += line.milli;
        movement(line.item.id, line.milli, "PURCHASE", line.unitCost, at, {
          purchaseId,
          userId: actor.id,
          actorLabel: actor.name,
          note: `#${invoice}`,
        });
        const previous = history.referencePrices.get(line.item.id);
        if (!previous || previous.at.getTime() <= at.getTime()) {
          history.referencePrices.set(line.item.id, {
            price: Math.round(line.unitCost),
            at,
          });
        }
      }
      history.audits.push(
        audit(
          actor,
          site.id,
          "PURCHASE_RECORDED",
          `خرید ${formatMoney(total)} تومان ثبت شد (${priced.length} قلم)`,
          at,
          { entityType: "Purchase", entityId: purchaseId },
        ),
      );
    }
  };

  // Opening stock: what the first days need, at the prices of the time.
  const openingAt = new Date(site.opensAt.getTime() - 2 * 60 * MINUTE);
  for (const item of items) {
    const spec = item.spec;
    const milli =
      Math.ceil(
        (sumNeed(item.id, 0, spec.every) + spec.low * 1000) / (spec.pack * 1000),
      ) *
      spec.pack *
      1000;
    const cost = priceAt(spec, openingAt, now, rand);
    levels.set(item.id, { qty: milli, avg: cost });
    movement(item.id, milli, "OPENING", cost, openingAt, {
      userId: actor.id,
      actorLabel: actor.name,
      note: "موجودی اول دوره",
    });
  }

  // Everything that moves stock, in time order.
  type Event =
    | { at: number; kind: "morning"; day: number }
    | { at: number; kind: "evening"; day: number }
    | { at: number; kind: "placed"; plan: OrderPlan }
    | { at: number; kind: "canceled"; plan: OrderPlan };
  const events: Event[] = [];
  keys.forEach((key, day) => {
    const opening = openingOf(key, site.hours);
    if (day > 0)
      events.push({ at: opening.getTime() - 90 * MINUTE, kind: "morning", day });
    events.push({
      at: closingOf(key, site.hours).getTime() + 10 * MINUTE,
      kind: "evening",
      day,
    });
  });
  for (const plan of plans) {
    if (plan.consumption.size === 0) continue;
    events.push({ at: (plan.row.placedAt as Date).getTime(), kind: "placed", plan });
    if (plan.row.canceledAt)
      events.push({
        at: (plan.row.canceledAt as Date).getTime(),
        kind: "canceled",
        plan,
      });
  }
  const order = { morning: 0, placed: 1, canceled: 2, evening: 3 };
  events.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]);

  for (const event of events) {
    const at = new Date(event.at);
    if (event.at > end.getTime()) continue;

    if (event.kind === "morning") {
      deliver(event.day, at, false);
      continue;
    }

    if (event.kind === "placed") {
      for (const [itemId, amount] of event.plan.consumption) {
        const level = levels.get(itemId)!;
        placedCost.set(`${event.plan.row.id}:${itemId}`, level.avg);
        level.qty -= amount;
        movement(itemId, -amount, "ORDER_PLACED", level.avg, at, {
          orderId: event.plan.row.id,
        });
      }
      continue;
    }

    if (event.kind === "canceled") {
      for (const [itemId, amount] of event.plan.consumption) {
        const level = levels.get(itemId)!;
        const cost = placedCost.get(`${event.plan.row.id}:${itemId}`) ?? level.avg;
        if (cost !== null) {
          level.avg = weightedAverage(
            { quantityMilli: level.qty, avgCost: level.avg },
            { quantityMilli: amount, unitCost: cost },
          );
        }
        level.qty += amount;
        movement(itemId, amount, "ORDER_CANCELED", cost, at, {
          orderId: event.plan.row.id,
        });
      }
      continue;
    }

    // Evening: now and then something is thrown away; at month end, a count.
    const inFinal = event.day >= finalWindow;
    if (rand() < 0.3) {
      const candidates = items.filter(
        (item) =>
          !(item.spec.endLow !== undefined && inFinal) &&
          levels.get(item.id)!.qty > item.spec.low * 1000,
      );
      if (candidates.length > 0) {
        const item = weighted(rand, candidates, (i) => (i.spec.perishable ? 4 : 1));
        const level = levels.get(item.id)!;
        const step = UNIT_STEP[item.spec.unit];
        const share = between(rand, 0.03, 0.12);
        const milli = Math.max(step, roundTo(level.qty * share, step));
        if (milli < level.qty - item.spec.low * 500) {
          const reason = item.spec.perishable
            ? weighted(rand, PERISHABLE_WASTE, ([, w]) => w)[0]
            : weighted(rand, DRY_WASTE, ([, w]) => w)[0];
          level.qty -= milli;
          const wasteAt = new Date(at.getTime() - 30 * MINUTE);
          movement(item.id, -milli, "WASTE", level.avg, wasteAt, {
            wasteReason: reason,
            userId: actor.id,
            actorLabel: actor.name,
          });
          history.audits.push(
            audit(
              actor,
              site.id,
              "STOCK_WASTED",
              `ضایعات «${item.spec.name}» به ارزش ${formatMoney(Math.round((milli / 1000) * (level.avg ?? 0)))} تومان ثبت شد`,
              wasteAt,
              { entityType: "InventoryItem", entityId: item.id },
            ),
          );
        }
      }
    }

    const key = keys[event.day]!;
    const monthEnds = persianDay(shiftDateKey(key, 1)).day === 1;
    if (monthEnds && event.day < keys.length - 1) {
      const stocktakeId = nextId("k");
      let shortage = 0;
      let surplus = 0;
      const counted: {
        item: RuntimeItem;
        expected: number;
        counted: number;
        cost: number | null;
      }[] = [];
      for (const item of items) {
        const level = levels.get(item.id)!;
        const step = UNIT_STEP[item.spec.unit];
        let found = level.qty;
        if (!(item.spec.endLow !== undefined && inFinal)) {
          if (item.spec.unit === "piece") {
            const r = rand();
            found = level.qty + (r < 0.7 ? 0 : r < 0.95 ? -int(rand, 1, 2) * 1000 : 1000);
          } else if (item.spec.perishable && rand() < 0.7) {
            found = level.qty * (1 - between(rand, 0.005, 0.03));
          } else if (rand() < 0.3) {
            found = level.qty * (1 - between(rand, 0, 0.015));
          }
        }
        found = Math.max(0, roundTo(found, step));
        counted.push({ item, expected: level.qty, counted: found, cost: level.avg });
      }
      history.stocktakes.push({
        id: stocktakeId,
        restaurantId: site.id,
        note: `انبارگردانی پایان ${persianDay(key).name}`,
        createdById: actor.id,
        createdByLabel: actor.name,
        postedAt: at,
      });
      for (const line of counted) {
        history.stocktakeLines.push({
          id: nextId("t"),
          stocktakeId,
          itemId: line.item.id,
          expectedMilli: line.expected,
          countedMilli: line.counted,
          unitCost: line.cost,
        });
        const delta = line.counted - line.expected;
        if (delta === 0) continue;
        const value = Math.round((Math.abs(delta) / 1000) * (line.cost ?? 0));
        if (delta < 0) shortage += value;
        else surplus += value;
        levels.get(line.item.id)!.qty = line.counted;
        movement(line.item.id, delta, "STOCKTAKE", line.cost, at, {
          stocktakeId,
          userId: actor.id,
          actorLabel: actor.name,
        });
      }
      history.audits.push(
        audit(
          actor,
          site.id,
          "STOCKTAKE_POSTED",
          `انبارگردانی ثبت شد: کسری ${formatMoney(shortage)} و مازاد ${formatMoney(surplus)} تومان`,
          at,
          { entityType: "Stocktake", entityId: stocktakeId },
        ),
      );
    }
  }

  for (const item of items) {
    const level = levels.get(item.id)!;
    history.levels.push({
      id: nextId("v"),
      itemId: item.id,
      restaurantId: site.id,
      quantityMilli: level.qty,
      avgCost: level.avg,
    });
  }
}

// ------------------------------------------------------------------ till

function closeTills(
  business: Business,
  site: Site,
  plans: OrderPlan[],
  rand: Rand,
  history: History,
) {
  const { now } = business;
  const byDay = new Map<string, OrderPlan[]>();
  for (const plan of plans) {
    const list = byDay.get(plan.businessKey) ?? [];
    list.push(plan);
    byDay.set(plan.businessKey, list);
  }
  const recent = shiftDateKey(fastBusinessKey(now, site.hours), -7);

  for (const [key, list] of byDay) {
    const closedAt = new Date(
      closingOf(key, site.hours).getTime() + int(rand, 12, 40) * MINUTE,
    );
    if (closedAt.getTime() > now.getTime()) continue;
    if (closedAt.getTime() > site.until.getTime()) continue;
    // Now and then nobody counted — but always the last week.
    if (key < recent && rand() < 0.03) continue;

    const summary = summariseDay(
      list.map(({ row }) => ({
        status: row.status as string,
        paymentMethod: row.paymentMethod as string,
        paymentStatus: row.paymentStatus as string,
        total: row.total,
        discount: row.discount ?? 0,
        tip: row.tip ?? 0,
        tax: row.tax ?? 0,
        serviceCharge: row.serviceCharge ?? 0,
        refundedAt: (row.refundedAt as Date | null) ?? null,
      })),
    );
    const expectedCash = site.openingCash + summary.expectedCash;
    const r = rand();
    const difference =
      r < 0.84 ? 0 : r < 0.95 ? -int(rand, 1, 30) * 5_000 : int(rand, 1, 8) * 5_000;
    const countedCash = expectedCash + difference;
    const note =
      difference < -100_000
        ? "کسری بررسی شد؛ یک کارت‌خوان دوبار ثبت شده بود"
        : difference > 0
          ? "اضافی: انعام نقدی ثبت‌نشده"
          : null;

    history.closes.push({
      id: nextId("d"),
      restaurantId: site.id,
      day: midnightOf(key),
      summary: summary as unknown as Prisma.InputJsonValue,
      openingCash: site.openingCash,
      expectedCash,
      countedCash,
      difference,
      note,
      closedById: site.closer.id,
      closedByLabel: site.closer.phone,
      closedAt,
      updatedAt: closedAt,
    });
    const sign = difference === 0 ? "" : difference > 0 ? " (اضافه)" : " (کسری)";
    history.audits.push(
      audit(
        site.closer,
        site.id,
        "DAY_CLOSED",
        `بستن صندوق ${key}: شمارش ${formatMoney(countedCash)}، انتظار ${formatMoney(expectedCash)}، اختلاف ${formatMoney(Math.abs(difference))} تومان${sign}`,
        closedAt,
        {
          entityType: "DailyClose",
          entityId: key,
          metadata: {
            openingCash: site.openingCash,
            expectedCash,
            countedCash,
            difference,
          },
        },
      ),
    );
  }
}

// ----------------------------------------------------------------- views

function countViews(
  business: Business,
  site: Site,
  plans: OrderPlan[],
  rand: Rand,
  history: History,
) {
  const { now } = business;
  // Menu opens counted per calendar day and table, like the live counter.
  const perDay = new Map<string, Map<string, number>>();
  for (const plan of plans) {
    const day = calendarKey(plan.row.placedAt as Date);
    const tables = perDay.get(day) ?? new Map<string, number>();
    const table = (plan.row.tableNumber as string | null) ?? "";
    tables.set(table, (tables.get(table) ?? 0) + 1);
    perDay.set(day, tables);
  }
  if (business.spec.volume === 0) {
    // A menu-only venue: guests read the menu, nobody orders through it.
    let key = calendarKey(site.opensAt);
    const today = calendarKey(now);
    while (key <= today) {
      perDay.set(key, new Map([["", int(rand, 25, 70)]]));
      key = shiftDateKey(key, 1);
    }
  }

  for (const [day, tables] of perDay) {
    if (midnightOf(day).getTime() >= site.until.getTime()) continue;
    let budget = site.maxDailyViews > 0 ? site.maxDailyViews - 10 : Infinity;
    const browsing = int(rand, 8, 30);
    const rows: [string, number][] = [["", (tables.get("") ?? 0) * 2 + browsing]];
    for (const [table, orders] of tables) {
      if (table === "") continue;
      rows.push([table, Math.round(orders * between(rand, 2.2, 3.6))]);
    }
    for (const [table, raw] of rows) {
      const count = Math.max(0, Math.min(raw, budget));
      budget -= count;
      if (count === 0) continue;
      history.views.push({
        id: nextId("w"),
        restaurantId: site.id,
        tableNumber: table,
        day: midnightOf(day),
        count,
        createdAt: midnightOf(day),
        updatedAt: midnightOf(day),
      });
    }
  }
}

// -------------------------------------------------------------- expenses

function recordExpenses(business: Business, site: Site, rand: Rand, history: History) {
  if (site.rent === 0) return;
  const { now } = business;
  const first = calendarKey(site.opensAt);
  const last = calendarKey(new Date(Math.min(now.getTime(), site.until.getTime())));
  const add = (
    key: string,
    title: string,
    category: string,
    amount: number,
    isRecurring = false,
    note: string | null = null,
  ) => {
    const at = midnightOf(key);
    history.expenses.push({
      id: nextId("x"),
      restaurantId: site.id,
      title,
      category,
      amount: Math.round(amount / 1000) * 1000,
      note,
      occurredAt: at,
      isRecurring,
      createdAt: new Date(at.getTime() + 11 * 60 * MINUTE),
      updatedAt: new Date(at.getTime() + 11 * 60 * MINUTE),
    });
  };

  const packaging = ["fastfood", "pizza"].includes(business.spec.profile);
  let key = first;
  let repairs = 0;
  while (key <= last) {
    const { day, month, name } = persianDay(key);
    const nextIsFirst = persianDay(shiftDateKey(key, 1)).day === 1;
    if (day === 1) add(key, `اجارهٔ ${name}`, "rent", site.rent, true);
    if (nextIsFirst && key < last)
      add(key, `حقوق پرسنل ${name}`, "salary", site.payroll, true);
    if (day === 8) {
      // Air conditioning: summer electricity bills are the heavy ones.
      const summer = month >= 3 && month <= 6;
      add(
        key,
        `قبض برق ${name}`,
        "utilities",
        (site.rent / 12) * (summer ? 1.7 : 1) * between(rand, 0.9, 1.1),
      );
      add(
        key,
        `قبض آب و گاز ${name}`,
        "utilities",
        (site.rent / 40) * between(rand, 0.85, 1.15),
      );
      add(key, `اینترنت و تلفن ${name}`, "utilities", 1_800_000);
    }
    if (day === 4 || day === 14 || day === 24) {
      add(
        key,
        packaging ? "ظروف یکبار مصرف و بسته‌بندی" : "مواد شوینده و ملزومات",
        "supplies",
        (packaging ? 9_000_000 : 3_500_000) * between(rand, 0.8, 1.25),
      );
    }
    if (day === 3 && site.marketing > 0) {
      add(
        key,
        `تبلیغات اینستاگرام ${name}`,
        "marketing",
        site.marketing * between(rand, 0.8, 1.2),
      );
    }
    if (day === 20)
      add(key, "کارمزد کارت‌خوان و بانک", "other", between(rand, 1_200_000, 2_600_000));
    if (repairs < 2 && rand() < 0.012) {
      repairs += 1;
      const [title, amount] = pick(rand, [
        ["تعمیر یخچال ایستاده", 14_000_000],
        ["سرویس هود و کانال آشپزخانه", 9_500_000],
        ["تعمیر دستگاه اسپرسو", 7_800_000],
        ["تعویض لامپ‌ها و سیم‌کشی سالن", 6_200_000],
      ] as const);
      add(key, title, "other", amount);
    }
    key = shiftDateKey(key, 1);
  }
}

/** Exported for the self-check in the seed. */
export { businessDateKey };
