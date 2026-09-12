/**
 * Fills the hand-made test accounts with realistic recent trade.
 *
 * The four demo venues and the four template tenants are seeded elsewhere; the
 * accounts here are the ones registered by hand through the UI, which arrive
 * with an empty (or nearly empty) menu and no orders at all. A dashboard with
 * no orders shows zero revenue, zero orders and a zero average — correct, but
 * useless for checking that those tiles work.
 *
 * Safe to re-run: orders it created before are removed first, so the account
 * ends up with one clean stretch of history rather than a growing pile. Nothing
 * outside the listed accounts is touched.
 *
 *   npm run db:seed:sandbox
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CAFE_MENU, PERSIAN_MENU, CUSTOMER_NAMES, type SeedCategory } from "./menu-data";

// Prisma 7 no longer auto-loads .env; the other seeders do the same.
try {
  process.loadEnvFile(".env");
} catch {
  // Environment may already be populated.
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });

/** Orders are spread across this many days, ending today. */
const DAYS_OF_HISTORY = 7;

interface SandboxSpec {
  email: string;
  /** Used only when the account has no menu of its own yet. */
  fallbackMenu: SeedCategory[];
  ordersPerDay: number;
  tableCount: number;
}

const SANDBOX: SandboxSpec[] = [
  {
    email: "arad.kia688@gmail.com",
    fallbackMenu: PERSIAN_MENU,
    ordersPerDay: 6,
    tableCount: 8,
  },
  {
    email: "aradkwork@gmail.com",
    fallbackMenu: CAFE_MENU,
    ordersPerDay: 5,
    tableCount: 6,
  },
];

function randomOf<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

interface SeededProduct {
  id: string;
  name: string;
  price: number;
  cost: number;
}

/**
 * Guarantees the venue has something to sell.
 *
 * An account that already built its own menu keeps it — this only fills the
 * gap for one that was registered and never populated, because orders need
 * products to reference and profit reporting needs a cost price on each.
 */
async function ensureMenu(
  restaurantId: string,
  fallback: SeedCategory[],
): Promise<SeededProduct[]> {
  const existing = await prisma.product.findMany({
    where: { restaurantId },
    select: { id: true, name: true, price: true, costPrice: true },
  });

  // Enough of a menu to produce varied baskets — otherwise every order is
  // identical and the average order value tells you nothing.
  if (existing.length >= 4) {
    return existing.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      cost: p.costPrice,
    }));
  }

  const created: SeededProduct[] = existing.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    cost: p.costPrice,
  }));

  let categoryOrder = await prisma.category.count({ where: { restaurantId } });

  for (const category of fallback.slice(0, 3)) {
    const categoryRow = await prisma.category.create({
      data: {
        restaurantId,
        name: category.name,
        nameEn: category.nameEn,
        icon: category.icon,
        sortOrder: categoryOrder++,
      },
      select: { id: true },
    });

    let productOrder = 0;
    for (const product of category.products.slice(0, 4)) {
      const row = await prisma.product.create({
        data: {
          restaurantId,
          categoryId: categoryRow.id,
          name: product.name,
          nameEn: product.nameEn,
          shortDescription: product.short,
          fullDescription: product.full,
          price: product.price,
          costPrice: product.cost,
          prepMinutes: product.prep ?? null,
          sortOrder: productOrder++,
        },
        select: { id: true, name: true, price: true, costPrice: true },
      });
      created.push({
        id: row.id,
        name: row.name,
        price: row.price,
        cost: row.costPrice,
      });
    }
  }

  return created;
}

async function ensureTables(restaurantId: string, count: number) {
  for (let number = 1; number <= count; number++) {
    // Table numbers are unique per restaurant, so an account that already has
    // some keeps them and only the gaps are filled.
    await prisma.restaurantTable.upsert({
      where: { restaurantId_number: { restaurantId, number: String(number) } },
      update: {},
      create: { restaurantId, number: String(number) },
    });
  }
}

