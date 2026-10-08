/**
 * The demo businesses: who they are, what they sell, what they keep on the
 * shelf and who works there. Data only — `seed-demo.ts` writes it and
 * `history.ts` gives it months of trading.
 *
 * Every account number is in 0912 000 00xx and every guest number in
 * 0912 000 1xxx–9xxx: sequential, obviously invented, and never sent an SMS
 * (development prints codes to the server log instead).
 *
 * Product copy and photos come from the showcase menus wherever the same dish
 * exists there (`lib()`); dishes the showcase does not have are written here
 * and go without a photo rather than borrowing a wrong one.
 */
import type { DishTag } from "../../src/lib/dish-tags";
import type { StaffTab } from "../../src/lib/staff-tabs";
import type { BusinessHours } from "../../src/lib/business-day";
import {
  BISTRO_MENU,
  CAFE_MENU,
  EN_COPY,
  PERSIAN_MENU,
  RESTAURANT_MENU,
  SEED_DISH_TAGS,
  SOUVENIR_MENU,
  type SeedProduct,
} from "../menu-data";

// ------------------------------------------------------------------- types

export interface DemoChoice {
  name: string;
  nameEn: string;
  price: number;
  cost: number;
  /** How often guests pick it, relative to the group's other choices. */
  w?: number;
}

export interface DemoOption {
  name: string;
  nameEn: string;
  required: boolean;
  max: number;
  upgrade?: boolean;
  choices: DemoChoice[];
}

export interface DemoProduct {
  name: string;
  nameEn: string;
  short: string;
  full: string;
  shortEn?: string;
  fullEn?: string;
  price: number;
  cost: number;
  prep?: number;
  /** Showcase dish whose photo this dish uses; null for none. */
  photo: string | null;
  tags: DishTag[];
  info: { title: string; content: string; icon: string }[];
  /** Relative popularity within its category. */
  pop: number;
  options: DemoOption[];
  /** Inventory item name → amount per serving, in the item's unit. */
  recipe: [string, number][];
  featured?: boolean;
  /** False for the one dish each menu has run out of. */
  available?: boolean;
}

/** What a category is for when a guest composes a basket. */
export type Role = "drink" | "main" | "side" | "dessert" | "breakfast" | "retail";

export interface DemoCategory {
  name: string;
  nameEn: string;
  icon: string;
  role: Role;
  /** Served only between these minutes of the day (breakfast). */
  window?: [number, number];
  products: DemoProduct[];
}

export interface DemoItem {
  name: string;
  unit: "kg" | "g" | "l" | "piece";
  /** Toman per `unit` today; history runs from lower prices up to this. */
  price: number;
  low: number;
  supplier: string;
  /** Days between that supplier's deliveries. */
  every: number;
  /** Ordered in multiples of this many units. */
  pack: number;
  perishable?: boolean;
  /** Left this low at the end, below its warning level, so it shows as low. */
  endLow?: number;
  category: string;
}

export interface DemoStaff {
  phone: string;
  name: string;
  title: string;
  tabs: StaffTab[];
}

export interface DemoBranch {
  slug: string;
  name: string;
  nameEn: string;
  address: string;
  /** Null: the same hours as the head office. */
  hours: BusinessHours | null;
  tables: number;
  opensDaysAgo: number;
  /** Orders a day once established, before weekday swings. */
  volume: number;
  manager: { phone: string; name: string };
  staff: DemoStaff[];
  openingCash: number;
  rent: number;
  payroll: number;
}

export type Billing =
  | { kind: "monthly" }
  | { kind: "yearly" }
  | { kind: "trial"; endsInDays: number }
  | { kind: "expired"; endedDaysAgo: number }
  /** Contract plan, extended by platform staff after a bank transfer. */
  | { kind: "contract"; months: 1 | 12 };

export type Profile = "cafe" | "persian" | "fastfood" | "bistro" | "pizza";

export interface Basket {
  /** Per guest. */
  main?: number;
  drink?: number;
  dessert?: number;
  /** Per order. */
  side?: number;
  retail?: number;
  breakfast?: number;
}

export interface DemoBusiness {
  slug: string;
  name: string;
  nameEn: string;
  kind: string;
  city: string;
  address: string;
  tagline: string;
  taglineEn: string;
  description: string;
  owner: { phone: string; name: string };
  templateId: string;
  theme: Record<string, string>;
  logo: { glyph: Glyph; background: string; foreground: string };
  planCode: string;
  billing: Billing;
  /** Created by platform staff from the admin panel rather than signed up. */
  createdByAdmin?: boolean;
  hours: BusinessHours;
  tables: number;
  signupDaysAgo: number;
  /** Orders a day once established, before weekday swings. */
  volume: number;
  profile: Profile;
  basket: Basket;
  settings: {
    onlineOrdering: boolean;
    onlinePayment: boolean;
    takeaway: boolean;
    tax: number;
    service: number;
    tip: boolean;
    rounding: number;
    bilingual: boolean;
    phoneCollection: boolean;
    staffCall: boolean;
    discountCode?: { code: string; percent: number; max: number; sinceDaysAgo: number };
  };
  shares: {
    takeaway: number;
    online: number;
    phone: number;
    /** Typed in by staff at the counter. */
    manual: number;
  };
  menu: DemoCategory[];
  stock: DemoItem[];
  suppliers: { name: string; phone: string; note?: string }[];
  staff: DemoStaff[];
  /** Who counts the till at night: an owner, a staff phone, or a manager phone. */
  closer: string;
  openingCash: number;
  /** Monthly, Toman. Zero for plans without the finance features. */
  rent: number;
  payroll: number;
  marketing: number;
  branches: DemoBranch[];
  supportTickets: { subject: string; message: string; reply?: string; daysAgo: number }[];
}

export type Glyph = "cup" | "book" | "leaf" | "flame" | "burger" | "moon" | "pizza";

// ----------------------------------------------------------------- helpers

export const DEMO_PASSWORD = "demo1405";
export const ADMIN_PASSWORD = "admin1405";

/** The n-th demo account number: 09120000001, 09120000002, … */
export const phone = (n: number) => `091200000${String(n).padStart(2, "0")}`;

const LIBRARY = new Map<string, SeedProduct>(
  [...CAFE_MENU, ...RESTAURANT_MENU, ...PERSIAN_MENU, ...BISTRO_MENU, ...SOUVENIR_MENU]
    .flatMap((category) => category.products)
    .map((product) => [product.name, product]),
);

type Extra = Partial<Omit<DemoProduct, "name" | "price" | "cost">>;

/** A showcase dish, repriced for this venue, with its photo and copy. */
function lib(name: string, price: number, cost: number, extra: Extra = {}): DemoProduct {
  const source = LIBRARY.get(name);
  if (!source) throw new Error(`No showcase dish called «${name}»`);
  return {
    name,
    nameEn: source.nameEn,
    short: source.short,
    full: source.full,
    shortEn: EN_COPY[name]?.short,
    fullEn: EN_COPY[name]?.full,
    price,
    cost,
    prep: source.prep,
    photo: name,
    tags: SEED_DISH_TAGS[name] ?? [],
    info: source.info,
    pop: 1,
    options: [],
    recipe: [],
    ...extra,
  };
}

/** A dish the showcase menus do not have: written here, no photo. */
function dish(
  name: string,
  nameEn: string,
  short: string,
  full: string,
  price: number,
  cost: number,
  extra: Extra = {},
): DemoProduct {
  return {
    name,
    nameEn,
    short,
    full,
    price,
    cost,
    photo: null,
    tags: [],
    info: [],
    pop: 1,
    options: [],
    recipe: [],
    ...extra,
  };
}

// ----------------------------------------------------------------- options

const CUP_SIZE: DemoOption = {
  name: "اندازه",
  nameEn: "Size",
  required: true,
  max: 1,
  choices: [
    { name: "معمولی", nameEn: "Regular", price: 0, cost: 0, w: 7 },
    { name: "بزرگ", nameEn: "Large", price: 25_000, cost: 8_000, w: 3 },
  ],
};

const MILK: DemoOption = {
  name: "نوع شیر",
  nameEn: "Milk",
  required: false,
  max: 1,
  choices: [
    { name: "شیر بادام", nameEn: "Almond milk", price: 35_000, cost: 15_000 },
    { name: "شیر جو دوسر", nameEn: "Oat milk", price: 35_000, cost: 14_000 },
    { name: "شیر بدون لاکتوز", nameEn: "Lactose-free milk", price: 20_000, cost: 8_000 },
  ],
};

const SYRUP: DemoOption = {
  name: "سیروپ",
  nameEn: "Syrup",
  required: false,
  max: 1,
  choices: [
    { name: "وانیل", nameEn: "Vanilla", price: 20_000, cost: 6_000, w: 3 },
    { name: "کارامل", nameEn: "Caramel", price: 20_000, cost: 6_000, w: 3 },
    { name: "فندق", nameEn: "Hazelnut", price: 25_000, cost: 7_000, w: 2 },
  ],
};

const RICE_SIDE: DemoOption = {
  name: "همراه",
  nameEn: "Served with",
  required: true,
  max: 1,
  choices: [
    { name: "چلو ایرانی", nameEn: "Persian rice", price: 0, cost: 0, w: 7 },
    { name: "نان تازه", nameEn: "Fresh bread", price: 0, cost: 0, w: 2 },
    {
      name: "چلو با ته‌دیگ",
      nameEn: "Rice with tahdig",
      price: 45_000,
      cost: 12_000,
      w: 2,
    },
  ],
};

const KEBAB_EXTRAS: DemoOption = {
  name: "افزودنی",
  nameEn: "Extras",
  required: false,
  max: 3,
  choices: [
    {
      name: "یک سیخ کوبیدهٔ اضافه",
      nameEn: "Extra koobideh skewer",
      price: 165_000,
      cost: 72_000,
    },
    {
      name: "گوجهٔ کبابی اضافه",
      nameEn: "Extra grilled tomato",
      price: 25_000,
      cost: 6_000,
      w: 2,
    },
    { name: "کره و سماق", nameEn: "Butter and sumac", price: 15_000, cost: 4_000, w: 2 },
  ],
};

const CHICKEN_CUT: DemoOption = {
  name: "نوع جوجه",
  nameEn: "Cut",
  required: true,
  max: 1,
  choices: [
    { name: "بی‌استخوان", nameEn: "Boneless", price: 0, cost: 0, w: 7 },
    { name: "با استخوان", nameEn: "On the bone", price: 0, cost: 0, w: 3 },
  ],
};

