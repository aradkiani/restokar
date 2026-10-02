/**
 * Launch-readiness fixtures: a small, realistic set of venues that covers every
 * plan and every subscription state the product has to handle, for the
 * end-to-end journeys in `e2e/`.
 *
 *   npm run db:seed:launch            # create what is missing, keep the rest
 *   npm run db:seed:launch -- --reset # delete these venues and rebuild them
 *
 * What it creates (each venue owns its staff, menu, tables, stock and history):
 *
 *   cafe-narenj     tier-small  ACTIVE     café, options, recipes, souvenirs,
 *                                           exactly 10 tables = the plan's limit
 *   dizi-sara       tier-medium ACTIVE     Persian restaurant, tax on, a
 *                                           breakfast category with a time window
 *   fastfood-tond   tier-large  ACTIVE     fast food, online payment on
 *   cafe-baran      tier-small  TRIALING   trial ends in 2 days; menu-only
 *                                           (online ordering off)
 *   cafe-ghadimi    tier-small  EXPIRED    period ended 9 days ago
 *   pizza-noon      tier-chain  ACTIVE     chain head with two branches
 *     pizza-noon-vanak, pizza-noon-tajrish  branch managers, own orders
 *
 * Deterministic: a seeded generator, so two runs produce the same menus,
 * orders and numbers, and a test can rely on them. Safe to re-run: without
 * `--reset` an existing venue is left exactly as it is. With `--reset` only
 * the slugs listed here (and their own accounts) are removed — nothing else in
 * the database is read for deletion.
 *
 * Product photos are generated placeholders (flat colour), written to
 * DATA_DIR/uploads like real uploads. Real photos must come from the venues.
 */
// MUST be first: refuses to run against anything but a local development
// database, before the client below is constructed.
import "./demo-seed-guard";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { devPhone } from "./dev-phones";
import {
  CAFE_MENU,
  CUSTOMER_NAMES,
  PERSIAN_MENU,
  RESTAURANT_MENU,
  SOUVENIR_MENU,
  type SeedCategory,
} from "./menu-data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });

const RESET = process.argv.includes("--reset");

// ------------------------------------------------------------------ helpers

/** mulberry32 — small, fast, and the same sequence for the same seed. */
function rng(seedText: string) {
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

type Rand = () => number;
const pick = <T>(rand: Rand, list: readonly T[]): T =>
  list[Math.floor(rand() * list.length)]!;

/** Tehran has had no daylight saving since 2022; the offset is fixed. */
const TEHRAN_OFFSET_MS = 210 * 60_000;

/** A wall-clock time in Tehran, `daysAgo` trading days back from today. */
function tehranTime(daysAgo: number, hour: number, minute: number): Date {
  const local = new Date(Date.now() + TEHRAN_OFFSET_MS);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() - daysAgo,
      hour,
      minute,
    ) - TEHRAN_OFFSET_MS,
  );
}

function tehranHourNow(): number {
  return new Date(Date.now() + TEHRAN_OFFSET_MS).getUTCHours();
}

const DAY_MS = 86_400_000;

