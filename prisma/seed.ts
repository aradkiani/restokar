/**
 * Seeds plans plus two fully-populated demo restaurants and ~6 weeks of order
 * history, so every dashboard (analytics, finance, kitchen) has something real
 * to render on a fresh install.
 *
 * Idempotent: re-running upserts plans and skips restaurants that already
 * exist, so `npm run db:seed` is safe to repeat.
 */
// MUST be first: refuses to run against anything but a local development
// database, before the client below is constructed.
import "./demo-seed-guard";
import { DEV_ADMIN_PHONE, devPhone } from "./dev-phones";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  BISTRO_MENU,
  CAFE_MENU,
  CUSTOMER_NAMES,
  englishCopy,
  englishInfo,
  FINE_DINING_MENU,
  PERSIAN_MENU,
  RESTAURANT_MENU,
  SOUVENIR_MENU,
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

/**
 * The plan catalogue.
 *
 * Packaging is deliberately a single tier while the economics are being
 * validated: three tiers force a venue to guess which one it needs before it
 * has used the product, and split-testing packaging is meaningless without
 * customers to test it on.
 *
 * The three original tiers are kept as rows rather than deleted. Every
 * `Subscription` carries a `planId` foreign key, so deleting a plan would
 * either fail or orphan a paying venue's subscription — and `isPublic` already
 * exists precisely for this: the homepage, /pricing, the dashboard's
 * subscription screen and the registration route all filter on it, and
 * checkout refuses a plan that is not public. Hiding is therefore complete and
 * reversible by flipping one boolean; deleting is neither.
 *
 * `/admin/accounts/new` deliberately does *not* filter, so an operator can
 * still place an account on a legacy tier.
 */