const DONENESS: DemoOption = {
  name: "پخت گوشت",
  nameEn: "Doneness",
  required: true,
  max: 1,
  choices: [
    { name: "مدیوم", nameEn: "Medium", price: 0, cost: 0, w: 4 },
    { name: "مدیوم ول", nameEn: "Medium well", price: 0, cost: 0, w: 4 },
    { name: "کاملاً پخته", nameEn: "Well done", price: 0, cost: 0, w: 2 },
  ],
};

const BURGER_EXTRAS: DemoOption = {
  name: "افزودنی‌ها",
  nameEn: "Extras",
  required: false,
  max: 3,
  choices: [
    {
      name: "پنیر چدار اضافه",
      nameEn: "Extra cheddar",
      price: 45_000,
      cost: 20_000,
      w: 3,
    },
    { name: "قارچ", nameEn: "Mushrooms", price: 30_000, cost: 10_000, w: 2 },
    { name: "هالوپینو", nameEn: "Jalapeño", price: 25_000, cost: 8_000, w: 2 },
    { name: "ژامبون گوساله", nameEn: "Beef ham", price: 65_000, cost: 30_000 },
  ],
};

const COMBO: DemoOption = {
  name: "ارتقا به منوی کامل",
  nameEn: "Make it a meal",
  required: false,
  max: 1,
  upgrade: true,
  choices: [
    {
      name: "سیب‌زمینی و نوشابه",
      nameEn: "Fries and a soft drink",
      price: 150_000,
      cost: 48_000,
    },
  ],
};

const PIZZA_SIZE: DemoOption = {
  name: "اندازه",
  nameEn: "Size",
  required: true,
  max: 1,
  choices: [
    { name: "متوسط (۲۵ سانتی)", nameEn: "Medium (25 cm)", price: 0, cost: 0, w: 5 },
    {
      name: "بزرگ (۳۰ سانتی)",
      nameEn: "Large (30 cm)",
      price: 120_000,
      cost: 45_000,
      w: 4,
    },
    {
      name: "خانواده (۳۵ سانتی)",
      nameEn: "Family (35 cm)",
      price: 220_000,
      cost: 85_000,
      w: 1,
    },
  ],
};

const PIZZA_EXTRAS: DemoOption = {
  name: "افزودنی‌ها",
  nameEn: "Toppings",
  required: false,
  max: 3,
  choices: [
    { name: "پنیر اضافه", nameEn: "Extra cheese", price: 55_000, cost: 22_000, w: 3 },
    { name: "قارچ", nameEn: "Mushrooms", price: 30_000, cost: 10_000, w: 2 },
    { name: "زیتون سیاه", nameEn: "Black olives", price: 30_000, cost: 11_000 },
    { name: "هالوپینو", nameEn: "Jalapeño", price: 25_000, cost: 8_000 },
  ],
};

const FRIES_SAUCE: DemoOption = {
  name: "سس",
  nameEn: "Sauce",
  required: false,
  max: 2,
  choices: [
    { name: "سس پنیر", nameEn: "Cheese sauce", price: 35_000, cost: 12_000, w: 3 },
    { name: "سس سیر", nameEn: "Garlic sauce", price: 20_000, cost: 5_000, w: 2 },
    { name: "سس تند", nameEn: "Hot sauce", price: 20_000, cost: 5_000, w: 2 },
  ],
};

const STEAK_DONENESS: DemoOption = {
  name: "درجهٔ پخت",
  nameEn: "Doneness",
  required: true,
  max: 1,
  choices: [
    { name: "رِیر", nameEn: "Rare", price: 0, cost: 0, w: 1 },
    { name: "مدیوم رِیر", nameEn: "Medium rare", price: 0, cost: 0, w: 5 },
    { name: "مدیوم", nameEn: "Medium", price: 0, cost: 0, w: 4 },
    { name: "مدیوم ول", nameEn: "Medium well", price: 0, cost: 0, w: 2 },
  ],
};

const STEAK_SAUCE: DemoOption = {
  name: "سس",
  nameEn: "Sauce",
  required: true,
  max: 1,
  choices: [
    { name: "سس قارچ", nameEn: "Mushroom sauce", price: 0, cost: 0, w: 4 },
    { name: "سس فلفل سیاه", nameEn: "Peppercorn sauce", price: 0, cost: 0, w: 3 },
    { name: "چیمی‌چوری", nameEn: "Chimichurri", price: 0, cost: 0, w: 2 },
  ],
};

const FINE_SIDE: DemoOption = {
  name: "دورچین اضافه",
  nameEn: "Extra side",
  required: false,
  max: 1,
  choices: [
    {
      name: "پورهٔ سیب‌زمینی ترافلی",
      nameEn: "Truffle mash",
      price: 95_000,
      cost: 28_000,
      w: 3,
    },
    {
      name: "سبزیجات گریل",
      nameEn: "Grilled vegetables",
      price: 75_000,
      cost: 22_000,
      w: 2,
    },
  ],
};

// ------------------------------------------------------------- businesses