// ------------------------------------------------------------ placeholder PNG

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 480×320 PNG fading top to bottom between two colours. */
function placeholderPng(top: [number, number, number], bottom: [number, number, number]) {
  const width = 480;
  const height = 320;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const rgb = top.map((value, i) => Math.round(value + (bottom[i]! - value) * t));
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = rgb[0]!;
      raw[row + 2 + x * 3] = rgb[1]!;
      raw[row + 3 + x * 3] = rgb[2]!;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PALETTE: [number, number, number][][] = [
  [
    [196, 120, 64],
    [92, 52, 28],
  ],
  [
    [214, 168, 92],
    [140, 84, 40],
  ],
  [
    [118, 140, 92],
    [52, 72, 44],
  ],
  [
    [170, 74, 58],
    [96, 34, 28],
  ],
  [
    [88, 112, 140],
    [36, 48, 68],
  ],
];

const DATA_ROOT = path.resolve(process.env.DATA_DIR ?? "./data");

function writeImage(restaurantId: string, name: string, index: number): string {
  const dir = path.join(DATA_ROOT, "uploads", restaurantId);
  mkdirSync(dir, { recursive: true });
  const [top, bottom] = PALETTE[index % PALETTE.length]!;
  const file = `${name}.png`;
  writeFileSync(path.join(dir, file), placeholderPng(top!, bottom!));
  return `/uploads/${restaurantId}/${file}`;
}

// -------------------------------------------------------------------- specs

interface OptionSpec {
  name: string;
  required: boolean;
  max: number;
  choices: { name: string; price: number; cost: number }[];
}

interface StockSpec {
  name: string;
  unit: string;
  /** Opening stock in whole units of `unit`. */
  opening: number;
  low: number;
  price: number;
  priceUnit: string;
}

interface StaffSpec {
  key: string;
  name: string;
  tabs: string[];
}

interface BranchSpec {
  slug: string;
  name: string;
  managerKey: string;
  managerName: string;
  ordersPerDay: number;
}

interface VenueSpec {
  slug: string;
  name: string;
  nameEn: string;
  tagline: string;
  address: string;
  ownerName: string;
  templateId: string;
  theme: Record<string, string>;
  planCode: string;
  subscription: {
    status: "ACTIVE" | "TRIALING" | "EXPIRED";
    interval: string;
    endsInDays: number;
  };
  tables: number;
  menu: SeedCategory[];
  /** Product name → option groups. */
  options: Record<string, OptionSpec[]>;
  stock: StockSpec[];
  /** Product name → [stock item name, amount per serving in the item's unit]. */
  recipes: Record<string, [string, number][]>;
  staff: StaffSpec[];
  ordersPerDay: number;
  historyDays: number;
  onlineOrdering: boolean;
  onlinePayment: boolean;
  tax: number;
  breakfastWindow?: boolean;
  branches?: BranchSpec[];
}

const SIZE: OptionSpec = {
  name: "اندازه",
  required: true,
  max: 1,
  choices: [
    { name: "معمولی", price: 0, cost: 0 },
    { name: "بزرگ", price: 25_000, cost: 8_000 },
  ],
};

const MILK: OptionSpec = {
  name: "نوع شیر",
  required: false,
  max: 1,
  choices: [
    { name: "شیر بادام", price: 30_000, cost: 14_000 },
    { name: "شیر بدون لاکتوز", price: 20_000, cost: 9_000 },
  ],
};

const EXTRAS: OptionSpec = {
  name: "افزودنی‌ها",
  required: false,
  max: 3,
  choices: [
    { name: "پنیر اضافه", price: 45_000, cost: 18_000 },
    { name: "قارچ", price: 30_000, cost: 10_000 },
    { name: "هالوپینو", price: 25_000, cost: 8_000 },
  ],
};

const BREAKFAST: SeedCategory = {
  name: "صبحانه",
  nameEn: "Breakfast",
  icon: "coffee",
  products: [
    {
      name: "املت گوجه",
      nameEn: "Tomato omelette",
      short: "با نان سنگک تازه",
      full: "املت گوجه‌فرنگی با کره محلی، همراه نان سنگک و سبزی.",
      price: 145_000,
      cost: 52_000,
      info: [],
    },
    {
      name: "کله‌پاچه",
      nameEn: "Kaleh pacheh",
      short: "فقط صبح‌ها",
      full: "کله‌پاچه با آب‌لیمو و دارچین، فقط تا ساعت ۱۱ صبح.",
      price: 420_000,
      cost: 190_000,
      info: [],
    },
  ],
};

const VENUES: VenueSpec[] = [
  {
    slug: "cafe-narenj",
    name: "کافه نارنج",
    nameEn: "Narenj Café",
    tagline: "قهوهٔ دمی و کیک خانگی، در کوچه‌باغ",
    address: "شیراز، خیابان زند، کوچه ۱۲",
    ownerName: "مریم کاظمی",
    templateId: "bazaar",
    theme: { primary: "#c2410c", secondary: "#166534" },
    planCode: "tier-small",
    subscription: { status: "ACTIVE", interval: "monthly", endsInDays: 20 },
    tables: 10,
    menu: [...CAFE_MENU, ...SOUVENIR_MENU],
    options: { لاته: [SIZE, MILK], کاپوچینو: [SIZE, MILK], اسپرسو: [SIZE] },
    stock: [
      {
        name: "دانه قهوه",
        unit: "kg",
        opening: 6,
        low: 1.5,
        price: 1_800_000,
        priceUnit: "kg",
      },
      { name: "شیر", unit: "l", opening: 24, low: 5, price: 62_000, priceUnit: "l" },
      {
        name: "شکلات تلخ",
        unit: "kg",
        opening: 0.4,
        low: 0.5,
        price: 950_000,
        priceUnit: "kg",
      },
    ],
    recipes: {
      اسپرسو: [["دانه قهوه", 0.018]],
      لاته: [
        ["دانه قهوه", 0.018],
        ["شیر", 0.2],
      ],
      کاپوچینو: [
        ["دانه قهوه", 0.018],
        ["شیر", 0.15],
      ],
    },
    staff: [
      { key: "barista", name: "علی رضایی", tabs: ["orders"] },
      { key: "menu", name: "نگین احمدی", tabs: ["menu", "design"] },
    ],
    ordersPerDay: 14,
    historyDays: 30,
    onlineOrdering: true,
    onlinePayment: false,
    tax: 0,
  },
  {
    slug: "dizi-sara",
    name: "دیزی‌سرای بهارستان",
    nameEn: "Baharestan Dizi House",
    tagline: "دیزی سنگی و کباب ذغالی از ۱۳۵۸",
    address: "تهران، میدان بهارستان، جنب پاساژ",
    ownerName: "حسن نوروزی",
    templateId: "qalam",
    theme: { primary: "#7c2d12", secondary: "#a16207" },
    planCode: "tier-medium",
    subscription: { status: "ACTIVE", interval: "yearly", endsInDays: 210 },
    tables: 18,
    menu: [BREAKFAST, ...PERSIAN_MENU],
    options: {},
    stock: [
      {
        name: "گوشت گوسفندی",
        unit: "kg",
        opening: 30,
        low: 8,
        price: 1_250_000,
        priceUnit: "kg",
      },
      {
        name: "برنج ایرانی",
        unit: "kg",
        opening: 40,
        low: 10,
        price: 210_000,
        priceUnit: "kg",
      },
    ],
    recipes: {},
    staff: [
      { key: "kitchen", name: "رضا مرادی", tabs: ["orders"] },
      { key: "accountant", name: "لیلا صادقی", tabs: ["finance", "analytics"] },
    ],
    ordersPerDay: 22,
    historyDays: 30,
    onlineOrdering: true,
    onlinePayment: true,
    tax: 10,
    breakfastWindow: true,
  },
  {
    slug: "fastfood-tond",
    name: "فست‌فود تُند",
    nameEn: "Tond Fast Food",
    tagline: "برگر و پیتزای داغ، سریع و تند",
    address: "مشهد، بلوار سجاد، نبش سجاد ۱۸",
    ownerName: "پویا جعفری",
    templateId: "ember",
    theme: { primary: "#dc2626", secondary: "#f59e0b" },
    planCode: "tier-large",
    subscription: { status: "ACTIVE", interval: "monthly", endsInDays: 12 },
    tables: 24,
    menu: RESTAURANT_MENU,
    options: {},
    stock: [
      {
        name: "نان برگر",
        unit: "piece",
        opening: 120,
        low: 30,
        price: 9_000,
        priceUnit: "piece",
      },
      {
        name: "گوشت برگر",
        unit: "kg",
        opening: 18,
        low: 5,
        price: 980_000,
        priceUnit: "kg",
      },
    ],
    recipes: {},
    staff: [{ key: "kitchen", name: "مهدی کریمی", tabs: ["orders"] }],
    ordersPerDay: 26,
    historyDays: 30,
    onlineOrdering: true,
    onlinePayment: true,
    tax: 0,
  },
  {
    slug: "cafe-baran",
    name: "کافه باران",
    nameEn: "Baran Café",
    tagline: "منوی دیجیتال، بدون سفارش آنلاین",
    address: "رشت، خیابان علم‌الهدی",
    ownerName: "سمیرا حسینی",
    templateId: "aurora",
    theme: { primary: "#0f766e", secondary: "#334155" },
    planCode: "tier-small",
    subscription: { status: "TRIALING", interval: "monthly", endsInDays: 2 },
    tables: 6,
    menu: CAFE_MENU,
    options: {},
    stock: [],
    recipes: {},
    staff: [],
    ordersPerDay: 0,
    historyDays: 0,
    onlineOrdering: false,
    onlinePayment: false,
    tax: 0,
  },
  {
    slug: "cafe-ghadimi",
    name: "کافه قدیمی",
    nameEn: "Ghadimi Café",
    tagline: "اشتراک این کافه تمام شده است",
    address: "اصفهان، چهارباغ عباسی",
    ownerName: "بهرام شریفی",
    templateId: "noir",
    theme: { primary: "#78350f", secondary: "#1f2937" },
    planCode: "tier-small",
    subscription: { status: "EXPIRED", interval: "monthly", endsInDays: -9 },
    tables: 8,
    menu: CAFE_MENU,
    options: {},
    stock: [],
    recipes: {},
    staff: [],
    ordersPerDay: 8,
    historyDays: 30,
    onlineOrdering: true,
    onlinePayment: false,
    tax: 0,
  },
  {
    slug: "pizza-noon",
    name: "پیتزا نون",
    nameEn: "Pizza Noon",
    tagline: "پیتزای تنوری با خمیر ۴۸ ساعته",
    address: "تهران، دفتر مرکزی، خیابان شریعتی",
    ownerName: "کاوه امینی",
    templateId: "vitrin",
    theme: { primary: "#b91c1c", secondary: "#15803d" },
    planCode: "tier-chain",
    subscription: { status: "ACTIVE", interval: "monthly", endsInDays: 25 },
    tables: 12,
    menu: RESTAURANT_MENU,
    options: { "پیتزا مارگاریتا": [EXTRAS], "پیتزا پپرونی": [EXTRAS] },
    stock: [
      {
        name: "پنیر موزارلا",
        unit: "kg",
        opening: 25,
        low: 6,
        price: 720_000,
        priceUnit: "kg",
      },
      {
        name: "خمیر پیتزا",
        unit: "piece",
        opening: 200,
        low: 40,
        price: 22_000,
        priceUnit: "piece",
      },
    ],
    recipes: {
      "پیتزا مارگاریتا": [
        ["پنیر موزارلا", 0.18],
        ["خمیر پیتزا", 1],
      ],
      "پیتزا پپرونی": [
        ["پنیر موزارلا", 0.16],
        ["خمیر پیتزا", 1],
      ],
    },
    staff: [{ key: "kitchen", name: "سعید باقری", tabs: ["orders"] }],
    ordersPerDay: 12,
    historyDays: 30,
    onlineOrdering: true,
    onlinePayment: false,
    tax: 0,
    branches: [
      {
        slug: "pizza-noon-vanak",
        name: "پیتزا نون — شعبه ونک",
        managerKey: "manager@pizza-noon-vanak.launch",
        managerName: "آرش زمانی",
        ordersPerDay: 16,
      },
      {
        slug: "pizza-noon-tajrish",
        name: "پیتزا نون — شعبه تجریش",
        managerKey: "manager@pizza-noon-tajrish.launch",
        managerName: "فرناز یوسفی",
        ordersPerDay: 10,
      },
    ],
  },
];

const ownerKey = (slug: string) => `owner@${slug}.launch`;
const staffKey = (slug: string, key: string) => `${key}@${slug}.launch`;

const NOTES = ["بدون پیاز", "کم‌نمک لطفاً", "سس جدا", "تند باشد", null, null, null, null];
const COMMENTS = [
  "خیلی خوشمزه بود، ممنون",
  "سرو کمی طول کشید ولی کیفیت عالی بود",
  "برخورد پرسنل خوب بود",
  null,
];

// -------------------------------------------------------------------- build

interface SeededProduct {
  id: string;
  name: string;
  price: number;
  cost: number;
  groups: { name: string; choices: { name: string; price: number; cost: number }[] }[];
  recipe: { itemId: string; perUnitMilli: number }[];
}

function allPhones(spec: VenueSpec): string[] {
  return [
    devPhone(ownerKey(spec.slug)),
    ...spec.staff.map((s) => devPhone(staffKey(spec.slug, s.key))),
    ...(spec.branches ?? []).map((b) => devPhone(b.managerKey)),
  ];
}

async function assertPhonesFree(spec: VenueSpec) {
  const phones = allPhones(spec);
  const slugs = [spec.slug, ...(spec.branches ?? []).map((b) => b.slug)];
  const taken = await prisma.user.findMany({
    where: { phone: { in: phones } },
    select: { phone: true, restaurant: { select: { slug: true } } },
  });
  const foreign = taken.filter((u) => !slugs.includes(u.restaurant?.slug ?? ""));
  if (foreign.length > 0) {
    throw new Error(
      `Test numbers for ${spec.slug} are already used by other accounts: ${foreign
        .map((u) => u.phone)
        .join(", ")}. Nothing was written.`,
    );
  }
}

async function removeVenue(spec: VenueSpec) {
  const slugs = [...(spec.branches ?? []).map((b) => b.slug), spec.slug];
  for (const slug of slugs) {
    const venue = await prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!venue) continue;
    // Members cascade with the venue; the owner row is a member too.
    await prisma.restaurant.delete({ where: { id: venue.id } });
  }
  await prisma.user.deleteMany({ where: { phone: { in: allPhones(spec) } } });
}