/**
 * Clears history this script wrote previously so a re-run replaces it rather
 * than stacking a second week on top of the first. Recognised by the token
 * prefix below, which no real order ever carries.
 */
const TOKEN_PREFIX = "sandbox-";

async function clearPreviousRun(restaurantId: string): Promise<number> {
  const { count } = await prisma.order.deleteMany({
    where: { restaurantId, publicToken: { startsWith: TOKEN_PREFIX } },
  });
  return count;
}

async function createOrders(
  restaurantId: string,
  products: SeededProduct[],
  spec: SandboxSpec,
): Promise<number> {
  const startingSequence = await prisma.restaurant
    .findUniqueOrThrow({ where: { id: restaurantId }, select: { orderSequence: true } })
    .then((r) => r.orderSequence);

  let sequence = startingSequence;
  let created = 0;

  for (let dayOffset = DAYS_OF_HISTORY - 1; dayOffset >= 0; dayOffset--) {
    const day = daysAgo(dayOffset);
    day.setHours(0, 0, 0, 0);

    const weekday = day.getDay();
    // Thursday and Friday are the Iranian weekend.
    const isWeekend = weekday === 4 || weekday === 5;
    const target = Math.max(
      1,
      Math.round(
        spec.ordersPerDay * (isWeekend ? 1.6 : 1) * (0.75 + Math.random() * 0.5),
      ),
    );

    for (let i = 0; i < target; i++) {
      sequence += 1;

      const placedAt = new Date(day);
      const peak = Math.random() < 0.45 ? 13 : 20;
      const hour = Math.max(
        9,
        Math.min(22, peak + Math.floor((Math.random() - 0.5) * 5)),
      );
      placedAt.setHours(hour, Math.floor(Math.random() * 60), 0, 0);

      // Never place an order in the future: today's slots are capped at now, or
      // "today's revenue" would count takings that have not happened yet.
      if (placedAt.getTime() > Date.now()) continue;

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

      // Today keeps a few orders mid-workflow so the kitchen board and the
      // "in progress" tile have something in them; earlier days are settled.
      const isToday = dayOffset === 0;
      const status = isToday
        ? randomOf(["RECEIVED", "PREPARING", "READY", "DELIVERED", "DELIVERED"] as const)
        : Math.random() < 0.05
          ? ("CANCELED" as const)
          : ("DELIVERED" as const);

      await prisma.order.create({
        data: {
          restaurantId,
          orderNumber: sequence,
          publicToken: `${TOKEN_PREFIX}${restaurantId.slice(-6)}-${sequence}`,
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
          createdAt: placedAt,
          deliveredAt:
            status === "DELIVERED" ? new Date(placedAt.getTime() + 20 * 60_000) : null,
          items: { create: lines },
          events: { create: { status: "RECEIVED", createdAt: placedAt } },
        },
      });

      created += 1;
    }
  }

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { orderSequence: sequence },
  });

  return created;
}

async function main() {
  for (const spec of SANDBOX) {
    const user = await prisma.user.findUnique({
      where: { email: spec.email },
      select: { restaurantId: true, restaurant: { select: { name: true, slug: true } } },
    });

    if (!user?.restaurantId || !user.restaurant) {
      console.log(`• ${spec.email} — no restaurant on this account, skipped`);
      continue;
    }

    const restaurantId = user.restaurantId;

    const removed = await clearPreviousRun(restaurantId);
    const products = await ensureMenu(restaurantId, spec.fallbackMenu);
    await ensureTables(restaurantId, spec.tableCount);
    const orders = await createOrders(restaurantId, products, spec);

    console.log(
      `• ${user.restaurant.name} (${user.restaurant.slug}) — ` +
        `${products.length} products, ${orders} orders over ${DAYS_OF_HISTORY} days` +
        (removed > 0 ? `, replaced ${removed} from a previous run` : ""),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