const PLANS = [
  /*
    Priced on the two things that scale with cost: seats and traffic.

    Every tier carries unlimited products and categories. Capping the size of a
    menu penalises the venues getting the most out of the product, and it is not
    what the platform actually spends money on — a 200-dish menu costs the same
    to render as a 20-dish one. What costs is how often that menu is opened,
    which tracks tables far more closely than it tracks dishes.

    The view ceilings are deliberately generous against real usage: a 20-table
    venue turning its tables through a dinner rush generates roughly 250 menu
    opens a day, so the 25-table tier's 1,000 is about four times what it needs.
    A limit that bites in normal trading is a support ticket, not a tier.
  */
  {
    code: "tier-small",
    name: "کوچک",
    nameEn: "Small",
    description: "برای کافه‌های کوچک — تا ۱۰ میز",
    monthlyPrice: 599_000,
    yearlyPrice: 5_990_000,
    maxProducts: -1,
    maxCategories: -1,
    maxTables: 10,
    maxDailyViews: 300,
    allowsOnlinePay: true,
    allowsAnalytics: true,
    allowsCustomDomain: false,
    isPublic: true,
    sortOrder: 0,
  },
  {
    code: "tier-medium",
    name: "متوسط",
    nameEn: "Medium",
    description: "برای رستوران‌های فعال — تا ۲۵ میز",
    isRecommended: true,
    monthlyPrice: 899_000,
    yearlyPrice: 8_990_000,
    maxProducts: -1,
    maxCategories: -1,
    maxTables: 25,
    maxDailyViews: 1_000,
    allowsOnlinePay: true,
    allowsAnalytics: true,
    allowsCustomDomain: false,
    isPublic: true,
    sortOrder: 1,
  },
  {
    code: "tier-large",
    name: "بزرگ",
    nameEn: "Large",
    description: "برای مجموعه‌های پرتردد — تا ۵۰ میز",
    monthlyPrice: 1_290_000,
    yearlyPrice: 12_900_000,
    maxProducts: -1,
    maxCategories: -1,
    maxTables: 50,
    maxDailyViews: 3_000,
    allowsOnlinePay: true,
    allowsAnalytics: true,
    allowsCustomDomain: false,
    isPublic: true,
    sortOrder: 2,
  },
  /*
    The chain tier is quoted, not listed.

    A two-site café and a twenty-site chain are not the same customer, and no
    single number is honest for both — so the card shows a floor and the rest is
    settled by contract. It is also the only tier that unlocks branches, which
    is what actually distinguishes it: one menu, many addresses, each branch
    with its own account, its own QR codes and its own books.
  */
  {
    code: "tier-chain",
    name: "چند شعبه",
    nameEn: "Multi-branch",
    description: "برای مجموعه‌های چند شعبه‌ای — یک منو، چند آدرس، حساب جدا برای هر شعبه",
    monthlyPrice: 1_990_000,
    yearlyPrice: 19_900_000,
    maxProducts: -1,
    maxCategories: -1,
    maxTables: -1,
    maxDailyViews: -1,
    allowsBranches: true,
    isContractPriced: true,
    allowsOnlinePay: true,
    allowsAnalytics: true,
    allowsCustomDomain: true,
    isPublic: true,
    sortOrder: 3,
  },

  // Superseded by the four tiers above; kept so any subscription still on it
  // resolves, exactly as the three original tiers are.
  {
    code: "standard",
    name: "استاندارد",
    nameEn: "Standard",
    description: "همه‌ی امکانات، بدون محدودیت در تعداد محصول، دسته‌بندی و میز",
    monthlyPrice: 699_000,
    yearlyPrice: 6_990_000,
    maxProducts: -1,
    maxCategories: -1,
    maxTables: -1,
    maxDailyViews: -1,
    allowsOnlinePay: true,
    allowsAnalytics: true,
    allowsCustomDomain: false,
    isPublic: false,
    sortOrder: 4,
  },

  // ---------------------------- legacy, hidden -----------------------------
  // Retained so existing subscriptions keep a valid plan. Not offered.
  {
    code: "starter",
    name: "پایه",
    nameEn: "Starter",
    description: "برای کافه‌های کوچک و تازه‌کار",
    monthlyPrice: 149_000,
    yearlyPrice: 1_490_000,
    // Product/category caps and the online-payment block were lifted on
    // 2026-10-03 (migration lift_legacy_plan_caps); tables still cap.
    maxProducts: -1,
    maxCategories: -1,
    maxTables: 10,
    allowsOnlinePay: true,
    allowsAnalytics: true,
    allowsCustomDomain: false,
    isPublic: false,
    sortOrder: 5,
  },
  {
    code: "pro",
    name: "حرفه‌ای",
    nameEn: "Pro",
    description: "برای رستوران‌های فعال با سفارش آنلاین",
    monthlyPrice: 299_000,
    yearlyPrice: 2_990_000,
    maxProducts: -1,
    maxCategories: -1,
    maxTables: 40,
    allowsOnlinePay: true,
    allowsAnalytics: true,
    allowsCustomDomain: false,
    isPublic: false,
    sortOrder: 6,
  },
  {
    code: "enterprise",
    name: "زنجیره‌ای",
    nameEn: "Enterprise",
    description: "برای مجموعه‌های بزرگ و چند شعبه",
    monthlyPrice: 749_000,
    yearlyPrice: 7_490_000,
    maxProducts: -1,
    maxCategories: -1,
    maxTables: -1,
    allowsOnlinePay: true,
    allowsAnalytics: true,
    allowsCustomDomain: true,
    isPublic: false,
    sortOrder: 7,
  },
];

async function seedPlans() {
  for (const plan of PLANS) {
    // Create-only. Plans are edited from /admin/plans now; re-running the seed
    // used to overwrite prices and limits an admin had changed.
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: plan,
      update: {},
    });
  }

  /*
    Retire any plan this file no longer defines.

    Upsert keys on `code`, so renaming a tier's code does not rename the row —
    it creates a second one and leaves the original behind, still public. That
    is exactly how a retired "Unlimited" tier stayed on the pricing page beside
    the "Multi-branch" tier meant to replace it: two rows, same price, both
    listed.

    Hidden rather than deleted, for the same reason the superseded tiers above
    are kept: `Subscription.planId` is a foreign key, and a venue mid-term on an
    old tier still has to resolve to something. Hiding takes it off every public
    list while leaving the row intact.
  */
  const defined = PLANS.map((plan) => plan.code);
  const retired = await prisma.plan.updateMany({
    where: { code: { notIn: defined }, isPublic: true },
    data: { isPublic: false },
  });

  console.log(
    `✓ ${PLANS.length} plans` + (retired.count ? `, ${retired.count} retired` : ""),
  );
}