async function createVenue(spec: VenueSpec) {
  const rand = rng(spec.slug);
  const plan = await prisma.plan.findUnique({ where: { code: spec.planCode } });
  if (!plan)
    throw new Error(`Plan ${spec.planCode} not found — run npm run db:seed first.`);

  const owner = await prisma.user.create({
    data: {
      name: spec.ownerName,
      phone: devPhone(ownerKey(spec.slug)),
      role: "OWNER",
      phoneVerifiedAt: new Date(),
    },
  });

  const restaurant = await prisma.restaurant.create({
    data: {
      slug: spec.slug,
      name: spec.name,
      nameEn: spec.nameEn,
      tagline: spec.tagline,
      description: `${spec.tagline}. سفارش از روی میز با اسکن بارکد.`,
      address: spec.address,
      phone: "021-44556677",
      templateId: spec.templateId,
      theme: spec.theme,
      ownerId: owner.id,
      onlineOrderingEnabled: spec.onlineOrdering,
      onlinePaymentEnabled: spec.onlinePayment,
      taxEnabled: spec.tax > 0,
      taxPercent: spec.tax,
      tipEnabled: true,
      staffCallEnabled: true,
      phoneCollectionEnabled: true,
      isPublished: true,
    },
  });

  await prisma.user.update({
    where: { id: owner.id },
    data: { restaurantId: restaurant.id },
  });

  for (const staff of spec.staff) {
    await prisma.user.create({
      data: {
        name: staff.name,
        phone: devPhone(staffKey(spec.slug, staff.key)),
        role: "STAFF",
        staffTabs: staff.tabs,
        restaurantId: restaurant.id,
      },
    });
  }

  await prisma.subscription.create({
    data: {
      restaurantId: restaurant.id,
      planId: plan.id,
      status: spec.subscription.status,
      interval: spec.subscription.interval,
      startedAt: new Date(Date.now() - 60 * DAY_MS),
      currentPeriodEnd: new Date(Date.now() + spec.subscription.endsInDays * DAY_MS),
    },
  });

  await prisma.restaurantTable.createMany({
    data: Array.from({ length: spec.tables }, (_, i) => ({
      restaurantId: restaurant.id,
      number: String(i + 1),
      seats: i % 3 === 0 ? 2 : 4,
    })),
  });

  // Stock first, so recipes can point at it.
  const stockIds = new Map<string, string>();
  for (const item of spec.stock) {
    const created = await prisma.inventoryItem.create({
      data: {
        restaurantId: restaurant.id,
        name: item.name,
        unit: item.unit,
        quantityMilli: Math.round(item.opening * 1000),
        lowStockMilli: Math.round(item.low * 1000),
        purchasePrice: item.price,
        priceUnit: item.priceUnit,
        priceUpdatedAt: new Date(),
      },
    });
    stockIds.set(item.name, created.id);
    // The opening count, so the ledger adds up to the shelf.
    await prisma.stockMovement.create({
      data: {
        itemId: created.id,
        deltaMilli: Math.round(item.opening * 1000),
        reason: "MANUAL_ADJUSTMENT",
        createdAt: new Date(Date.now() - (spec.historyDays + 1) * DAY_MS),
      },
    });
  }

  const products: SeededProduct[] = [];
  let imageIndex = 0;
  for (const [ci, category] of spec.menu.entries()) {
    const cat = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        name: category.name,
        nameEn: category.nameEn,
        icon: category.icon,
        sortOrder: ci,
      },
    });

    if (spec.breakfastWindow && category.name === "صبحانه") {
      // Breakfast is served 07:00–11:00 every day.
      await prisma.availabilityWindow.createMany({
        data: Array.from({ length: 7 }, (_, day) => ({
          restaurantId: restaurant.id,
          categoryId: cat.id,
          dayOfWeek: day,
          startMinute: 7 * 60,
          endMinute: 11 * 60,
        })),
      });
    }

    for (const [pi, product] of category.products.entries()) {
      const groups = spec.options[product.name] ?? [];
      const recipe = (spec.recipes[product.name] ?? []).map(([itemName, amount]) => ({
        itemId: stockIds.get(itemName)!,
        perUnitMilli: Math.round(amount * 1000),
      }));
      const imageUrl = writeImage(restaurant.id, `p${imageIndex}`, imageIndex);
      imageIndex += 1;

      const row = await prisma.product.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: cat.id,
          name: product.name,
          nameEn: product.nameEn,
          shortDescription: product.short,
          fullDescription: product.full,
          price: product.price,
          priceExact: product.price,
          costPrice: product.cost,
          imageUrl,
          isFeatured: product.featured ?? pi === 0,
          // One sold-out dish per menu, so the unavailable state is visible.
          isAvailable: !(ci === 0 && pi === category.products.length - 1),
          sortOrder: pi,
          optionGroups: {
            create: groups.map((group, gi) => ({
              name: group.name,
              isRequired: group.required,
              minSelect: group.required ? 1 : 0,
              maxSelect: group.max,
              sortOrder: gi,
              choices: {
                create: group.choices.map((choice, chi) => ({
                  name: choice.name,
                  priceDelta: choice.price,
                  costDelta: choice.cost,
                  sortOrder: chi,
                })),
              },
            })),
          },
          ingredients: { create: recipe.map((line) => ({ ...line })) },
        },
      });

      products.push({
        id: row.id,
        name: product.name,
        price: product.price,
        cost: product.cost,
        groups: groups.map((g) => ({ name: g.name, choices: g.choices })),
        recipe,
      });
    }
  }

  const sequence = await createHistory(
    rand,
    restaurant.id,
    spec,
    products,
    spec.ordersPerDay,
  );
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { orderSequence: sequence },
  });

  await createExpenses(rand, restaurant.id, spec.historyDays);

  for (const branch of spec.branches ?? []) {
    const manager = await prisma.user.create({
      data: {
        name: branch.managerName,
        phone: devPhone(branch.managerKey),
        role: "BRANCH_MANAGER",
      },
    });
    const site = await prisma.restaurant.create({
      data: {
        slug: branch.slug,
        name: branch.name,
        templateId: spec.templateId,
        theme: spec.theme,
        ownerId: owner.id,
        parentRestaurantId: restaurant.id,
        onlineOrderingEnabled: true,
        staffCallEnabled: true,
        isPublished: true,
      },
    });
    await prisma.user.update({
      where: { id: manager.id },
      data: { restaurantId: site.id },
    });
    await prisma.restaurantTable.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        restaurantId: site.id,
        number: String(i + 1),
      })),
    });
    const branchSequence = await createHistory(
      rng(branch.slug),
      site.id,
      spec,
      products,
      branch.ordersPerDay,
    );
    await prisma.restaurant.update({
      where: { id: site.id },
      data: { orderSequence: branchSequence },
    });
    await createExpenses(rng(`${branch.slug}-x`), site.id, spec.historyDays);
  }

  return restaurant;
}