export const BUSINESSES: DemoBusiness[] = [
  // ------------------------------------------------ 1. small plan, active
  {
    slug: "cafe-nimkat",
    name: "کافه نیمکت",
    nameEn: "Nimkat Café",
    kind: "کافه",
    city: "شیراز",
    address: "شیراز، خیابان زند، کوچهٔ ۱۲، پلاک ۸",
    tagline: "قهوهٔ تازه‌رُست و کیک خانگی، کنار باغ",
    taglineEn: "Freshly roasted coffee and home-made cake by the garden",
    description:
      "کافه‌ای کوچک با ده میز در یکی از کوچه‌باغ‌های زند. دانهٔ قهوه را هر هفته از رُست‌خانه می‌گیریم و کیک‌ها را هر صبح خودمان می‌پزیم.",
    owner: { phone: phone(1), name: "مریم کاظمی" },
    templateId: "bazaar",
    theme: { primary: "#b45309", secondary: "#166534" },
    logo: { glyph: "cup", background: "#7c2d12", foreground: "#fde68a" },
    planCode: "tier-small",
    billing: { kind: "monthly" },
    hours: { start: 8 * 60, end: 23 * 60 },
    tables: 10,
    signupDaysAgo: 165,
    volume: 38,
    profile: "cafe",
    basket: { drink: 0.95, dessert: 0.4 },
    settings: {
      onlineOrdering: true,
      onlinePayment: false,
      takeaway: false,
      tax: 0,
      service: 0,
      tip: false,
      rounding: 0,
      bilingual: false,
      phoneCollection: true,
      staffCall: true,
    },
    shares: { takeaway: 0, online: 0, phone: 0.45, manual: 0.15 },
    menu: [
      {
        name: "قهوه‌های داغ",
        nameEn: "Hot coffee",
        icon: "coffee",
        role: "drink",
        products: [
          lib("اسپرسو", 60_000, 19_000, { pop: 3, recipe: [["دانه قهوه", 0.018]] }),
          dish(
            "آمریکانو",
            "Americano",
            "اسپرسو با آب داغ",
            "دو شات اسپرسو روی آب داغ؛ سبک‌تر از اسپرسو، با همان عطر.",
            70_000,
            20_000,
            { pop: 2, prep: 3, recipe: [["دانه قهوه", 0.018]] },
          ),
          lib("لاته", 95_000, 32_000, {
            pop: 5,
            featured: true,
            options: [CUP_SIZE, MILK, SYRUP],
            recipe: [
              ["دانه قهوه", 0.018],
              ["شیر", 0.2],
            ],
          }),
          dish(
            "کاپوچینو",
            "Cappuccino",
            "اسپرسو، شیر و فوم غلیظ",
            "یک سوم اسپرسو، یک سوم شیر بخارپز و یک سوم فوم، با کمی پودر کاکائو.",
            92_000,
            30_000,
            {
              pop: 4,
              prep: 4,
              photo: "لاته",
              tags: ["containsDairy"],
              options: [CUP_SIZE, MILK],
              recipe: [
                ["دانه قهوه", 0.018],
                ["شیر", 0.15],
              ],
            },
          ),
          lib("موکا", 115_000, 40_000, {
            pop: 3,
            options: [CUP_SIZE, MILK],
            recipe: [
              ["دانه قهوه", 0.018],
              ["شیر", 0.18],
              ["شکلات تلخ", 0.025],
            ],
          }),
          dish(
            "هات چاکلت",
            "Hot chocolate",
            "شکلات تلخ آب‌شده در شیر",
            "شکلات تلخ ۷۰٪ آب‌شده در شیر داغ، غلیظ و کم‌شیرین.",
            105_000,
            38_000,
            {
              pop: 2,
              prep: 5,
              photo: "موکا",
              tags: ["vegetarian", "containsDairy"],
              recipe: [
                ["شیر", 0.22],
                ["شکلات تلخ", 0.035],
              ],
            },
          ),
        ],
      },
      {
        name: "نوشیدنی سرد",
        nameEn: "Cold drinks",
        icon: "cupSoda",
        role: "drink",
        products: [
          lib("آیس آمریکانو", 85_000, 23_000, { pop: 3, recipe: [["دانه قهوه", 0.018]] }),
          dish(
            "آیس لاته",
            "Iced latte",
            "اسپرسو و شیر سرد روی یخ",
            "دو شات اسپرسو با شیر سرد روی یخ؛ با سیروپ دلخواه.",
            105_000,
            34_000,
            {
              pop: 3,
              prep: 4,
              tags: ["containsDairy"],
              options: [SYRUP],
              recipe: [
                ["دانه قهوه", 0.018],
                ["شیر", 0.2],
              ],
            },
          ),
          lib("لیموناد نعناع", 88_000, 25_000, { pop: 2, recipe: [["لیمو ترش", 0.12]] }),
          lib("اسموتی انبه", 125_000, 44_000, { pop: 2, recipe: [["انبه منجمد", 0.15]] }),
        ],
      },
      {
        name: "چای و دمنوش",
        nameEn: "Tea and infusions",
        icon: "leaf",
        role: "drink",
        products: [
          dish(
            "چای ایرانی با نبات",
            "Persian tea with rock candy",
            "قوری کوچک برای یک نفر",
            "چای دم‌کشیدهٔ ایرانی در قوری، با نبات زعفرانی.",
            50_000,
            10_000,
            { pop: 2, prep: 4, tags: ["vegan", "glutenFree"] },
          ),
          dish(
            "دمنوش به‌لیمو و بابونه",
            "Lemon verbena and chamomile",
            "آرام‌بخش، بدون کافئین",
            "دمنوش به‌لیمو و بابونهٔ خشک، با عسل جدا.",
            60_000,
            14_000,
            { pop: 1, prep: 5, tags: ["vegan", "glutenFree"], available: false },
          ),
        ],
      },
      {
        name: "کیک و دسر",
        nameEn: "Cake and dessert",
        icon: "cake",
        role: "dessert",
        products: [
          lib("چیزکیک نیویورکی", 155_000, 55_000, {
            pop: 3,
            featured: true,
            recipe: [["پنیر خامه‌ای", 0.09]],
          }),
          lib("براونی شکلاتی", 135_000, 46_000, {
            pop: 3,
            recipe: [["شکلات تلخ", 0.04]],
          }),
          lib("کروسان بادام", 105_000, 35_000, { pop: 3 }),
          dish(
            "کیک هویج و گردو",
            "Carrot and walnut cake",
            "با کرم پنیر و دارچین",
            "کیک هویج مرطوب با گردو و دارچین و رویهٔ کرم‌پنیر.",
            120_000,
            40_000,
            { pop: 2, prep: 2, tags: ["vegetarian", "containsNuts", "containsDairy"] },
          ),
        ],
      },
    ],
    stock: [
      {
        name: "دانه قهوه",
        unit: "kg",
        price: 1_950_000,
        low: 1.5,
        supplier: "رُست‌خانهٔ پارس",
        every: 7,
        pack: 1,
        category: "قهوه و شکلات",
      },
      {
        name: "شیر",
        unit: "l",
        price: 68_000,
        low: 6,
        supplier: "لبنیات پگاه فارس",
        every: 2,
        pack: 1,
        perishable: true,
        category: "لبنیات",
      },
      {
        name: "شکلات تلخ",
        unit: "kg",
        price: 1_050_000,
        low: 0.5,
        supplier: "رُست‌خانهٔ پارس",
        every: 7,
        pack: 0.5,
        endLow: 0.2,
        category: "قهوه و شکلات",
      },
      {
        name: "پنیر خامه‌ای",
        unit: "kg",
        price: 560_000,
        low: 1,
        supplier: "لبنیات پگاه فارس",
        every: 4,
        pack: 0.5,
        perishable: true,
        category: "لبنیات",
      },
      {
        name: "لیمو ترش",
        unit: "kg",
        price: 95_000,
        low: 2,
        supplier: "میوه و تره‌بار سعدی",
        every: 3,
        pack: 1,
        perishable: true,
        category: "میوه",
      },
      {
        name: "انبه منجمد",
        unit: "kg",
        price: 420_000,
        low: 1.5,
        supplier: "میوه و تره‌بار سعدی",
        every: 7,
        pack: 1,
        category: "میوه",
      },
    ],
    suppliers: [
      { name: "رُست‌خانهٔ پارس", phone: "09120009001", note: "تحویل شنبه‌ها" },
      { name: "لبنیات پگاه فارس", phone: "09120009002" },
      { name: "میوه و تره‌بار سعدی", phone: "09120009003" },
    ],
    staff: [],
    closer: phone(1),
    openingCash: 1_000_000,
    rent: 0,
    payroll: 0,
    marketing: 0,
    branches: [],
    supportTickets: [
      {
        subject: "چاپ کد QR میزها",
        message: "سلام، برای چاپ کدهای QR روی استند میز چه اندازه‌ای پیشنهاد می‌کنید؟",
        reply:
          "سلام، اندازهٔ ۶ در ۶ سانتی‌متر روی استند A6 مناسب است. از صفحهٔ «کد QR» نسخهٔ چاپی را با کیفیت بالا بگیرید.",
        daysAgo: 140,
      },
    ],
  },

  // ------------------------------------------------ 2. small plan, trial
  {
    slug: "cafe-varagh",
    name: "کافه کتاب ورق",
    nameEn: "Varagh Book Café",
    kind: "کافه کتاب",
    city: "رشت",
    address: "رشت، خیابان علم‌الهدی، کوچهٔ کتاب، پلاک ۴",
    tagline: "چای لاهیجان، کتاب و باران",
    taglineEn: "Lahijan tea, books and rain",
    description:
      "کافه‌کتابی آرام در مرکز رشت؛ قفسه‌های کتاب امانی، چای لاهیجان و کلوچهٔ تازهٔ فومن. فعلاً فقط منوی دیجیتال داریم و سفارش را سر میز می‌گیریم.",
    owner: { phone: phone(2), name: "سمیرا حسینی" },
    templateId: "aurora",
    theme: { primary: "#0f766e", secondary: "#334155", surfaceStyle: "glass" },
    logo: { glyph: "book", background: "#134e4a", foreground: "#ccfbf1" },
    planCode: "tier-small",
    billing: { kind: "trial", endsInDays: 2 },
    hours: { start: 10 * 60, end: 22 * 60 },
    tables: 6,
    signupDaysAgo: 12,
    volume: 0,
    profile: "cafe",
    basket: { drink: 1, dessert: 0.4 },
    settings: {
      onlineOrdering: false,
      onlinePayment: false,
      takeaway: false,
      tax: 0,
      service: 0,
      tip: false,
      rounding: 0,
      bilingual: false,
      phoneCollection: false,
      staffCall: false,
    },
    shares: { takeaway: 0, online: 0, phone: 0, manual: 0 },
    menu: [
      {
        name: "قهوه",
        nameEn: "Coffee",
        icon: "coffee",
        role: "drink",
        products: [
          lib("اسپرسو", 55_000, 18_000),
          lib("لاته", 85_000, 30_000, { options: [CUP_SIZE] }),
          lib("موکا", 98_000, 36_000),
          lib("آیس آمریکانو", 75_000, 22_000),
        ],
      },
      {
        name: "چای و دمنوش",
        nameEn: "Tea",
        icon: "leaf",
        role: "drink",
        products: [
          dish(
            "چای لاهیجان (قوری)",
            "Lahijan tea (pot)",
            "برای دو نفر",
            "چای سیاه بهارهٔ لاهیجان در قوری چینی، با قند و نبات.",
            70_000,
            12_000,
            { featured: true, tags: ["vegan", "glutenFree"] },
          ),
          dish(
            "چای سبز",
            "Green tea",
            "چای سبز گیلان",
            "چای سبز تازه از باغ‌های گیلان؛ سبک و کمی گس.",
            60_000,
            12_000,
            { tags: ["vegan", "glutenFree"] },
          ),
          dish(
            "دمنوش گل گاوزبان",
            "Borage infusion",
            "با لیمو عمانی",
            "دمنوش گل گاوزبان و لیمو عمانی، با نبات.",
            65_000,
            15_000,
            { tags: ["vegan", "glutenFree"] },
          ),
        ],
      },
      {
        name: "کیک و شیرینی",
        nameEn: "Cake and pastry",
        icon: "cake",
        role: "dessert",
        products: [
          lib("چیزکیک نیویورکی", 140_000, 52_000),
          lib("براونی شکلاتی", 120_000, 44_000),
          lib("کروسان بادام", 95_000, 33_000),
          dish(
            "کلوچهٔ فومن",
            "Fuman cookie",
            "تازه، هر روز از فومن",
            "کلوچهٔ سنتی فومن با مغز گردو و هل.",
            60_000,
            20_000,
            { tags: ["vegetarian", "containsNuts"] },
          ),
        ],
      },
      {
        name: "نوشیدنی سرد",
        nameEn: "Cold drinks",
        icon: "cupSoda",
        role: "drink",
        products: [
          lib("لیموناد نعناع", 80_000, 24_000),
          lib("اسموتی انبه", 115_000, 42_000),
        ],
      },
    ],
    stock: [],
    suppliers: [],
    staff: [],
    closer: phone(2),
    openingCash: 0,
    rent: 0,
    payroll: 0,
    marketing: 0,
    branches: [],
    supportTickets: [],
  },

  // --------------------------------------------- 3. small plan, expired
  {
    slug: "golpar",
    name: "شیرینی و قهوه گلپر",
    nameEn: "Golpar Coffee & Sweets",
    kind: "کافه‌قنادی و سوغات",
    city: "اصفهان",
    address: "اصفهان، خیابان چهارباغ عباسی، کوچهٔ مهتاب، پلاک ۲۱",
    tagline: "قهوه، شیرینی تازه و سوغات اصفهان",
    taglineEn: "Coffee, fresh pastry and Isfahan souvenirs",
    description:
      "کافه‌قنادی کوچکی در چهارباغ که کنار قهوه و کیک، گز و سوهان و پستهٔ بسته‌بندی هم می‌فروشد.",
    owner: { phone: phone(3), name: "بهرام شریفی" },
    templateId: "noir",
    theme: { primary: "#9f1239", secondary: "#1f2937" },
    logo: { glyph: "leaf", background: "#1f2937", foreground: "#fda4af" },
    planCode: "tier-small",
    billing: { kind: "expired", endedDaysAgo: 9 },
    hours: { start: 9 * 60, end: 21 * 60 },
    tables: 8,
    signupDaysAgo: 0, // derived from the billing: five paid months ending 9 days ago
    volume: 26,
    profile: "cafe",
    basket: { drink: 0.9, dessert: 0.45, retail: 0.12 },
    settings: {
      onlineOrdering: true,
      onlinePayment: false,
      takeaway: false,
      tax: 0,
      service: 0,
      tip: false,
      rounding: 0,
      bilingual: false,
      phoneCollection: true,
      staffCall: false,
    },
    shares: { takeaway: 0, online: 0, phone: 0.35, manual: 0.25 },
    menu: [
      {
        name: "قهوه و نوشیدنی",
        nameEn: "Coffee and drinks",
        icon: "coffee",
        role: "drink",
        products: [
          lib("اسپرسو", 50_000, 17_000, { pop: 2, recipe: [["دانه قهوه", 0.018]] }),
          lib("لاته", 82_000, 29_000, {
            pop: 4,
            options: [CUP_SIZE],
            recipe: [
              ["دانه قهوه", 0.018],
              ["شیر", 0.2],
            ],
          }),
          lib("موکا", 95_000, 35_000, {
            pop: 2,
            recipe: [
              ["دانه قهوه", 0.018],
              ["شیر", 0.18],
            ],
          }),
          lib("لیموناد نعناع", 75_000, 22_000, { pop: 2 }),
          dish(
            "چای زعفرانی",
            "Saffron tea",
            "با نبات زعفرانی",
            "چای سیاه دم‌کرده با چند رشته زعفران و نبات زعفرانی.",
            65_000,
            18_000,
            { pop: 3, tags: ["vegan", "glutenFree"] },
          ),
        ],
      },
      {
        name: "شیرینی و کیک",
        nameEn: "Pastry and cake",
        icon: "croissant",
        role: "dessert",
        products: [
          lib("کروسان بادام", 90_000, 31_000, { pop: 3, recipe: [["کره حیوانی", 0.03]] }),
          lib("براونی شکلاتی", 115_000, 42_000, { pop: 2 }),
          lib("چیزکیک نیویورکی", 135_000, 50_000, {
            pop: 2,
            recipe: [["پنیر خامه‌ای", 0.09]],
          }),
        ],
      },
      {
        name: "سوغات اصفهان",
        nameEn: "Isfahan souvenirs",
        icon: "candy",
        role: "retail",
        products: [
          lib("گز اصفهان", 520_000, 330_000, { pop: 4, recipe: [["جعبهٔ گز", 1]] }),
          lib("سوهان قم", 420_000, 255_000, { pop: 2, recipe: [["جعبهٔ سوهان", 1]] }),
          lib("پسته اکبری", 950_000, 640_000, { pop: 2, recipe: [["بستهٔ پسته", 1]] }),
          lib("زعفران سرگل", 1_350_000, 930_000, {
            pop: 1,
            recipe: [["بستهٔ زعفران", 1]],
          }),
        ],
      },
    ],
    stock: [
      {
        name: "دانه قهوه",
        unit: "kg",
        price: 1_900_000,
        low: 1,
        supplier: "قهوهٔ زاینده‌رود",
        every: 10,
        pack: 1,
        category: "قهوه",
      },
      {
        name: "شیر",
        unit: "l",
        price: 62_000,
        low: 5,
        supplier: "لبنیات پاک اصفهان",
        every: 2,
        pack: 1,
        perishable: true,
        category: "لبنیات",
      },
      {
        name: "کره حیوانی",
        unit: "kg",
        price: 720_000,
        low: 1,
        supplier: "لبنیات پاک اصفهان",
        every: 5,
        pack: 0.5,
        category: "لبنیات",
      },
      {
        name: "پنیر خامه‌ای",
        unit: "kg",
        price: 540_000,
        low: 1,
        supplier: "لبنیات پاک اصفهان",
        every: 5,
        pack: 0.5,
        perishable: true,
        category: "لبنیات",
      },
      {
        name: "جعبهٔ گز",
        unit: "piece",
        price: 330_000,
        low: 10,
        supplier: "پخش سوغات نقش‌جهان",
        every: 14,
        pack: 10,
        category: "سوغات",
      },
      {
        name: "جعبهٔ سوهان",
        unit: "piece",
        price: 255_000,
        low: 8,
        supplier: "پخش سوغات نقش‌جهان",
        every: 14,
        pack: 10,
        category: "سوغات",
      },
      {
        name: "بستهٔ پسته",
        unit: "piece",
        price: 640_000,
        low: 5,
        supplier: "پخش سوغات نقش‌جهان",
        every: 14,
        pack: 5,
        category: "سوغات",
      },
      {
        name: "بستهٔ زعفران",
        unit: "piece",
        price: 930_000,
        low: 5,
        supplier: "پخش سوغات نقش‌جهان",
        every: 14,
        pack: 5,
        category: "سوغات",
      },
    ],
    suppliers: [
      { name: "قهوهٔ زاینده‌رود", phone: "09120009011" },
      { name: "لبنیات پاک اصفهان", phone: "09120009012" },
      { name: "پخش سوغات نقش‌جهان", phone: "09120009013", note: "تسویه سی‌روزه" },
    ],
    staff: [],
    closer: phone(3),
    openingCash: 800_000,
    rent: 0,
    payroll: 0,
    marketing: 0,
    branches: [],
    supportTickets: [],
  },

  // --------------------------------------------------- 4. medium plan
  {
    slug: "shemshad",
    name: "سفره‌خانه شمشاد",
    nameEn: "Shemshad Persian Kitchen",
    kind: "رستوران سنتی",
    city: "تهران",
    address: "تهران، خیابان ولیعصر، بالاتر از پارک ساعی، کوچهٔ شمشاد، پلاک ۵",
    tagline: "کباب ذغالی و خورش خانگی، از صبحانه تا شام",
    taglineEn: "Charcoal kebabs and home-style stews, breakfast to dinner",
    description:
      "سفره‌خانه‌ای سنتی با حیاط و تخت؛ صبح‌ها صبحانهٔ ایرانی، ظهر و شب کباب ذغالی و خورش‌های خانگی با برنج ایرانی و زعفران قائنات.",
    owner: { phone: phone(4), name: "حسن نوروزی" },
    templateId: "qalam",
    theme: { primary: "#7c2d12", secondary: "#a16207" },
    logo: { glyph: "flame", background: "#7c2d12", foreground: "#fef3c7" },
    planCode: "tier-medium",
    billing: { kind: "yearly" },
    hours: { start: 7 * 60, end: 23 * 60 + 30 },
    tables: 20,
    signupDaysAgo: 180,
    volume: 60,
    profile: "persian",
    basket: { main: 0.92, drink: 0.6, side: 0.45, breakfast: 0.95 },
    settings: {
      onlineOrdering: true,
      onlinePayment: true,
      takeaway: false,
      tax: 10,
      service: 0,
      tip: true,
      rounding: 1_000,
      bilingual: true,
      phoneCollection: true,
      staffCall: true,
    },
    shares: { takeaway: 0, online: 0.25, phone: 0.4, manual: 0.2 },
    menu: [
      {
        name: "صبحانه",
        nameEn: "Breakfast",
        icon: "egg",
        role: "breakfast",
        window: [7 * 60, 11 * 60],
        products: [
          dish(
            "صبحانهٔ کامل سنتی",
            "Full Persian breakfast",
            "نان سنگک، پنیر لیقوان، گردو، سبزی، کره، مربا و چای",
            "سینی کامل صبحانه برای یک نفر: نان سنگک داغ، پنیر لیقوان، گردو، سبزی تازه، کره، مربای خانگی، یک تخم‌مرغ آب‌پز و قوری چای.",
            235_000,
            85_000,
            {
              pop: 4,
              featured: true,
              prep: 8,
              tags: ["vegetarian", "containsNuts", "containsDairy"],
              recipe: [
                ["تخم‌مرغ", 1],
                ["گردو", 0.02],
              ],
            },
          ),
          dish(
            "املت گوجه",
            "Tomato omelette",
            "با نان سنگک تازه",
            "املت گوجه‌فرنگی با کرهٔ محلی، همراه نان سنگک و سبزی خوردن.",
            155_000,
            55_000,
            { pop: 3, prep: 7, tags: ["vegetarian"], recipe: [["تخم‌مرغ", 3]] },
          ),
          dish(
            "عدسی",
            "Lentil soup",
            "با نان سنگک و آبلیمو",
            "عدسی غلیظ با پیاز داغ و گلپر، همراه نان سنگک.",
            120_000,
            35_000,
            { pop: 2, prep: 4, tags: ["vegan"] },
          ),
          dish(
            "حلیم بادمجان",
            "Haleem bademjan",
            "بادمجان، گوشت و کشک",
            "بادمجان کبابی کوبیده با گوشت ریش‌ریش، کشک و نعناع داغ.",
            145_000,
            50_000,
            { pop: 2, prep: 5, tags: ["containsDairy"], recipe: [["بادمجان", 0.25]] },
          ),
        ],
      },
      {
        name: "کباب‌ها",
        nameEn: "Kebabs",
        icon: "flame",
        role: "main",
        products: [
          lib("چلوکباب کوبیده", 420_000, 180_000, {
            pop: 5,
            featured: true,
            options: [RICE_SIDE, KEBAB_EXTRAS],
            recipe: [
              ["گوشت چرخ‌کرده گوسفندی", 0.2],
              ["برنج ایرانی", 0.15],
              ["زعفران", 0.05],
            ],
          }),
          lib("جوجه‌کباب زعفرانی", 380_000, 150_000, {
            pop: 4,
            options: [CHICKEN_CUT, RICE_SIDE],
            recipe: [
              ["سینه مرغ", 0.3],
              ["برنج ایرانی", 0.15],
              ["زعفران", 0.2],
            ],
          }),
          lib("کباب برگ", 560_000, 250_000, {
            pop: 2,
            options: [RICE_SIDE],
            recipe: [
              ["فیله گوسفندی", 0.22],
              ["برنج ایرانی", 0.15],
              ["زعفران", 0.05],
            ],
          }),
          dish(
            "چلوکباب سلطانی",
            "Soltani kebab",
            "یک سیخ برگ و یک سیخ کوبیده",
            "ترکیب کلاسیک یک سیخ کباب برگ و یک سیخ کوبیده، با چلو و گوجهٔ کبابی.",
            790_000,
            360_000,
            {
              pop: 2,
              prep: 22,
              photo: "کباب برگ",
              tags: ["glutenFree"],
              options: [RICE_SIDE],
              recipe: [
                ["گوشت چرخ‌کرده گوسفندی", 0.1],
                ["فیله گوسفندی", 0.18],
                ["برنج ایرانی", 0.15],
                ["زعفران", 0.05],
              ],
            },
          ),
        ],
      },
      {
        name: "خورش‌ها",
        nameEn: "Stews",
        icon: "soup",
        role: "main",
        products: [
          lib("قورمه‌سبزی", 320_000, 125_000, {
            pop: 3,
            recipe: [
              ["گوشت خورشتی", 0.09],
              ["برنج ایرانی", 0.15],
              ["سبزی قورمه", 0.08],
            ],
          }),
          lib("فسنجان", 360_000, 145_000, {
            pop: 2,
            recipe: [
              ["سینه مرغ", 0.15],
              ["گردو", 0.07],
              ["برنج ایرانی", 0.15],
            ],
          }),
          dish(
            "قیمه بادمجان",
            "Gheymeh bademjan",
            "لپه، گوشت و بادمجان سرخ‌کرده",
            "خورش قیمه با لپه و لیمو عمانی و بادمجان سرخ‌شده، با چلو.",
            310_000,
            120_000,
            {
              pop: 2,
              prep: 15,
              tags: ["glutenFree"],
              recipe: [
                ["گوشت خورشتی", 0.09],
                ["برنج ایرانی", 0.15],
                ["بادمجان", 0.15],
              ],
            },
          ),
        ],
      },
      {
        name: "پیش‌غذا",
        nameEn: "Starters",
        icon: "salad",
        role: "side",
        products: [
          lib("کشک بادمجان", 160_000, 55_000, { pop: 3, recipe: [["بادمجان", 0.35]] }),
          lib("ماست و خیار", 95_000, 30_000, { pop: 3, recipe: [["ماست", 0.25]] }),
          dish(
            "سالاد شیرازی",
            "Shirazi salad",
            "خیار، گوجه، پیاز و آبغوره",
            "سالاد تازهٔ خیار و گوجه و پیاز با نعناع خشک و آبغوره.",
            75_000,
            22_000,
            { pop: 3, prep: 3, tags: ["vegan", "glutenFree"] },
          ),
          dish(
            "زیتون پرورده",
            "Zeytoun parvardeh",
            "زیتون، گردو و رب انار",
            "زیتون سبز گیلان پرورده با گردو، رب انار و گلپر.",
            110_000,
            40_000,
            { pop: 1, prep: 2, tags: ["vegan", "glutenFree", "containsNuts"] },
          ),
        ],
      },
      {
        name: "نوشیدنی",
        nameEn: "Drinks",
        icon: "cupSoda",
        role: "drink",
        products: [
          lib("دوغ سنتی", 65_000, 18_000, { pop: 4, recipe: [["دوغ بطری", 1]] }),
          lib("نوشابه", 45_000, 22_000, { pop: 3, recipe: [["نوشابه قوطی", 1]] }),
          dish(
            "چای سنتی و قند",
            "Persian tea",
            "استکان کمرباریک",
            "چای دم‌کشیده در استکان کمرباریک، با قند و خرما.",
            40_000,
            8_000,
            { pop: 3, prep: 2, tags: ["vegan", "glutenFree"] },
          ),
        ],
      },
    ],
    stock: [
      {
        name: "گوشت چرخ‌کرده گوسفندی",
        unit: "kg",
        price: 1_280_000,
        low: 6,
        supplier: "قصابی امین",
        every: 2,
        pack: 1,
        perishable: true,
        category: "گوشت",
      },
      {
        name: "فیله گوسفندی",
        unit: "kg",
        price: 1_980_000,
        low: 3,
        supplier: "قصابی امین",
        every: 2,
        pack: 1,
        perishable: true,
        category: "گوشت",
      },
      {
        name: "گوشت خورشتی",
        unit: "kg",
        price: 1_150_000,
        low: 3,
        supplier: "قصابی امین",
        every: 2,
        pack: 1,
        category: "گوشت",
      },
      {
        name: "سینه مرغ",
        unit: "kg",
        price: 275_000,
        low: 8,
        supplier: "مرغ تازهٔ البرز",
        every: 2,
        pack: 2,
        perishable: true,
        category: "مرغ",
      },
      {
        name: "برنج ایرانی",
        unit: "kg",
        price: 225_000,
        low: 15,
        supplier: "بنکداری برنج شمال",
        every: 7,
        pack: 10,
        category: "خشکبار و غلات",
      },
      {
        name: "زعفران",
        unit: "g",
        price: 520_000,
        low: 20,
        supplier: "خشکبار و عطاری ستاره",
        every: 14,
        pack: 10,
        category: "خشکبار و غلات",
      },
      {
        name: "گردو",
        unit: "kg",
        price: 1_350_000,
        low: 1,
        supplier: "خشکبار و عطاری ستاره",
        every: 14,
        pack: 1,
        category: "خشکبار و غلات",
      },
      {
        name: "سبزی قورمه",
        unit: "kg",
        price: 140_000,
        low: 2,
        supplier: "میدان تره‌بار",
        every: 2,
        pack: 1,
        perishable: true,
        category: "سبزی و صیفی",
      },
      {
        name: "بادمجان",
        unit: "kg",
        price: 60_000,
        low: 5,
        supplier: "میدان تره‌بار",
        every: 2,
        pack: 5,
        perishable: true,
        category: "سبزی و صیفی",
      },
      {
        name: "ماست",
        unit: "kg",
        price: 98_000,
        low: 5,
        supplier: "پخش لبنیات و نوشیدنی کاله",
        every: 3,
        pack: 2,
        perishable: true,
        category: "لبنیات",
      },
      {
        name: "تخم‌مرغ",
        unit: "piece",
        price: 9_500,
        low: 30,
        supplier: "پخش لبنیات و نوشیدنی کاله",
        every: 3,
        pack: 30,
        category: "لبنیات",
      },
      {
        name: "دوغ بطری",
        unit: "piece",
        price: 17_000,
        low: 24,
        supplier: "پخش لبنیات و نوشیدنی کاله",
        every: 3,
        pack: 12,
        category: "نوشیدنی",
      },
      {
        name: "نوشابه قوطی",
        unit: "piece",
        price: 22_000,
        low: 24,
        supplier: "پخش لبنیات و نوشیدنی کاله",
        every: 3,
        pack: 24,
        category: "نوشیدنی",
      },
    ],
    suppliers: [
      {
        name: "قصابی امین",
        phone: "09120009021",
        note: "گوشت گرم، تحویل یک روز در میان",
      },
      { name: "مرغ تازهٔ البرز", phone: "09120009022" },
      { name: "بنکداری برنج شمال", phone: "09120009023" },
      { name: "خشکبار و عطاری ستاره", phone: "09120009024" },
      { name: "میدان تره‌بار", phone: "09120009025" },
      { name: "پخش لبنیات و نوشیدنی کاله", phone: "09120009026", note: "تسویهٔ هفتگی" },
    ],
    staff: [],
    closer: phone(4),
    openingCash: 2_000_000,
    rent: 170_000_000,
    payroll: 560_000_000,
    marketing: 0,
    branches: [],
    supportTickets: [
      {
        subject: "منوی انگلیسی",
        message:
          "چطور ترجمهٔ انگلیسی غذاها را وارد کنم که برای مهمان‌های خارجی نمایش داده شود؟",
        reply:
          "از «تنظیمات» گزینهٔ منوی دوزبانه را روشن کنید؛ بعد در ویرایش هر غذا بخش انگلیسی باز می‌شود.",
        daysAgo: 150,
      },
    ],
  },

  // ---------------------------------------------------- 5. large plan
  {
    slug: "dudi-burger",
    name: "برگرخانه دودی",
    nameEn: "Dudi Burger House",
    kind: "فست‌فود",
    city: "مشهد",
    address: "مشهد، بلوار سجاد، بین سجاد ۱۸ و ۲۰، پلاک ۱۲۴",
    tagline: "برگر ذغالی و سیب‌زمینی دست‌برش، تا دو بامداد",
    taglineEn: "Charcoal burgers and hand-cut fries until 2 a.m.",
    description:
      "برگرخانه‌ای شلوغ در بلوار سجاد با گوشت تازهٔ روزانه، نان مخصوص و سیب‌زمینی دست‌برش. شب‌ها تا ساعت دو باز هستیم؛ سفارش بعد از نیمه‌شب جزو همان شب حساب می‌شود.",
    owner: { phone: phone(5), name: "پویا جعفری" },
    templateId: "ember",
    theme: { primary: "#dc2626", secondary: "#f59e0b" },
    logo: { glyph: "burger", background: "#111827", foreground: "#f59e0b" },
    planCode: "tier-large",
    billing: { kind: "monthly" },
    hours: { start: 12 * 60, end: 2 * 60 },
    tables: 24,
    signupDaysAgo: 170,
    volume: 95,
    profile: "fastfood",
    basket: { main: 0.95, drink: 0.75, side: 0.6 },
    settings: {
      onlineOrdering: true,
      onlinePayment: true,
      takeaway: true,
      tax: 0,
      service: 0,
      tip: false,
      rounding: 1_000,
      bilingual: true,
      phoneCollection: true,
      staffCall: true,
      discountCode: { code: "DUDI15", percent: 15, max: 100_000, sinceDaysAgo: 60 },
    },
    shares: { takeaway: 0.35, online: 0.45, phone: 0.55, manual: 0.2 },
    menu: [
      {
        name: "برگرها",
        nameEn: "Burgers",
        icon: "beef",
        role: "main",
        products: [
          lib("چیزبرگر ویژه", 420_000, 175_000, {
            pop: 5,
            featured: true,
            options: [DONENESS, BURGER_EXTRAS, COMBO],
            recipe: [
              ["نان برگر", 1],
              ["گوشت برگر", 0.16],
              ["پنیر چدار", 0.03],
            ],
          }),
          lib("برگر مرغ سوخاری", 360_000, 140_000, {
            pop: 4,
            options: [BURGER_EXTRAS, COMBO],
            recipe: [
              ["نان برگر", 1],
              ["سینه مرغ", 0.17],
              ["روغن سرخ‌کردنی", 0.04],
            ],
          }),
          lib("برگر گیاهی", 320_000, 105_000, {
            pop: 1,
            options: [COMBO],
            recipe: [["نان برگر", 1]],
          }),
          dish(
            "دبل‌برگر دودی",
            "Dudi double burger",
            "دو لایه گوشت، دو لایه چدار",
            "دو برگر ۱۵۰ گرمی ذغالی با دو لایه پنیر چدار، پیاز کاراملی و سس دودی مخصوص.",
            560_000,
            250_000,
            {
              pop: 3,
              featured: true,
              prep: 14,
              tags: ["containsDairy"],
              options: [DONENESS, BURGER_EXTRAS, COMBO],
              recipe: [
                ["نان برگر", 1],
                ["گوشت برگر", 0.3],
                ["پنیر چدار", 0.05],
              ],
            },
          ),
        ],
      },
      {
        name: "پیتزا",
        nameEn: "Pizza",
        icon: "pizza",
        role: "main",
        products: [
          lib("پیتزا مارگاریتا", 450_000, 165_000, {
            pop: 2,
            options: [PIZZA_SIZE, PIZZA_EXTRAS],
            recipe: [
              ["خمیر پیتزا", 1],
              ["پنیر موزارلا", 0.2],
            ],
          }),
          lib("پیتزا پپرونی", 495_000, 195_000, {
            pop: 3,
            options: [PIZZA_SIZE, PIZZA_EXTRAS],
            recipe: [
              ["خمیر پیتزا", 1],
              ["پنیر موزارلا", 0.18],
            ],
          }),
        ],
      },
      {
        name: "پیش‌غذا و سالاد",
        nameEn: "Sides and salads",
        icon: "salad",
        role: "side",
        products: [
          lib("سیب‌زمینی سرخ‌کرده", 175_000, 50_000, {
            pop: 5,
            options: [FRIES_SAUCE],
            recipe: [
              ["سیب‌زمینی", 0.28],
              ["روغن سرخ‌کردنی", 0.03],
            ],
          }),
          dish(
            "سیب‌زمینی ویژهٔ دودی",
            "Loaded Dudi fries",
            "با سس پنیر، قارچ و ژامبون",
            "سیب‌زمینی دست‌برش با سس پنیر چدار، قارچ سرخ‌شده و ژامبون گوساله.",
            245_000,
            85_000,
            {
              pop: 3,
              prep: 9,
              tags: ["containsDairy"],
              recipe: [
                ["سیب‌زمینی", 0.3],
                ["روغن سرخ‌کردنی", 0.03],
                ["پنیر چدار", 0.04],
              ],
            },
          ),
          lib("سالاد سزار", 260_000, 92_000, {
            pop: 2,
            recipe: [
              ["سینه مرغ", 0.1],
              ["کاهو", 0.15],
            ],
          }),
          dish(
            "ناگت مرغ (۶ تکه)",
            "Chicken nuggets (6)",
            "با سس باربیکیو",
            "شش تکه ناگت سینهٔ مرغ با پودر سوخاری مخصوص، همراه سس باربیکیو.",
            230_000,
            85_000,
            {
              pop: 2,
              prep: 8,
              recipe: [
                ["سینه مرغ", 0.15],
                ["روغن سرخ‌کردنی", 0.03],
              ],
            },
          ),
        ],
      },
      {
        name: "نوشیدنی",
        nameEn: "Drinks",
        icon: "cupSoda",
        role: "drink",
        products: [
          lib("نوشابه", 50_000, 22_000, { pop: 5, recipe: [["نوشابه قوطی", 1]] }),
          lib("دوغ سنتی", 60_000, 16_000, { pop: 3, recipe: [["دوغ بطری", 1]] }),
          lib("لیموناد نعناع", 85_000, 25_000, { pop: 2, recipe: [["لیمو ترش", 0.12]] }),
          dish(
            "آب معدنی",
            "Mineral water",
            "بطری نیم‌لیتری",
            "آب معدنی بطری نیم‌لیتری، خنک.",
            25_000,
            9_000,
            {
              pop: 2,
              prep: 1,
              tags: ["vegan", "glutenFree"],
              recipe: [["آب معدنی", 1]],
            },
          ),
        ],
      },
    ],
    stock: [
      {
        name: "نان برگر",
        unit: "piece",
        price: 9_800,
        low: 60,
        supplier: "نان صنعتی رضوی",
        every: 2,
        pack: 30,
        perishable: true,
        category: "نان و خمیر",
      },
      {
        name: "خمیر پیتزا",
        unit: "piece",
        price: 24_000,
        low: 20,
        supplier: "نان صنعتی رضوی",
        every: 2,
        pack: 10,
        perishable: true,
        category: "نان و خمیر",
      },
      {
        name: "گوشت برگر",
        unit: "kg",
        price: 1_080_000,
        low: 8,
        supplier: "پروتئین طوس",
        every: 2,
        pack: 2,
        perishable: true,
        category: "گوشت و مرغ",
      },
      {
        name: "سینه مرغ",
        unit: "kg",
        price: 280_000,
        low: 8,
        supplier: "پروتئین طوس",
        every: 2,
        pack: 2,
        perishable: true,
        category: "گوشت و مرغ",
      },
      {
        name: "پنیر چدار",
        unit: "kg",
        price: 920_000,
        low: 2,
        supplier: "لبنیات پاک خراسان",
        every: 4,
        pack: 1,
        category: "لبنیات",
      },
      {
        name: "پنیر موزارلا",
        unit: "kg",
        price: 780_000,
        low: 3,
        supplier: "لبنیات پاک خراسان",
        every: 4,
        pack: 1,
        category: "لبنیات",
      },
      {
        name: "سیب‌زمینی",
        unit: "kg",
        price: 48_000,
        low: 30,
        supplier: "بازار میوه و تره‌بار مشهد",
        every: 2,
        pack: 10,
        category: "سبزی و صیفی",
      },
      {
        name: "کاهو",
        unit: "kg",
        price: 70_000,
        low: 3,
        supplier: "بازار میوه و تره‌بار مشهد",
        every: 2,
        pack: 2,
        perishable: true,
        category: "سبزی و صیفی",
      },
      {
        name: "لیمو ترش",
        unit: "kg",
        price: 95_000,
        low: 2,
        supplier: "بازار میوه و تره‌بار مشهد",
        every: 2,
        pack: 2,
        perishable: true,
        category: "سبزی و صیفی",
      },
      {
        name: "روغن سرخ‌کردنی",
        unit: "l",
        price: 140_000,
        low: 10,
        supplier: "پخش نوشیدنی و کالای خراسان",
        every: 7,
        pack: 16,
        category: "کالای خشک",
      },
      {
        name: "نوشابه قوطی",
        unit: "piece",
        price: 22_000,
        low: 48,
        supplier: "پخش نوشیدنی و کالای خراسان",
        every: 7,
        pack: 24,
        category: "نوشیدنی",
      },
      {
        name: "دوغ بطری",
        unit: "piece",
        price: 16_000,
        low: 24,
        supplier: "پخش نوشیدنی و کالای خراسان",
        every: 7,
        pack: 12,
        category: "نوشیدنی",
      },
      {
        name: "آب معدنی",
        unit: "piece",
        price: 8_500,
        low: 24,
        supplier: "پخش نوشیدنی و کالای خراسان",
        every: 7,
        pack: 12,
        category: "نوشیدنی",
      },
    ],
    suppliers: [
      { name: "پروتئین طوس", phone: "09120009031", note: "تسویهٔ پانزده‌روزه" },
      { name: "نان صنعتی رضوی", phone: "09120009032" },
      { name: "لبنیات پاک خراسان", phone: "09120009033" },
      { name: "بازار میوه و تره‌بار مشهد", phone: "09120009034" },
      { name: "پخش نوشیدنی و کالای خراسان", phone: "09120009035" },
    ],
    staff: [
      {
        phone: phone(6),
        name: "مهدی کریمی",
        title: "صندوقدار و سفارش‌ها",
        tabs: ["orders"],
      },
      {
        phone: phone(7),
        name: "لیلا صادقی",
        title: "حسابدار",
        tabs: ["finance", "analytics"],
      },
      {
        phone: phone(8),
        name: "نگین احمدی",
        title: "مسئول منو",
        tabs: ["menu", "design"],
      },
      { phone: phone(9), name: "رضا مرادی", title: "انباردار", tabs: ["inventory"] },
    ],
    closer: phone(6),
    openingCash: 3_000_000,
    rent: 280_000_000,
    payroll: 950_000_000,
    marketing: 35_000_000,
    branches: [],
    supportTickets: [
      {
        subject: "تسویهٔ درگاه پرداخت",
        message: "پول پرداخت‌های آنلاین مشتری‌ها چند روزه به حساب ما می‌نشیند؟",
        reply:
          "پرداخت‌ها مستقیم از درگاه زرین‌پال به حساب خودتان واریز می‌شود؛ معمولاً روز کاری بعد. رستوکار در این مسیر پولی نگه نمی‌دارد.",
        daysAgo: 120,
      },
      {
        subject: "سفارش‌های بعد از نیمه‌شب",
        message: "تا ساعت ۲ باز هستیم؛ سفارش ساعت ۱ در گزارش کدام روز می‌آید؟",
        reply:
          "از «تنظیمات ← ساعت کاری و روز کاری» ساعت ۱۲ تا ۲ را ثبت کنید؛ از آن به بعد سفارش ساعت ۱ جزو همان شب حساب می‌شود.",
        daysAgo: 2,
      },
    ],
  },

  // ------------------------------------------------ 6. unlimited plan
  {
    slug: "bam-tehran",
    name: "رستوران بام",
    nameEn: "Bam Rooftop",
    kind: "رستوران بین‌المللی",
    city: "تهران",
    address: "تهران، سعادت‌آباد، بلوار پاک‌نژاد، طبقهٔ چهاردهم برج نگار",
    tagline: "شام با چشم‌انداز تهران، روی بام",
    taglineEn: "Dinner above Tehran, on the roof",
    description:
      "رستورانی روی بام با شصت میز و منوی فصلی ایتالیایی و فرانسوی؛ آشپزخانه تا ساعت یک بامداد سفارش می‌گیرد.",
    owner: { phone: phone(10), name: "نیلوفر صدری" },
    templateId: "linen",
    theme: { primary: "#1e3a5f", secondary: "#b08d57" },
    logo: { glyph: "moon", background: "#0f172a", foreground: "#e9d5a1" },
    planCode: "tier-unlimited",
    billing: { kind: "contract", months: 12 },
    createdByAdmin: true,
    hours: { start: 13 * 60, end: 60 },
    tables: 60,
    signupDaysAgo: 140,
    volume: 42,
    profile: "bistro",
    basket: { main: 0.9, drink: 0.8, side: 0.55, dessert: 0.35 },
    settings: {
      onlineOrdering: true,
      onlinePayment: true,
      takeaway: false,
      tax: 10,
      service: 10,
      tip: true,
      rounding: 1_000,
      bilingual: true,
      phoneCollection: true,
      staffCall: true,
    },
    shares: { takeaway: 0, online: 0.35, phone: 0.65, manual: 0.3 },
    menu: [
      {
        name: "پیش‌غذا",
        nameEn: "Starters",
        icon: "salad",
        role: "side",
        products: [
          lib("کارپاچیو گوساله", 480_000, 205_000, {
            pop: 3,
            recipe: [["راستهٔ گوساله", 0.08]],
          }),
          lib("سوپ قارچ ترافل", 295_000, 95_000, {
            pop: 3,
            recipe: [
              ["قارچ", 0.12],
              ["خامهٔ آشپزی", 0.05],
            ],
          }),
          lib("سالاد چغندر و پنیر بزی", 340_000, 115_000, {
            pop: 2,
            recipe: [["پنیر بزی", 0.05]],
          }),
          lib("سالاد سزار", 320_000, 110_000, { pop: 2 }),
        ],
      },
      {
        name: "پاستا و ریزوتو",
        nameEn: "Pasta and risotto",
        icon: "wheat",
        role: "main",
        products: [
          lib("ریزوتو قارچ پورچینی", 590_000, 210_000, {
            pop: 3,
            recipe: [
              ["برنج آربوریو", 0.09],
              ["قارچ", 0.08],
              ["خامهٔ آشپزی", 0.03],
            ],
          }),
          lib("پاپاردله با راگوی گوساله", 640_000, 245_000, {
            pop: 3,
            recipe: [
              ["راستهٔ گوساله", 0.12],
              ["خامهٔ آشپزی", 0.03],
            ],
          }),
        ],
      },
      {
        name: "غذای اصلی",
        nameEn: "Mains",
        icon: "utensils",
        role: "main",
        products: [
          lib("استیک ریب‌آی", 1_150_000, 520_000, {
            pop: 4,
            featured: true,
            options: [STEAK_DONENESS, STEAK_SAUCE, FINE_SIDE],
            recipe: [["راستهٔ گوساله", 0.32]],
          }),
          lib("فیله ماهی سالمون", 920_000, 420_000, {
            pop: 3,
            options: [FINE_SIDE],
            recipe: [["ماهی سالمون", 0.2]],
          }),
          lib("ران اردک کنفی", 780_000, 330_000, { pop: 2, recipe: [["ران اردک", 1]] }),
        ],
      },
      {
        name: "دسر",
        nameEn: "Dessert",
        icon: "cake",
        role: "dessert",
        products: [
          lib("سوفله شکلات", 285_000, 88_000, {
            pop: 3,
            featured: true,
            recipe: [["شکلات تلخ", 0.04]],
          }),
          lib("کرم بروله زعفران", 240_000, 72_000, {
            pop: 2,
            recipe: [["خامهٔ آشپزی", 0.1]],
          }),
          lib("تارت لیمو", 230_000, 75_000, { pop: 2, recipe: [["لیمو ترش", 0.05]] }),
        ],
      },
      {
        name: "نوشیدنی",
        nameEn: "Drinks",
        icon: "martini",
        role: "drink",
        products: [
          lib("لیموناد نعناع", 120_000, 30_000, { pop: 3, recipe: [["لیمو ترش", 0.12]] }),
          lib("اسموتی انبه", 165_000, 50_000, { pop: 2 }),
          lib("آیس آمریکانو", 110_000, 28_000, { pop: 2 }),
          lib("اسپرسو", 85_000, 22_000, { pop: 2 }),
          dish(
            "آب معدنی",
            "Mineral water",
            "بطری شیشه‌ای",
            "آب معدنی گازدار یا ساده در بطری شیشه‌ای.",
            45_000,
            12_000,
            {
              pop: 3,
              prep: 1,
              tags: ["vegan", "glutenFree"],
              recipe: [["آب معدنی", 1]],
            },
          ),
        ],
      },
    ],
    stock: [
      {
        name: "راستهٔ گوساله",
        unit: "kg",
        price: 1_950_000,
        low: 4,
        supplier: "گوشت ممتاز تهران",
        every: 3,
        pack: 1,
        perishable: true,
        category: "گوشت",
      },
      {
        name: "ران اردک",
        unit: "piece",
        price: 430_000,
        low: 6,
        supplier: "گوشت ممتاز تهران",
        every: 3,
        pack: 6,
        category: "گوشت",
      },
      {
        name: "ماهی سالمون",
        unit: "kg",
        price: 3_300_000,
        low: 2,
        supplier: "شیلات کیش",
        every: 3,
        pack: 1,
        perishable: true,
        category: "دریایی",
      },
      {
        name: "برنج آربوریو",
        unit: "kg",
        price: 720_000,
        low: 2,
        supplier: "واردات مواد غذایی اروپا",
        every: 14,
        pack: 1,
        category: "وارداتی",
      },
      {
        name: "پنیر بزی",
        unit: "kg",
        price: 1_750_000,
        low: 0.5,
        supplier: "واردات مواد غذایی اروپا",
        every: 14,
        pack: 0.5,
        category: "وارداتی",
      },
      {
        name: "شکلات تلخ",
        unit: "kg",
        price: 1_050_000,
        low: 1,
        supplier: "واردات مواد غذایی اروپا",
        every: 14,
        pack: 1,
        category: "وارداتی",
      },
      {
        name: "خامهٔ آشپزی",
        unit: "l",
        price: 290_000,
        low: 3,
        supplier: "لبنیات دامداران",
        every: 3,
        pack: 1,
        perishable: true,
        category: "لبنیات",
      },
      {
        name: "قارچ",
        unit: "kg",
        price: 195_000,
        low: 3,
        supplier: "تره‌بار گلستان",
        every: 2,
        pack: 2,
        perishable: true,
        category: "سبزی و صیفی",
      },
      {
        name: "لیمو ترش",
        unit: "kg",
        price: 95_000,
        low: 2,
        supplier: "تره‌بار گلستان",
        every: 2,
        pack: 2,
        perishable: true,
        category: "سبزی و صیفی",
      },
      {
        name: "آب معدنی",
        unit: "piece",
        price: 11_000,
        low: 24,
        supplier: "لبنیات دامداران",
        every: 3,
        pack: 24,
        category: "نوشیدنی",
      },
    ],
    suppliers: [
      { name: "گوشت ممتاز تهران", phone: "09120009041" },
      { name: "شیلات کیش", phone: "09120009042" },
      { name: "واردات مواد غذایی اروپا", phone: "09120009043", note: "تسویهٔ سی‌روزه" },
      { name: "لبنیات دامداران", phone: "09120009044" },
      { name: "تره‌بار گلستان", phone: "09120009045" },
    ],
    staff: [
      {
        phone: phone(11),
        name: "امیرحسین طاهری",
        title: "سرپرست سالن",
        tabs: ["orders"],
      },
      {
        phone: phone(12),
        name: "سارا توکلی",
        title: "حسابدار و انبار",
        tabs: ["finance", "analytics", "inventory"],
      },
    ],
    closer: phone(11),
    openingCash: 5_000_000,
    rent: 380_000_000,
    payroll: 1_050_000_000,
    marketing: 60_000_000,
    branches: [],
    supportTickets: [],
  },

  // ---------------------------------------------------- 7. chain plan
  {
    slug: "pizza-tanoor",
    name: "پیتزا تنور",
    nameEn: "Tanoor Pizza",
    kind: "پیتزافروشی زنجیره‌ای",
    city: "تهران",
    address: "تهران، خیابان شریعتی، بالاتر از پل صدر، پلاک ۸۸۰",
    tagline: "پیتزای تنوری با خمیر ۴۸ ساعته، در چهار شعبه",
    taglineEn: "Wood-fired pizza on 48-hour dough, four branches",
    description:
      "زنجیرهٔ پیتزا تنور با آشپزخانهٔ مرکزی در شریعتی و شعبه‌های ونک، تجریش و سعادت‌آباد. منو یکی است؛ هر شعبه انبار، صندوق و ساعت کاری خودش را دارد.",
    owner: { phone: phone(13), name: "کاوه امینی" },
    templateId: "vitrin",
    theme: { primary: "#b91c1c", secondary: "#15803d" },
    logo: { glyph: "pizza", background: "#b91c1c", foreground: "#fef2f2" },
    planCode: "tier-chain",
    billing: { kind: "contract", months: 1 },
    createdByAdmin: true,
    hours: { start: 11 * 60, end: 30 },
    tables: 15,
    signupDaysAgo: 175,
    volume: 40,
    profile: "pizza",
    basket: { main: 0.85, drink: 0.7, side: 0.5 },
    settings: {
      onlineOrdering: true,
      onlinePayment: true,
      takeaway: true,
      tax: 0,
      service: 0,
      tip: false,
      rounding: 0,
      bilingual: false,
      phoneCollection: true,
      staffCall: true,
    },
    shares: { takeaway: 0.25, online: 0.4, phone: 0.5, manual: 0.2 },
    menu: [
      {
        name: "پیتزای تنوری",
        nameEn: "Wood-fired pizza",
        icon: "pizza",
        role: "main",
        products: [
          lib("پیتزا مارگاریتا", 430_000, 155_000, {
            pop: 3,
            options: [PIZZA_SIZE, PIZZA_EXTRAS],
            recipe: [
              ["خمیر پیتزا", 1],
              ["پنیر موزارلا", 0.2],
            ],
          }),
          lib("پیتزا پپرونی", 480_000, 185_000, {
            pop: 4,
            featured: true,
            options: [PIZZA_SIZE, PIZZA_EXTRAS],
            recipe: [
              ["خمیر پیتزا", 1],
              ["پنیر موزارلا", 0.18],
              ["پپرونی", 0.06],
            ],
          }),
          dish(
            "پیتزا قارچ و گوشت",
            "Mushroom and beef pizza",
            "گوشت چرخ‌کرده، قارچ و فلفل دلمه",
            "گوشت چرخ‌کردهٔ تفت‌داده با قارچ تازه و فلفل دلمه روی سس گوجهٔ خانگی.",
            520_000,
            200_000,
            {
              pop: 3,
              prep: 14,
              tags: ["containsDairy"],
              options: [PIZZA_SIZE],
              recipe: [
                ["خمیر پیتزا", 1],
                ["پنیر موزارلا", 0.18],
                ["گوشت چرخ‌کرده", 0.08],
                ["قارچ", 0.06],
              ],
            },
          ),
          dish(
            "پیتزا سبزیجات",
            "Garden pizza",
            "قارچ، زیتون، ذرت و فلفل",
            "سبزیجات فصل روی موزارلا و سس گوجه، بدون گوشت.",
            410_000,
            140_000,
            {
              pop: 2,
              prep: 13,
              tags: ["vegetarian", "containsDairy"],
              options: [PIZZA_SIZE],
              recipe: [
                ["خمیر پیتزا", 1],
                ["پنیر موزارلا", 0.18],
                ["قارچ", 0.05],
              ],
            },
          ),
          dish(
            "پیتزا مخصوص تنور",
            "Tanoor special",
            "پپرونی، گوشت، قارچ و دو پنیر",
            "پیتزای پرملات خانه با پپرونی، گوشت چرخ‌کرده، قارچ و ترکیب موزارلا و چدار.",
            590_000,
            235_000,
            {
              pop: 2,
              featured: true,
              prep: 15,
              tags: ["containsDairy"],
              options: [PIZZA_SIZE],
              recipe: [
                ["خمیر پیتزا", 1],
                ["پنیر موزارلا", 0.2],
                ["پپرونی", 0.04],
                ["گوشت چرخ‌کرده", 0.06],
                ["قارچ", 0.04],
              ],
            },
          ),
        ],
      },
      {
        name: "برگر",
        nameEn: "Burgers",
        icon: "beef",
        role: "main",
        products: [
          lib("چیزبرگر ویژه", 395_000, 165_000, {
            pop: 2,
            options: [DONENESS],
            recipe: [
              ["نان برگر", 1],
              ["گوشت چرخ‌کرده", 0.16],
            ],
          }),
          lib("برگر مرغ سوخاری", 345_000, 135_000, {
            pop: 2,
            recipe: [
              ["نان برگر", 1],
              ["سینه مرغ", 0.17],
            ],
          }),
        ],
      },
      {
        name: "پیش‌غذا",
        nameEn: "Sides",
        icon: "salad",
        role: "side",
        products: [
          lib("سیب‌زمینی سرخ‌کرده", 165_000, 48_000, {
            pop: 5,
            recipe: [["سیب‌زمینی", 0.28]],
          }),
          lib("سالاد سزار", 245_000, 88_000, { pop: 2, recipe: [["سینه مرغ", 0.1]] }),
          dish(
            "نان سیر",
            "Garlic bread",
            "از خمیر پیتزا، با کره و سیر",
            "نان تنوری از خمیر پیتزا با کرهٔ سیر و جعفری، کمی موزارلا.",
            120_000,
            35_000,
            {
              pop: 3,
              prep: 8,
              tags: ["vegetarian", "containsDairy"],
              recipe: [["خمیر پیتزا", 0.5]],
            },
          ),
        ],
      },
      {
        name: "نوشیدنی",
        nameEn: "Drinks",
        icon: "cupSoda",
        role: "drink",
        products: [
          lib("نوشابه", 45_000, 22_000, { pop: 5, recipe: [["نوشابه قوطی", 1]] }),
          lib("دوغ سنتی", 60_000, 16_000, { pop: 3, recipe: [["دوغ بطری", 1]] }),
          lib("لیموناد نعناع", 80_000, 24_000, { pop: 2, recipe: [["لیمو ترش", 0.12]] }),
        ],
      },
    ],
    stock: [
      {
        name: "پنیر موزارلا",
        unit: "kg",
        price: 790_000,
        low: 6,
        supplier: "لبنیات و پنیر کاله",
        every: 3,
        pack: 2,
        category: "لبنیات",
      },
      {
        name: "خمیر پیتزا",
        unit: "piece",
        price: 25_000,
        low: 30,
        supplier: "آشپزخانهٔ مرکزی تنور",
        every: 2,
        pack: 10,
        perishable: true,
        category: "نان و خمیر",
      },
      {
        name: "نان برگر",
        unit: "piece",
        price: 9_800,
        low: 20,
        supplier: "آشپزخانهٔ مرکزی تنور",
        every: 2,
        pack: 10,
        perishable: true,
        category: "نان و خمیر",
      },
      {
        name: "پپرونی",
        unit: "kg",
        price: 1_380_000,
        low: 2,
        supplier: "گوشت و پروتئین البرز",
        every: 3,
        pack: 1,
        category: "گوشت و مرغ",
      },
      {
        name: "گوشت چرخ‌کرده",
        unit: "kg",
        price: 1_100_000,
        low: 3,
        supplier: "گوشت و پروتئین البرز",
        every: 3,
        pack: 1,
        perishable: true,
        category: "گوشت و مرغ",
      },
      {
        name: "سینه مرغ",
        unit: "kg",
        price: 280_000,
        low: 3,
        supplier: "گوشت و پروتئین البرز",
        every: 3,
        pack: 2,
        perishable: true,
        category: "گوشت و مرغ",
      },
      {
        name: "قارچ",
        unit: "kg",
        price: 195_000,
        low: 3,
        supplier: "تره‌بار شمیران",
        every: 2,
        pack: 2,
        perishable: true,
        category: "سبزی و صیفی",
      },
      {
        name: "سیب‌زمینی",
        unit: "kg",
        price: 48_000,
        low: 15,
        supplier: "تره‌بار شمیران",
        every: 2,
        pack: 10,
        category: "سبزی و صیفی",
      },
      {
        name: "لیمو ترش",
        unit: "kg",
        price: 95_000,
        low: 2,
        supplier: "تره‌بار شمیران",
        every: 2,
        pack: 1,
        perishable: true,
        category: "سبزی و صیفی",
      },
      {
        name: "نوشابه قوطی",
        unit: "piece",
        price: 22_000,
        low: 48,
        supplier: "پخش نوشیدنی تهران",
        every: 7,
        pack: 24,
        category: "نوشیدنی",
      },
      {
        name: "دوغ بطری",
        unit: "piece",
        price: 16_000,
        low: 24,
        supplier: "پخش نوشیدنی تهران",
        every: 7,
        pack: 12,
        category: "نوشیدنی",
      },
    ],
    suppliers: [
      { name: "لبنیات و پنیر کاله", phone: "09120009051" },
      { name: "آشپزخانهٔ مرکزی تنور", phone: "09120009052", note: "خمیر و نان روزانه" },
      { name: "گوشت و پروتئین البرز", phone: "09120009053", note: "تسویهٔ پانزده‌روزه" },
      { name: "تره‌بار شمیران", phone: "09120009054" },
      { name: "پخش نوشیدنی تهران", phone: "09120009055" },
    ],
    staff: [
      {
        phone: phone(14),
        name: "الهام رستمی",
        title: "صندوق شعبهٔ مرکزی",
        tabs: ["orders"],
      },
    ],
    closer: phone(14),
    openingCash: 2_000_000,
    rent: 160_000_000,
    payroll: 380_000_000,
    marketing: 40_000_000,
    branches: [
      {
        slug: "pizza-tanoor-vanak",
        name: "پیتزا تنور — شعبهٔ ونک",
        nameEn: "Tanoor Pizza — Vanak",
        address: "تهران، میدان ونک، خیابان ملاصدرا، پلاک ۴۲",
        hours: null,
        tables: 18,
        opensDaysAgo: 175,
        volume: 52,
        manager: { phone: phone(15), name: "آرش زمانی" },
        staff: [
          { phone: phone(16), name: "محمد یزدانی", title: "صندوق ونک", tabs: ["orders"] },
        ],
        openingCash: 2_000_000,
        rent: 210_000_000,
        payroll: 520_000_000,
      },
      {
        slug: "pizza-tanoor-tajrish",
        name: "پیتزا تنور — شعبهٔ تجریش",
        nameEn: "Tanoor Pizza — Tajrish",
        address: "تهران، تجریش، خیابان دربند، پلاک ۱۵",
        hours: { start: 12 * 60, end: 23 * 60 },
        tables: 12,
        opensDaysAgo: 120,
        volume: 34,
        manager: { phone: phone(17), name: "فرناز یوسفی" },
        staff: [
          {
            phone: phone(18),
            name: "علیرضا قنبری",
            title: "صندوق تجریش",
            tabs: ["orders"],
          },
        ],
        openingCash: 1_500_000,
        rent: 150_000_000,
        payroll: 360_000_000,
      },
      {
        slug: "pizza-tanoor-saadatabad",
        name: "پیتزا تنور — شعبهٔ سعادت‌آباد",
        nameEn: "Tanoor Pizza — Saadat Abad",
        address: "تهران، سعادت‌آباد، خیابان سرو غربی، پلاک ۹۰",
        hours: { start: 17 * 60, end: 3 * 60 },
        tables: 14,
        opensDaysAgo: 60,
        volume: 30,
        manager: { phone: phone(19), name: "بابک نیک‌نام" },
        staff: [
          {
            phone: phone(20),
            name: "هانیه فرهادی",
            title: "صندوق سعادت‌آباد",
            tabs: ["orders"],
          },
        ],
        openingCash: 1_500_000,
        rent: 140_000_000,
        payroll: 330_000_000,
      },
    ],
    supportTickets: [
      {
        subject: "افتتاح شعبهٔ سعادت‌آباد",
        message:
          "شعبهٔ جدید داریم؛ منو همان است ولی ساعت کاری‌اش ۵ عصر تا ۳ بامداد است. چطور اضافه کنم؟",
        reply:
          "از صفحهٔ «شعبه‌ها» شعبهٔ تازه بسازید و برای همان شعبه ساعت کاری جدا بگذارید. منو خودکار مشترک است.",
        daysAgo: 62,
      },
    ],
  },
];