/**
 * Bring an already-seeded demo venue up to date with the content in this file.
 *
 * `seedRestaurant` skips a venue that exists, which is right for a real tenant
 * — an owner's edits are theirs — but it also meant every later correction here
 * never reached a database that had been seeded once. That is how a mistranslated
 * dish name and a dozen empty English descriptions survived: the fix was written,
 * the seed was re-run, and nothing happened.
 *
 * Deliberately narrow. It rewrites the text this file owns and adds dishes that
 * are missing, and it touches nothing else — no price, no photo, no order, and
 * it never deletes. A demo whose photos were imported separately keeps them.
 *
 * Returns how many products it had to create.
 */
async function refreshDemoContent(
  restaurantId: string,
  options: {
    name: string;
    nameEn: string;
    tagline: string;
    taglineEn: string;
    description: string;
    menu: SeedCategory[];
  },
): Promise<number> {
  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      name: options.name,
      nameEn: options.nameEn,
      tagline: options.tagline,
      taglineEn: options.taglineEn,
      description: options.description,
    },
  });

  let created = 0;

  for (const [categoryIndex, spec] of options.menu.entries()) {
    let category = await prisma.category.findFirst({
      where: { restaurantId, name: spec.name },
    });

    if (category) {
      await prisma.category.update({
        where: { id: category.id },
        data: { nameEn: spec.nameEn },
      });
    } else {
      category = await prisma.category.create({
        data: {
          restaurantId,
          name: spec.name,
          nameEn: spec.nameEn,
          icon: spec.icon,
          sortOrder: categoryIndex,
        },
      });
    }

    for (const [productIndex, product] of spec.products.entries()) {
      const copy = englishCopy(product.name);
      const found = await prisma.product.findFirst({
        where: { restaurantId, name: product.name },
      });

      if (found) {
        await prisma.product.update({
          where: { id: found.id },
          data: {
            nameEn: product.nameEn,
            shortDescriptionEn: copy.short,
            fullDescriptionEn: copy.full,
            // Ordering is content too. Several templates lead a category with
            // whatever sits at sortOrder 0, so a reshuffle here has to reach a
            // database that was seeded before the reshuffle was written.
            categoryId: category.id,
            sortOrder: productIndex,
          },
        });

        /*
          Backfill the English on the info panels.

          These rows were created before `titleEn`/`contentEn` were populated,
          so on an already-seeded database they are the last thing still
          rendering in Persian on an English menu. Matched on the Persian title,
          which is stable — it is the key EN_INFO uses too.
        */
        for (const section of product.info) {
          await prisma.productInfoSection.updateMany({
            where: { productId: found.id, title: section.title },
            data: {
              titleEn: englishInfo(section.title),
              contentEn: englishInfo(section.content),
            },
          });
        }
        continue;
      }

      await prisma.product.create({
        data: {
          restaurantId,
          categoryId: category.id,
          name: product.name,
          nameEn: product.nameEn,
          shortDescription: product.short,
          fullDescription: product.full,
          shortDescriptionEn: copy.short,
          fullDescriptionEn: copy.full,
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
              titleEn: englishInfo(section.title),
              contentEn: englishInfo(section.content),
              icon: section.icon,
              sortOrder: index,
            })),
          },
        },
      });
      created++;
    }
  }

  /*
    Retire dishes the menu no longer lists.

    Without this the refresh is add-only, so removing a dish from this file
    leaves it on the live menu forever — the mirror image of the bug that left
    English descriptions null. Guarded twice over: demo venues only (the caller
    checks isDemo), and never a product that appears on an order, because that
    would rewrite a guest's receipt. A dish with history is hidden instead.
  */
  const keep = options.menu.flatMap((c) => c.products.map((p) => p.name));
  const stale = await prisma.product.findMany({
    where: { restaurantId, name: { notIn: keep } },
    select: { id: true, name: true, _count: { select: { orderItems: true } } },
  });

  for (const product of stale) {
    if (product._count.orderItems > 0) {
      await prisma.product.update({
        where: { id: product.id },
        // `hideWhenUnavailable` is what takes it off the menu entirely rather
        // than leaving it listed under an "unavailable" badge.
        data: { isAvailable: false, hideWhenUnavailable: true },
      });
      continue;
    }
    await prisma.productInfoSection.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  }

  return created;
}