/**
 * Trading history: orders with items, options, customers, stock movements and
 * the occasional cancellation and review, written the way createOrder would
 * have written them (snapshots fixed at placement, stock taken at placement and
 * put back on cancel).
 */
async function createHistory(
  rand: Rand,
  restaurantId: string,
  spec: VenueSpec,
  products: SeededProduct[],
  perDay: number,
): Promise<number> {
  if (perDay === 0 || spec.historyDays === 0) return 0;

  let sequence = 0;
  const consumed = new Map<string, number>();
  const customers: { id: string; phone: string; name: string }[] = [];

  for (let i = 0; i < 25; i++) {
    const phone = `0912${String(Math.floor(rand() * 9_000_000) + 1_000_000)}`;
    if (customers.some((c) => c.phone === phone)) continue;
    const name = pick(rand, CUSTOMER_NAMES);
    const created = await prisma.customer.create({
      data: { restaurantId, phone, name, marketingConsent: rand() < 0.3 },
    });
    customers.push({ id: created.id, phone, name });
  }

  const orderable = products.filter((p) => p.price > 0);
  const nowHour = tehranHourNow();

  for (let daysAgo = spec.historyDays - 1; daysAgo >= 0; daysAgo--) {
    const weekend = [4, 5].includes(new Date(tehranTime(daysAgo, 12, 0)).getUTCDay());
    const count = Math.round(perDay * (weekend ? 1.5 : 1) * (0.8 + rand() * 0.4));

    for (let n = 0; n < count; n++) {
      const hour =
        rand() < 0.5 ? 12 + Math.floor(rand() * 3) : 19 + Math.floor(rand() * 4);
      if (daysAgo === 0 && hour >= nowHour) continue;
      const placedAt = tehranTime(daysAgo, hour, Math.floor(rand() * 60));
      sequence += 1;

      const lineCount = 1 + Math.floor(rand() * 3);
      const lines = Array.from({ length: lineCount }, () => {
        const product = pick(rand, orderable);
        const options = product.groups.flatMap((group) =>
          rand() < 0.5 ? [{ group: group.name, choice: pick(rand, group.choices) }] : [],
        );
        return {
          product,
          quantity: 1 + Math.floor(rand() * 2),
          options,
          note: pick(rand, NOTES),
        };
      });

      const subtotal = lines.reduce(
        (sum, l) =>
          sum +
          (l.product.price + l.options.reduce((s, o) => s + o.choice.price, 0)) *
            l.quantity,
        0,
      );
      const costTotal = lines.reduce(
        (sum, l) =>
          sum +
          (l.product.cost + l.options.reduce((s, o) => s + o.choice.cost, 0)) *
            l.quantity,
        0,
      );
      const tax = Math.round((subtotal * spec.tax) / 100);
      const tip = rand() < 0.15 ? 20_000 : 0;
      const total = subtotal + tax + tip;

      const isToday = daysAgo === 0;
      const status = isToday
        ? pick(rand, ["RECEIVED", "PREPARING", "READY", "DELIVERED"] as const)
        : rand() < 0.04
          ? ("CANCELED" as const)
          : ("DELIVERED" as const);
      const online = spec.onlinePayment && rand() < 0.35;
      const paid = status === "DELIVERED" && (online || rand() < 0.92);
      const customer = rand() < 0.45 ? pick(rand, customers) : null;

      const minutes = (m: number) => new Date(placedAt.getTime() + m * 60_000);
      const reached = ["PREPARING", "READY", "DELIVERED"].indexOf(status);

      const order = await prisma.order.create({
        data: {
          restaurantId,
          orderNumber: sequence,
          publicToken: `launch-${restaurantId.slice(-8)}-${sequence}`,
          tableNumber: rand() < 0.9 ? String(1 + Math.floor(rand() * 8)) : null,
          customerName: customer?.name ?? pick(rand, CUSTOMER_NAMES),
          customerPhone: customer?.phone ?? null,
          customerId: customer?.id ?? null,
          status,
          paymentMethod: online ? "ONLINE" : "CASH_ON_SITE",
          paymentStatus: paid ? "PAID" : "PENDING",
          subtotal,
          tax,
          tip,
          total,
          costTotal,
          placedAt,
          createdAt: placedAt,
          preparingAt: reached >= 0 ? minutes(2) : null,
          readyAt: reached >= 1 ? minutes(14 + Math.floor(rand() * 10)) : null,
          deliveredAt: reached >= 2 ? minutes(25 + Math.floor(rand() * 10)) : null,
          paidAt: paid ? minutes(40) : null,
          canceledAt: status === "CANCELED" ? minutes(5) : null,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              nameSnapshot: l.product.name,
              priceSnapshot: l.product.price,
              costSnapshot: l.product.cost,
              quantity: l.quantity,
              note: l.note,
              options: {
                create: l.options.map((o, i) => ({
                  groupNameSnapshot: o.group,
                  choiceNameSnapshot: o.choice.name,
                  priceDeltaSnapshot: o.choice.price,
                  costDeltaSnapshot: o.choice.cost,
                  sortOrder: i,
                })),
              },
            })),
          },
          events: {
            create: [
              { status: "RECEIVED", createdAt: placedAt },
              ...(status !== "RECEIVED" ? [{ status, createdAt: minutes(25) }] : []),
            ],
          },
        },
        select: { id: true },
      });

      // Stock is taken at placement (from the menu owner's shelves) and put
      // back on cancellation — the same two movements createOrder and
      // updateOrderStatus write.
      const taken = new Map<string, number>();
      for (const l of lines) {
        for (const line of l.product.recipe) {
          taken.set(
            line.itemId,
            (taken.get(line.itemId) ?? 0) + line.perUnitMilli * l.quantity,
          );
        }
      }
      if (taken.size > 0) {
        const entries = [...taken.entries()];
        await prisma.stockMovement.createMany({
          data: entries.map(([itemId, amount]) => ({
            itemId,
            deltaMilli: -amount,
            reason: "ORDER_PLACED" as const,
            orderId: order.id,
            createdAt: placedAt,
          })),
        });
        if (status === "CANCELED") {
          await prisma.stockMovement.createMany({
            data: entries.map(([itemId, amount]) => ({
              itemId,
              deltaMilli: amount,
              reason: "ORDER_CANCELED" as const,
              orderId: order.id,
              createdAt: minutes(5),
            })),
          });
        } else {
          for (const [itemId, amount] of entries) {
            consumed.set(itemId, (consumed.get(itemId) ?? 0) + amount);
          }
        }
      }

      if (status === "DELIVERED" && rand() < 0.06) {
        await prisma.orderReview.create({
          data: {
            orderId: order.id,
            restaurantId,
            rating: 3 + Math.floor(rand() * 3),
            comment: pick(rand, COMMENTS),
            createdAt: minutes(60),
          },
        });
      }
    }
  }

  for (const [itemId, amount] of consumed) {
    await prisma.inventoryItem.update({
      where: { id: itemId },
      data: { quantityMilli: { decrement: amount } },
    });
  }

  // One table waiting for a waiter right now.
  await prisma.staffCall.create({ data: { restaurantId, tableNumber: "4" } });

  return sequence;
}

