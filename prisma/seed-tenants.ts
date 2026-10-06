/**
 * Creates four *customer* accounts — one per menu template — each with roughly
 * three months of trading history.
 *
 * Purpose: exercise every template with a realistic tenant behind it, so the
 * dashboard, analytics and finance screens all have meaningful data instead of
 * empty states. These are ordinary subscribers (isDemo: false); the four
 * `demo-*` showcase venues created by seed.ts are separate and stay untouched.
 *
 *   npm run db:seed:tenants
 *
 * Idempotent: a slug that already exists is skipped, so re-running is safe.
 */
// MUST be first: refuses to run against anything but a local development
// database, before the client below is constructed.
import "./demo-seed-guard";
import { devPhone } from "./dev-phones";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  CAFE_MENU,
  CUSTOMER_NAMES,
  FINE_DINING_MENU,
  PERSIAN_MENU,
  RESTAURANT_MENU,
  type SeedCategory,
  SEED_DISH_TAGS,
} from "./menu-data";
import { CALENDAR_DAY, businessDateKey, dbDate } from "../src/lib/business-day";

try {
  process.loadEnvFile(".env");
} catch {
  // Environment may already be populated.
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });

/** Three months of history, which is what makes month-over-month comparisons real. */
const DAYS_OF_HISTORY = 92;

interface TenantSpec {
  slug: string;
  name: string;
  nameEn: string;
  tagline: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  templateId: string;
  theme: Record<string, string | number>;
  planCode: string;
  menu: SeedCategory[];
  tableCount: number;
  /** Baseline weekday order count; weekends get ~1.7×. */
  ordersPerWeekday: number;
}

const TENANTS: TenantSpec[] = [
  {
    slug: "kafe-shabaneh",
    name: "کافه شبانه",
    nameEn: "Shabaneh Coffee",
    tagline: "قهوه تخصصی، باز تا نیمه‌شب",
    description: "کافه‌ای برای شب‌زنده‌دارها، با دم‌آوری تخصصی و دسر تازه.",
    ownerName: "سارا موسوی",
    ownerEmail: "sara@kafe-shabaneh.ir",
    templateId: "aurora",
    theme: { primary: "#0f766e", secondary: "#c2410c", surfaceStyle: "glass" },
    planCode: "pro",
    menu: CAFE_MENU,
    tableCount: 10,
    ordersPerWeekday: 16,
  },
  {
    slug: "burger-khaneh",
    name: "برگرخانه آتش",
    nameEn: "Atash Burger House",
    tagline: "برگر ذغالی با نان بریوش خانگی",
    description: "گوشت تازه روزانه، سیب‌زمینی دست‌برش و سس‌های خانگی.",
    ownerName: "امیر تهرانی",
    ownerEmail: "amir@burger-khaneh.ir",
    templateId: "ember",
    theme: { primary: "#dc2626", secondary: "#f59e0b" },
    planCode: "enterprise",
    menu: RESTAURANT_MENU,
    tableCount: 18,
    ordersPerWeekday: 24,
  },
  {
    slug: "sofreh-golestan",
    name: "سفره‌خانه گلستان",
    nameEn: "Golestan Traditional House",
    tagline: "غذای اصیل ایرانی، پخت روزانه",
    description: "چلوکباب، خورشت‌های سنتی و پیش‌غذاهای خانگی در فضایی آرام.",
    ownerName: "حسین کریمی",
    ownerEmail: "hossein@sofreh-golestan.ir",
    templateId: "linen",
    theme: { primary: "#78350f", secondary: "#4d7c0f", surfaceStyle: "flat" },
    planCode: "starter",
    menu: PERSIAN_MENU,
    tableCount: 16,
    ordersPerWeekday: 20,
  },
  {
    slug: "restoran-darvish",
    name: "رستوران درویش",
    nameEn: "Darvish Fine Dining",
    tagline: "منوی فصلی، تجربه‌ای متفاوت",
    description: "آشپزی مدرن با مواد اولیه فصلی و منویی که هر فصل تغییر می‌کند.",
    ownerName: "نگار رحیمی",
    ownerEmail: "negar@restoran-darvish.ir",
    templateId: "noir",
    theme: {
      primary: "#a16207",
      secondary: "#57534e",
      background: "#0c0a09",
      surface: "#1c1917",
      text: "#fafaf9",
      muted: "#a8a29e",
    },
    planCode: "enterprise",
    menu: FINE_DINING_MENU,
    tableCount: 12,
    ordersPerWeekday: 12,
  },
];

interface SeededProduct {
  id: string;
  name: string;
  price: number;
  cost: number;
}

function randomOf<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