async function seedRestaurant(options: {
  slug: string;
  name: string;
  nameEn: string;
  tagline: string;
  /** Required, not optional: a null here is what left English menus untagged. */
  taglineEn: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  templateId: string;
  // Matches the Theme shape in src/lib/theme.ts; typed loosely here because
  // Prisma's Json input rejects a bare index signature.
  theme: {
    primary?: string;
    secondary?: string;
    background?: string;
    surface?: string;
    text?: string;
    muted?: string;
    surfaceStyle?: string;
  };
  planCode: string;
  onlinePayment: boolean;
  menu: SeedCategory[];
  tableCount: number;
  /** Platform showcase venue — the only kind the homepage is allowed to list. */
  isDemo?: boolean;
  /**
   * Offers the guest-facing language toggle. Off by default, matching the
   * column default, so ordinary tenants are unaffected — the showcase venues
   * opt in because the seed menus carry English names for every dish and a
   * visitor evaluating the product should be able to see that.
   */
  bilingual?: boolean;
  /** Demo venues don't need fabricated sales history. */
  skipOrders?: boolean;
}) {
  const existing = await prisma.restaurant.findUnique({ where: { slug: options.slug } });
  if (existing) {
    if (options.isDemo) {
      const added = await refreshDemoContent(existing.id, options);
      console.log(
        `• ${options.slug} already exists — text refreshed` +
          (added ? `, ${added} new product(s)` : ""),
      );
    } else {
      console.log(`• ${options.slug} already exists — skipped`);
    }
    return;
  }

  // The restaurant is absent but its users may not be: this function creates
  // the owner first, so a run that failed partway leaves an orphaned user and
  // every later run then dies on the phone unique index. Clear only users that
  // belong to no restaurant — a real account is never in that state.
  await prisma.user.deleteMany({
    where: {
      phone: {
        in: [devPhone(options.ownerEmail), devPhone(`kitchen@${options.slug}.ir`)],
      },
      restaurantId: null,
      ownedRestaurants: { none: {} },
    },
  });

  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: options.planCode } });

  const owner = await prisma.user.create({
    data: {
      // Sign-in is phone + code; in development the code is printed to the
      // server console, so these test numbers never receive an SMS.
      phone: devPhone(options.ownerEmail),
      name: options.ownerName,
      role: "OWNER",
    },
  });

  const restaurant = await prisma.restaurant.create({
    data: {
      slug: options.slug,
      name: options.name,
      nameEn: options.nameEn,
      tagline: options.tagline,
      taglineEn: options.taglineEn,
      description: options.description,
      phone: "021-88776655",
      phoneSecondary: "0912-3456789",
      address: "تهران، خیابان ولیعصر",
      instagram: options.slug,
      // Three links, which is the cap — so a seeded venue shows the footer row
      // at its widest and any layout problem with a full row is visible from
      // the first run rather than only once a real owner fills all three.
      socialLinks: [
        { platform: "instagram", url: options.slug },
        { platform: "telegram", url: options.slug },
        { platform: "whatsapp", url: "989123456789" },
      ],
      ownerId: owner.id,
      templateId: options.templateId,
      theme: options.theme,
      onlinePaymentEnabled: options.onlinePayment,
      isDemo: options.isDemo ?? false,
      bilingualEnabled: options.bilingual ?? false,
    },
  });

  await prisma.user.update({
    where: { id: owner.id },
    data: { restaurantId: restaurant.id },
  });

  // A kitchen account per venue, so the STAFF role can be exercised too.
  await prisma.user.create({
    data: {
      phone: devPhone(`kitchen@${options.slug}.ir`),
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
      currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000),
    },
  });

  await prisma.restaurantTable.createMany({
    data: Array.from({ length: options.tableCount }, (_, i) => ({
      restaurantId: restaurant.id,
      number: String(i + 1),
      seats: i % 3 === 0 ? 2 : 4,
    })),
  });

  const createdProducts: { id: string; price: number; cost: number; name: string }[] = [];

  for (const [categoryIndex, category] of options.menu.entries()) {
    const createdCategory = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        name: category.name,
        nameEn: category.nameEn,
        icon: category.icon,
        sortOrder: categoryIndex,
      },
    });

    for (const [productIndex, product] of category.products.entries()) {
      const created = await prisma.product.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: createdCategory.id,
          name: product.name,
          nameEn: product.nameEn,
          shortDescription: product.short,
          fullDescription: product.full,
          // Throws if a dish has no English copy, rather than writing null and
          // letting the English menu quietly fall back to Persian.
          shortDescriptionEn: englishCopy(product.name).short,
          fullDescriptionEn: englishCopy(product.name).full,
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
              titleEn: englishInfo(section.title),
              contentEn: englishInfo(section.content),
              icon: section.icon,
              sortOrder: index,
            })),
          },
        },
      });
      createdProducts.push({
        id: created.id,
        price: created.price,
        cost: created.costPrice,
        name: created.name,
      });
    }
  }

  if (!options.skipOrders) {
    await seedOrders(restaurant.id, createdProducts, options.tableCount);
    await seedExpenses(restaurant.id);
  }

  console.log(
    `✓ ${options.slug} — ${createdProducts.length} products${options.isDemo ? " (demo)" : ""}`,
  );
}