// ------------------------------------------------------------ guest names

export const FIRST_NAMES = [
  "سارا",
  "علی",
  "مریم",
  "امیر",
  "نگار",
  "رضا",
  "فاطمه",
  "حسین",
  "زهرا",
  "محمد",
  "پریسا",
  "مهدی",
  "الناز",
  "سینا",
  "یاسمن",
  "آرمان",
  "شیما",
  "کیان",
  "نازنین",
  "پیمان",
  "مینا",
  "بهزاد",
  "ترانه",
  "امید",
  "لیلا",
  "سهیل",
  "مهسا",
  "فرهاد",
  "رویا",
  "حامد",
  "ساناز",
  "میلاد",
  "نسترن",
  "بردیا",
  "هستی",
  "جواد",
  "آیدا",
  "کامران",
  "ستاره",
  "عرفان",
];

export const LAST_NAMES = [
  "محمدی",
  "رضایی",
  "حسینی",
  "کریمی",
  "احمدی",
  "موسوی",
  "نوری",
  "صادقی",
  "قاسمی",
  "جعفری",
  "رحیمی",
  "اکبری",
  "عباسی",
  "شریفی",
  "کاظمی",
  "یزدانی",
  "طاهری",
  "مرادی",
  "نجفی",
  "فراهانی",
  "تهرانی",
  "شیرازی",
  "اصفهانی",
  "خراسانی",
  "گیلانی",
  "بهرامی",
  "سلطانی",
  "حیدری",
  "زمانی",
  "نیک‌پور",
];