async function createOwnerAndRestaurant(spec: TenantSpec) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: spec.planCode } });

  // Clear orphans from an interrupted run: a user with no restaurant at all
  // cannot be a real account, so this is safe.
  await prisma.user.deleteMany({
    where: {
      phone: { in: [devPhone(spec.ownerEmail), devPhone(`kitchen@${spec.slug}.ir`)] },
      restaurantId: null,
      ownedRestaurants: { none: {} },
    },
  });

  const owner = await prisma.user.create({
    data: {
      // Sign-in is phone + code; in development the code is printed to the
      // server console, so these test numbers never receive an SMS.
      phone: devPhone(spec.ownerEmail),
      name: spec.ownerName,
      role: "OWNER",
      // Registered before the trading history starts, so the account looks aged.
      createdAt: daysAgo(DAYS_OF_HISTORY + 5),
    },
  });

  const restaurant = await prisma.restaurant.create({
    data: {
      slug: spec.slug,
      name: spec.name,
      nameEn: spec.nameEn,
      tagline: spec.tagline,
      description: spec.description,
      phone: "021-88776655",
      address: "تهران، خیابان ولیعصر",
      instagram: spec.slug,
      ownerId: owner.id,
      templateId: spec.templateId,
      theme: spec.theme,
      onlinePaymentEnabled: plan.allowsOnlinePay,
      isDemo: false,
      createdAt: daysAgo(DAYS_OF_HISTORY + 5),
    },
  });

  await prisma.user.update({
    where: { id: owner.id },
    data: { restaurantId: restaurant.id },
  });

  await prisma.user.create({
    data: {
      phone: devPhone(`kitchen@${spec.slug}.ir`),
      name: "آشپزخانه",
      role: "STAFF",
      restaurantId: restaurant.id,
    },
  });

  await prisma.subscription.create({
    data: {
      restaurantId: restaurant.id,
      planId: plan.id,
      status: "ACTIVE",
      interval: "monthly",
      startedAt: daysAgo(DAYS_OF_HISTORY + 5),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  await prisma.restaurantTable.createMany({
    data: Array.from({ length: spec.tableCount }, (_, i) => ({
      restaurantId: restaurant.id,
      number: String(i + 1),
      seats: i % 3 === 0 ? 2 : 4,
    })),
  });

  return restaurant;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function createMenu(
  restaurantId: string,
  menu: SeedCategory[],
): Promise<SeededProduct[]> {
  const products: SeededProduct[] = [];

  for (const [categoryIndex, category] of menu.entries()) {
    const created = await prisma.category.create({
      data: {
        restaurantId,
        name: category.name,
        nameEn: category.nameEn,
        icon: category.icon,
        sortOrder: categoryIndex,
      },
    });

    for (const [productIndex, product] of category.products.entries()) {
      const row = await prisma.product.create({
        data: {
          restaurantId,
          categoryId: created.id,
          name: product.name,
          nameEn: product.nameEn,
          shortDescription: product.short,
          fullDescription: product.full,
          price: product.price,
          priceExact: product.price,
          costPrice: product.cost,
          prepMinutes: product.prep ?? null,
          dietaryTags: SEED_DISH_TAGS[product.name] ?? [],
          isFeatured: product.featured ?? false,
          sortOrder: productIndex,
          infoSections: {
            create: product.info.map((section, index) => ({
              title: section.title,
              content: section.content,
              icon: section.icon,
              sortOrder: index,
            })),
          },
        },
      });
      products.push({
        id: row.id,
        name: row.name,
        price: row.price,
        cost: row.costPrice,
      });
    }
  }

  return products;
}

/**
 * Generates the order history and returns revenue per calendar month, which
 * the expense pass needs in order to stay proportionate.
 */
async function createOrders(
  restaurantId: string,
  products: SeededProduct[],
  spec: TenantSpec,
): Promise<{ sequence: number; revenueByMonth: Map<string, number> }> {
  const revenueByMonth = new Map<string, number>();
  let sequence = 0;

  for (let dayOffset = DAYS_OF_HISTORY - 1; dayOffset >= 0; dayOffset--) {
    const day = daysAgo(dayOffset);
    day.setHours(0, 0, 0, 0);

    // Thursday/Friday are the Iranian weekend.
    const weekday = day.getDay();
    const isWeekend = weekday === 4 || weekday === 5;

    // A gentle upward trend across the three months, so month-over-month
    // comparisons show a growing business rather than flat noise.
    const growth = 1 + ((DAYS_OF_HISTORY - dayOffset) / DAYS_OF_HISTORY) * 0.25;
    const base = spec.ordersPerWeekday * (isWeekend ? 1.7 : 1) * growth;
    const orderCount = Math.max(1, Math.round(base * (0.8 + Math.random() * 0.4)));

    const monthKey = `${day.getFullYear()}-${day.getMonth()}`;

    for (let i = 0; i < orderCount; i++) {
      sequence += 1;

      const placedAt = new Date(day);
      const peak = Math.random() < 0.45 ? 13 : 20;
      placedAt.setHours(
        Math.max(9, Math.min(23, peak + Math.floor((Math.random() - 0.5) * 5))),
        Math.floor(Math.random() * 60),
      );

      const lineCount = 1 + Math.floor(Math.random() * 3);
      const chosen = [...products].sort(() => Math.random() - 0.5).slice(0, lineCount);

      const lines = chosen.map((product) => ({
        productId: product.id,
        nameSnapshot: product.name,
        priceSnapshot: product.price,
        costSnapshot: product.cost,
        quantity: 1 + Math.floor(Math.random() * 2),
        note: Math.random() < 0.15 ? "بدون پیاز" : null,
      }));

      const subtotal = lines.reduce((sum, l) => sum + l.priceSnapshot * l.quantity, 0);
      const costTotal = lines.reduce((sum, l) => sum + l.costSnapshot * l.quantity, 0);

      // Today's orders stay mid-workflow so the kitchen board is populated.
      const isToday = dayOffset === 0;
      const status = isToday
        ? randomOf(["RECEIVED", "PREPARING", "READY", "DELIVERED"] as const)
        : Math.random() < 0.04
          ? ("CANCELED" as const)
          : ("DELIVERED" as const);

      if (status !== "CANCELED") {
        revenueByMonth.set(monthKey, (revenueByMonth.get(monthKey) ?? 0) + subtotal);
      }

      await prisma.order.create({
        data: {
          restaurantId,
          orderNumber: sequence,
          publicToken: `t-${restaurantId.slice(-6)}-${sequence}`,
          tableNumber: String(1 + Math.floor(Math.random() * spec.tableCount)),
          customerName: randomOf(CUSTOMER_NAMES),
          note: Math.random() < 0.12 ? "لطفاً سریع‌تر آماده شود" : null,
          status,
          paymentMethod: Math.random() < 0.3 ? "ONLINE" : "CASH_ON_SITE",
          paymentStatus: status === "DELIVERED" ? "PAID" : "PENDING",
          subtotal,
          total: subtotal,
          costTotal,
          placedAt,
          // Calendar-day venue: the business date is the Tehran date.
          businessDate: dbDate(businessDateKey(placedAt, CALENDAR_DAY)),
          createdAt: placedAt,
          deliveredAt:
            status === "DELIVERED" ? new Date(placedAt.getTime() + 22 * 60_000) : null,
          items: { create: lines },
          events: { create: { status: "RECEIVED", createdAt: placedAt } },
        },
      });
    }
  }

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { orderSequence: sequence },
  });

  return { sequence, revenueByMonth };
}

/**
 * Expenses are derived from each month's actual revenue rather than fixed
 * amounts.
 *
 * The original seed used flat figures (~169M/month) that happened to exceed
 * what the generated orders earned, so every finance page opened on a large
 * loss — accurate arithmetic, nonsense as a demo. Cost of goods is already
 * ~33% of revenue via costPrice, so holding other expenses near 50% leaves a
 * believable ~15% net margin.
 */
async function createExpenses(restaurantId: string, revenueByMonth: Map<string, number>) {
  const SHARE_OF_REVENUE = {
    rent: 0.17,
    salary: 0.22,
    utilities: 0.035,
    supplies: 0.05,
    marketing: 0.025,
  } as const;

  const TITLES: Record<keyof typeof SHARE_OF_REVENUE, string> = {
    rent: "اجاره ماهانه",
    salary: "حقوق پرسنل",
    utilities: "قبض برق و گاز",
    supplies: "ملزومات و بسته‌بندی",
    marketing: "تبلیغات اینستاگرام",
  };

  for (const [monthKey, revenue] of revenueByMonth) {
    const [year, month] = monthKey.split("-").map(Number);
    const occurredAt = new Date(year!, month!, 3, 12, 0, 0);

    for (const [category, share] of Object.entries(SHARE_OF_REVENUE)) {
      const jitter = 0.92 + Math.random() * 0.16;
      await prisma.expense.create({
        data: {
          restaurantId,
          title: TITLES[category as keyof typeof SHARE_OF_REVENUE],
          category,
          amount: Math.round(revenue * share * jitter),
          occurredAt,
          isRecurring: category === "rent" || category === "salary",
        },
      });
    }
  }
}

async function seedTenant(spec: TenantSpec) {
  const existing = await prisma.restaurant.findUnique({ where: { slug: spec.slug } });
  if (existing) {
    console.log(`• ${spec.slug} already exists — skipped`);
    return;
  }

  const restaurant = await createOwnerAndRestaurant(spec);
  const products = await createMenu(restaurant.id, spec.menu);
  const { sequence, revenueByMonth } = await createOrders(restaurant.id, products, spec);
  await createExpenses(restaurant.id, revenueByMonth);

  const revenue = [...revenueByMonth.values()].reduce((a, b) => a + b, 0);
  console.log(
    `✓ ${spec.slug.padEnd(20)} ${spec.templateId.padEnd(7)} ` +
      `${products.length} products · ${sequence} orders · ` +
      `${(revenue / 1_000_000).toFixed(0)}M Toman revenue`,
  );
}

async function main() {
  console.log(`Seeding 4 tenant accounts with ${DAYS_OF_HISTORY} days of history…\n`);

  for (const spec of TENANTS) {
    await seedTenant(spec);
  }

  console.log(
    "\nSign in with these numbers; the code is printed in the dev server console:\n",
  );
  for (const spec of TENANTS) {
    console.log(
      `  ${spec.templateId.padEnd(7)} ${devPhone(spec.ownerEmail)}  ${spec.name}`,
    );
  }
  console.log("");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