async function createExpenses(rand: Rand, restaurantId: string, historyDays: number) {
  if (historyDays === 0) return;
  const rows = [
    { title: "اجاره ماهانه", category: "rent", amount: 85_000_000, isRecurring: true },
    { title: "حقوق پرسنل", category: "salary", amount: 140_000_000, isRecurring: true },
    {
      title: "قبض برق و گاز",
      category: "utilities",
      amount: 9_500_000,
      isRecurring: false,
    },
    {
      title: "تبلیغات اینستاگرام",
      category: "marketing",
      amount: 6_000_000,
      isRecurring: false,
    },
  ];
  for (const row of rows) {
    await prisma.expense.create({
      data: {
        restaurantId,
        ...row,
        amount: Math.round(row.amount * (0.85 + rand() * 0.3)),
        occurredAt: tehranTime(Math.floor(rand() * historyDays), 10, 0),
      },
    });
  }
}

// --------------------------------------------------------------------- main

async function main() {
  console.log(
    RESET ? "Rebuilding launch fixtures…" : "Creating missing launch fixtures…",
  );
  const lines: string[] = [];

  for (const spec of VENUES) {
    const existing = await prisma.restaurant.findUnique({
      where: { slug: spec.slug },
      select: { id: true },
    });
    if (existing && !RESET) {
      lines.push(`  kept     ${spec.slug}`);
      continue;
    }
    if (RESET) await removeVenue(spec);
    await assertPhonesFree(spec);
    await createVenue(spec);
    lines.push(`  created  ${spec.slug}`);
  }

  console.log(lines.join("\n"));
  console.log("\nSign-in numbers (codes print in the dev server log as [otp:dev]):");
  for (const spec of VENUES) {
    console.log(`  ${devPhone(ownerKey(spec.slug))}  owner   ${spec.name}`);
    for (const staff of spec.staff) {
      console.log(
        `  ${devPhone(staffKey(spec.slug, staff.key))}  staff   ${spec.name} (${staff.tabs.join(", ")})`,
      );
    }
    for (const branch of spec.branches ?? []) {
      console.log(`  ${devPhone(branch.managerKey)}  manager ${branch.name}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