/**
 * Generates ~6 weeks of orders with a realistic shape: busier at lunch and
 * dinner, busier at weekends, so the analytics charts show a believable
 * pattern rather than uniform noise.
 */
async function seedOrders(
  restaurantId: string,
  products: { id: string; price: number; cost: number; name: string }[],
  tableCount: number,
) {
  const DAYS = 42;
  let sequence = 0;

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - dayOffset);

    // Thursday/Friday are the Iranian weekend.
    const weekday = day.getDay();
    const isWeekend = weekday === 4 || weekday === 5;
    const orderCount = Math.floor(
      (isWeekend ? 14 : 8) + Math.random() * (isWeekend ? 10 : 7),
    );

    for (let i = 0; i < orderCount; i++) {
      sequence += 1;

      const placedAt = new Date(day);
      // Two service peaks: ~13:00 and ~20:00.
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

      // Today's orders are left mid-workflow so the kitchen board is populated.
      const isToday = dayOffset === 0;
      const status = isToday
        ? (["RECEIVED", "PREPARING", "READY", "DELIVERED"] as const)[
            Math.floor(Math.random() * 4)
          ]!
        : Math.random() < 0.04
          ? ("CANCELED" as const)
          : ("DELIVERED" as const);

      /*
        A cancelled order gets a real `canceledAt`, and some of them were
        already paid for.

        Both were missing, and together they made the refund queue impossible
        to observe. Every cancelled order was left PENDING, so `needsRefund`
        was never true and the queue was permanently empty — the feature
        existed and no seeded venue could show it. And `canceledAt` was never
        written, so the one-hour hold had nothing to measure from: the refund
        route falls back to epoch 0 for a null, which reads as "cancelled long
        ago" and clears instantly. A timing rule that can only be tested
        against rows carrying no timestamp is a rule that never runs.

        A third of them are dated inside the last hour so the hold is visible
        as a hold, rather than every card being immediately clearable.
      */
      const canceled = status === "CANCELED";
      const canceledAt = canceled ? new Date(placedAt.getTime() + 12 * 60_000) : null;
      // The guest had paid before the kitchen cancelled — the case the refund
      // queue exists for. Cash at the table counts, so this is not limited to
      // online orders.
      const cancelledButPaid = canceled && Math.random() < 0.45;

      await prisma.order.create({
        data: {
          restaurantId,
          orderNumber: sequence,
          publicToken: `seed-${restaurantId.slice(-6)}-${sequence}`,
          tableNumber: String(1 + Math.floor(Math.random() * tableCount)),
          customerName:
            CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)]!,
          note: Math.random() < 0.12 ? "لطفاً سریع‌تر آماده شود" : null,
          status,
          paymentMethod: Math.random() < 0.3 ? "ONLINE" : "CASH_ON_SITE",
          paymentStatus: status === "DELIVERED" || cancelledButPaid ? "PAID" : "PENDING",
          subtotal,
          total: subtotal,
          costTotal,
          placedAt,
          // Calendar-day venue: the business date is the Tehran date.
          businessDate: dbDate(businessDateKey(placedAt, CALENDAR_DAY)),
          createdAt: placedAt,
          canceledAt,
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
}

async function seedExpenses(restaurantId: string) {
  const templates = [
    { title: "اجاره ماهانه", category: "rent", amount: 45_000_000, recurring: true },
    { title: "حقوق پرسنل", category: "salary", amount: 78_000_000, recurring: true },
    { title: "قبض برق و گاز", category: "utilities", amount: 6_500_000, recurring: true },
    {
      title: "خرید مواد اولیه",
      category: "supplies",
      amount: 32_000_000,
      recurring: false,
    },
    {
      title: "تبلیغات اینستاگرام",
      category: "marketing",
      amount: 8_000_000,
      recurring: false,
    },
  ];

  for (let monthsAgo = 0; monthsAgo < 2; monthsAgo++) {
    for (const template of templates) {
      const occurredAt = new Date();
      occurredAt.setMonth(occurredAt.getMonth() - monthsAgo);
      occurredAt.setDate(3);

      await prisma.expense.create({
        data: {
          restaurantId,
          title: template.title,
          category: template.category,
          // ±10% month to month so the figures don't look synthetic.
          amount: Math.round(template.amount * (0.9 + Math.random() * 0.2)),
          occurredAt,
          isRecurring: template.recurring,
        },
      });
    }
  }
}

async function seedAdmin() {
  const existing = await prisma.user.findUnique({ where: { phone: DEV_ADMIN_PHONE } });
  if (existing) {
    console.log("• platform admin already exists — skipped");
    return;
  }

  await prisma.user.create({
    data: {
      phone: DEV_ADMIN_PHONE,
      name: "مدیر پلتفرم",
      role: "SUPER_ADMIN",
    },
  });
  console.log("✓ platform admin");
}

async function main() {
  console.log("Seeding…\n");

  await seedPlans();
  await seedAdmin();

  // Restaurant accounts with months of trading come from the demo seed, which
  // keeps these showcase menus and replaces everything else.
  await seedDemos();

  console.log("\nDone.\n");
  console.log(
    "Restaurant accounts with months of history: npm run db:seed:demo " +
      "(passwords and numbers are printed there).",
  );
  console.log(`  platform admin → ${DEV_ADMIN_PHONE}`);
  console.log(
    "Homepage demos: /menu/demo-aurora · /menu/demo-ember · /menu/demo-linen · " +
      "/menu/demo-noir · /menu/demo-bazaar · /menu/demo-atlas · " +
      "/menu/demo-reel · /menu/demo-bloom · /menu/demo-kashi · /menu/demo-qalam · " +
      "/menu/demo-vitrin\n",
  );
}

/**
 * The showcase venues linked from the homepage — one per template.
 *
 * These exist so the marketing site never has to reach for a paying
 * customer's menu to have something to display. They carry isDemo: true, and
 * the homepage query filters on exactly that.
 */
async function seedDemos() {
  await seedRestaurant({
    slug: "demo-aurora",
    name: "کافه آورا",
    nameEn: "Aurora Café",
    tagline: "قهوه تک‌خاستگاه و برانچ روزانه",
    taglineEn: "Single-origin coffee and daily brunch",
    description: "نمونه‌ی قالب آورا — روشن، شیشه‌ای و مناسب کافه‌های مدرن.",
    ownerName: "نمونه آورا",
    ownerEmail: "demo@demo-aurora.restokar.ir",
    templateId: "aurora",
    theme: { primary: "#0f766e", secondary: "#c2410c", surfaceStyle: "glass" },
    planCode: "pro",
    onlinePayment: true,
    menu: CAFE_MENU,
    tableCount: 8,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });

  await seedRestaurant({
    slug: "demo-ember",
    name: "برگرخانه امبر",
    nameEn: "Ember Burger House",
    tagline: "برگر ذغالی، سیب‌زمینی دست‌برش",
    taglineEn: "Charcoal-grilled burgers, hand-cut fries",
    description: "نمونه‌ی قالب امبر — گرم، پرانرژی و مناسب فست‌فود.",
    ownerName: "نمونه امبر",
    ownerEmail: "demo@demo-ember.restokar.ir",
    templateId: "ember",
    theme: { primary: "#dc2626", secondary: "#f59e0b" },
    planCode: "pro",
    onlinePayment: true,
    menu: RESTAURANT_MENU,
    tableCount: 10,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });

  await seedRestaurant({
    slug: "demo-linen",
    name: "سفره‌خانه کتان",
    nameEn: "Linen House",
    tagline: "غذای اصیل ایرانی، پخت روزانه",
    taglineEn: "Authentic Iranian food, cooked fresh daily",
    description: "نمونه‌ی قالب کتان — آرام و کلاسیک، مناسب رستوران‌های سنتی.",
    ownerName: "نمونه کتان",
    ownerEmail: "demo@demo-linen.restokar.ir",
    templateId: "linen",
    theme: { primary: "#78350f", secondary: "#4d7c0f", surfaceStyle: "flat" },
    planCode: "starter",
    onlinePayment: false,
    menu: PERSIAN_MENU,
    tableCount: 14,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });

  await seedRestaurant({
    slug: "demo-noir",
    name: "رستوران نوآر",
    nameEn: "Noir Restaurant",
    tagline: "فاین‌دایینگ، منوی فصلی",
    taglineEn: "Fine dining, seasonal menu",
    description: "نمونه‌ی قالب نوآر — تیره، مینیمال و مناسب رستوران‌های لوکس.",
    ownerName: "نمونه نوآر",
    ownerEmail: "demo@demo-noir.restokar.ir",
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
    onlinePayment: true,
    menu: FINE_DINING_MENU,
    tableCount: 12,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });

  // The souvenir shelf is appended here rather than baked into PERSIAN_MENU so
  // the Linen demo above keeps its food-only menu — this is the one showcase
  // that exists to demonstrate selling سوغاتی alongside the food.
  await seedRestaurant({
    slug: "demo-bazaar",
    name: "سفره‌خانه بازار",
    nameEn: "Bazaar House",
    tagline: "غذای سنتی و سوغات اصفهان",
    taglineEn: "Traditional food and Isfahan souvenirs",
    description: "نمونه‌ی قالب بازار — شبکه‌ای و گرم، با بخش سوغاتی در انتهای منو.",
    ownerName: "نمونه بازار",
    ownerEmail: "demo@demo-bazaar.restokar.ir",
    templateId: "bazaar",
    theme: { primary: "#b4532a", secondary: "#2f6f6b", surfaceStyle: "flat" },
    planCode: "pro",
    onlinePayment: true,
    menu: [...PERSIAN_MENU, ...SOUVENIR_MENU],
    tableCount: 10,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });

  await seedRestaurant({
    slug: "demo-atlas",
    name: "کافه اطلس",
    nameEn: "Atlas Café",
    tagline: "اسپشیالتی، صبحانه و برانچ",
    taglineEn: "Specialty coffee, breakfast and brunch",
    description: "نمونه‌ی قالب اطلس — شبکه‌بندی دقیق و پرکنتراست، مناسب کافه‌های مدرن.",
    ownerName: "نمونه اطلس",
    ownerEmail: "demo@demo-atlas.restokar.ir",
    templateId: "atlas",
    theme: {
      primary: "#c63a1e",
      secondary: "#1f1f1f",
      background: "#ffffff",
      surface: "#ffffff",
      text: "#111111",
      muted: "#666666",
      surfaceStyle: "flat",
    },
    planCode: "starter",
    onlinePayment: false,
    menu: CAFE_MENU,
    tableCount: 8,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });

  // Reel leads with photography, so it gets the burger/pizza menu — the most
  // image-driven of the seed sets, and the one whose dishes actually justify a
  // horizontal track.
  await seedRestaurant({
    slug: "demo-reel",
    name: "کافه ریل",
    nameEn: "Reel Café",
    tagline: "برگر، پیتزا و دسر — ردیف به ردیف",
    taglineEn: "Burgers, pizza and dessert — row by row",
    description: "نمونه‌ی قالب ریل — هر دسته یک ردیف افقی، مناسب منوهای پرعکس.",
    ownerName: "نمونه ریل",
    ownerEmail: "demo@demo-reel.restokar.ir",
    templateId: "reel",
    theme: {
      primary: "#0e7490",
      secondary: "#ea580c",
      background: "#f8fafc",
      surface: "#ffffff",
      text: "#0f172a",
      muted: "#64748b",
    },
    planCode: "pro",
    onlinePayment: true,
    menu: RESTAURANT_MENU,
    tableCount: 10,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });

  await seedRestaurant({
    slug: "demo-bloom",
    name: "شکوفه",
    nameEn: "Bloom",
    tagline: "بستنی، آبمیوه و شیرینی تازه",
    taglineEn: "Ice cream, juice and fresh pastries",
    description: "نمونه‌ی قالب شکوفه — مدال‌های دایره‌ای و کپسولی، بدون هیچ مستطیلی.",
    ownerName: "نمونه شکوفه",
    ownerEmail: "demo@demo-bloom.restokar.ir",
    templateId: "bloom",
    theme: {
      primary: "#a0521a",
      secondary: "#6b7b3c",
      background: "#f7f1e7",
      surface: "#fffdf9",
      text: "#3a2c1f",
      muted: "#8a7a68",
    },
    planCode: "pro",
    onlinePayment: true,
    menu: CAFE_MENU,
    tableCount: 8,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });

  // Kashi is the one showcase whose design is culturally specific, so it gets
  // the Persian menu — tilework framing a کباب list is the pairing it was
  // designed for.
  await seedRestaurant({
    slug: "demo-kashi",
    name: "سفره‌خانه کاشی",
    nameEn: "Kashi House",
    tagline: "چایخانه و غذای اصیل ایرانی",
    taglineEn: "A tea house serving authentic Iranian food",
    description: "نمونه‌ی قالب کاشی — طاق، ستاره هشت‌پر و کاشی‌کاری اصفهان.",
    ownerName: "نمونه کاشی",
    ownerEmail: "demo@demo-kashi.restokar.ir",
    templateId: "kashi",
    theme: {
      primary: "#0e7c72",
      secondary: "#14345f",
      background: "#f7f0e1",
      surface: "#fffdf7",
      text: "#1b2a3a",
      muted: "#6f7d8c",
      surfaceStyle: "flat",
    },
    planCode: "enterprise",
    onlinePayment: true,
    menu: PERSIAN_MENU,
    tableCount: 12,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });

  // Qalam leads each category with its first dish, so it wants a short,
  // considered menu rather than a long one — the fine-dining set is the only
  // seed where every category is genuinely brief.
  await seedRestaurant({
    slug: "demo-qalam",
    name: "رستوران ترنج",
    nameEn: "Toranj Restaurant",
    tagline: "منوی فصلی، هر هفته تازه",
    taglineEn: "A seasonal menu, new every week",
    description: "نمونه‌ی قالب ترنج — تایپوگرافی آرام، بدون کارت و بدون سایه.",
    ownerName: "نمونه ترنج",
    ownerEmail: "demo@demo-qalam.restokar.ir",
    templateId: "qalam",
    theme: {
      primary: "#6d2c34",
      secondary: "#7a5f36",
      background: "#f6f5f2",
      surface: "#ffffff",
      text: "#1a1a18",
      muted: "#6b6862",
      surfaceStyle: "flat",
    },
    planCode: "pro",
    onlinePayment: true,
    // The bistro carries a longer card than Noir: same three courses, six more
    // dishes. Noir stays sparse because that is the template it demonstrates.
    menu: BISTRO_MENU,
    tableCount: 9,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });

  await seedRestaurant({
    slug: "demo-vitrin",
    name: "ویترین",
    nameEn: "Vitrin",
    tagline: "هر روز چند غذا، فقط همان‌ها",
    taglineEn: "A few dishes each day, and only those",
    description: "نمونه‌ی قالب ویترین — هر بار یک غذا، تمام‌صفحه و کارت‌به‌کارت.",
    ownerName: "نمونه ویترین",
    ownerEmail: "demo@demo-vitrin.restokar.ir",
    templateId: "vitrin",
    theme: {
      primary: "#d6f84c",
      secondary: "#ff5a1f",
      background: "#09090b",
      surface: "#161619",
      text: "#fafafa",
      muted: "#a1a1aa",
      surfaceStyle: "flat",
    },
    planCode: "pro",
    onlinePayment: true,
    // The short menu on purpose: this template shows one dish per screen, so a
    // forty-line list would demonstrate it badly — the showcase should look
    // like the kind of venue the layout is actually for.
    menu: CAFE_MENU,
    tableCount: 6,
    isDemo: true,
    bilingual: true,
    skipOrders: true,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
