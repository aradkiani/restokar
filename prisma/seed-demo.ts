/**
 * The demo platform: realistic restaurant and café accounts on every plan,
 * with five to six months of trading behind them.
 *
 *   npm run db:seed:demo
 *
 * DEVELOPMENT ONLY — `demo-seed-guard` refuses anything but a local database
 * with ALLOW_DEMO_SEED="true", before a connection is even opened.
 *
 * Re-runnable, and destructive by design: every restaurant that is not one of
 * the homepage showcase menus (`isDemo`) is deleted with its accounts, orders,
 * stock and uploaded photos, then the demo businesses in `demo/catalog.ts` are
 * written again from scratch. The showcase menus and the platform admin are
 * kept. The same run on the same day produces the same data.
 *
 * Needs the plans and showcase menus from `npm run db:seed`. Account numbers
 * are 0912 000 00xx and guest numbers 0912 001 xxxx: invented, and in
 * development no SMS is ever sent — codes print in the server log.
 */
// MUST be first: refuses to run against anything but a local development
// database, before the client below is constructed.
import "./demo-seed-guard";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { DEV_ADMIN_PHONE } from "./dev-phones";
import { hashPassword } from "../src/lib/auth/password";
import { snapshotLimits } from "../src/lib/plan-terms";
import {
  CALENDAR_DAY,
  businessDateKey,
  sameHours,
  type BusinessHours,
} from "../src/lib/business-day";
import { formatMoney } from "../src/lib/format";
import {
  ADMIN_PASSWORD,
  BUSINESSES,
  DEMO_PASSWORD,
  type DemoBusiness,
  type Glyph,
} from "./demo/catalog";
import {
  addMonths,
  calendarKey,
  fastBusinessKey,
  generateHistory,
  midnightOf,
  nextAuthority,
  nextId,
  resetGuestNumbers,
  rng,
  type Actor,
  type Business,
  type RuntimeItem,
  type RuntimeProduct,
  type Site,
} from "./demo/history";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });

const DATA_ROOT = path.resolve(process.env.DATA_DIR ?? "./data");
const UPLOADS = path.join(DATA_ROOT, "uploads");
const MINUTE = 60_000;
const DAY = 86_400_000;
const NOW = new Date();

// ---------------------------------------------------------------- helpers

async function insert<T>(
  label: string,
  rows: T[],
  write: (chunk: T[]) => Promise<unknown>,
  size = 2_000,
) {
  for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size));
  if (rows.length > 0) process.stdout.write(`    ${label}: ${rows.length}\n`);
}

/** A file name the upload route will serve: letters, digits, dot, dash. */
const fileSlug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";

/** Ten-thirty in the morning, Tehran, `days` days ago. */
const morningDaysAgo = (days: number) =>
  new Date(
    midnightOf(calendarKey(new Date(NOW.getTime() - days * DAY))).getTime() +
      630 * MINUTE,
  );

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

// ------------------------------------------------------------------ logos

const GLYPHS: Record<Glyph, (fg: string) => string> = {
  cup: (fg) => `
    <path d="M176 150c0-12 6-20 6-34M226 150c0-12 6-20 6-34M276 150c0-12 6-20 6-34" stroke="${fg}" stroke-width="12" stroke-linecap="round" fill="none"/>
    <path d="M150 170h200v70c0 50-40 84-100 84s-100-34-100-84z" fill="${fg}"/>
    <path d="M350 192h18a34 34 0 0 1 0 68h-24" stroke="${fg}" stroke-width="16" fill="none"/>
    <rect x="130" y="332" width="240" height="14" rx="7" fill="${fg}"/>`,
  book: (fg) => `
    <path d="M256 150c-40-24-90-28-130-20v190c40-8 90-4 130 20z" fill="${fg}"/>
    <path d="M256 150c40-24 90-28 130-20v190c-40-8-90-4-130 20z" fill="${fg}" opacity="0.75"/>
    <path d="M256 150v190" stroke="#00000033" stroke-width="6"/>`,
  leaf: (fg) => `
    <path d="M150 330c0-130 80-200 220-200 0 140-70 220-200 220" fill="${fg}"/>
    <path d="M160 340c50-60 100-110 170-170" stroke="#00000044" stroke-width="10" stroke-linecap="round"/>`,
  flame: (fg) => `
    <path d="M256 110c30 60 100 90 100 170a100 100 0 0 1-200 0c0-50 30-70 40-110 20 30 30 40 40 70 20-30 30-80 20-130z" fill="${fg}"/>`,
  burger: (fg) => `
    <path d="M140 230c0-60 52-100 116-100s116 40 116 100z" fill="${fg}"/>
    <rect x="130" y="246" width="252" height="34" rx="17" fill="${fg}" opacity="0.7"/>
    <path d="M140 296h232v18c0 24-20 40-44 40H184c-24 0-44-16-44-40z" fill="${fg}"/>`,
  moon: (fg) => `
    <path d="M300 120a120 120 0 1 0 70 220 100 100 0 1 1-70-220z" fill="${fg}"/>
    <circle cx="340" cy="170" r="10" fill="${fg}"/><circle cx="380" cy="230" r="7" fill="${fg}"/>`,
  pizza: (fg) => `
    <path d="M256 120l130 230H126z" fill="${fg}"/>
    <path d="M118 350h276" stroke="${fg}" stroke-width="22" stroke-linecap="round"/>
    <circle cx="256" cy="230" r="16" fill="#00000040"/><circle cx="220" cy="300" r="14" fill="#00000040"/><circle cx="296" cy="296" r="13" fill="#00000040"/>`,
};

async function writeLogo(siteId: string, spec: DemoBusiness): Promise<string> {
  const { glyph, background, foreground } = spec.logo;
  const size = Math.min(60, Math.floor(860 / spec.name.length));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="112" fill="${background}"/>
    <g transform="translate(0 -30)">${GLYPHS[glyph](foreground)}</g>
    <text x="256" y="440" font-family="Tahoma, Vazirmatn, sans-serif" font-size="${size}" font-weight="700"
      fill="${foreground}" text-anchor="middle" direction="rtl">${spec.name}</text>
  </svg>`;
  const dir = path.join(UPLOADS, siteId);
  mkdirSync(dir, { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(path.join(dir, "logo.png"));
  return `/uploads/${siteId}/logo.png`;
}

/** Copies a showcase photo into this venue's own folder. */
function copyPhoto(
  photos: Map<string, string>,
  dish: string | null,
  siteId: string,
  name: string,
): string | null {
  if (!dish) return null;
  const source = photos.get(dish);
  if (!source) return null;
  const from = path.join(DATA_ROOT, source.replace(/^\//, ""));
  if (!existsSync(from)) return null;
  const file = `${fileSlug(name)}${path.extname(from)}`;
  const dir = path.join(UPLOADS, siteId);
  mkdirSync(dir, { recursive: true });
  copyFileSync(from, path.join(dir, file));
  return `/uploads/${siteId}/${file}`;
}

// ------------------------------------------------------------------- wipe

async function wipe() {
  const doomed = await prisma.restaurant.findMany({
    where: { isDemo: false },
    select: { id: true, slug: true, parentRestaurantId: true },
  });
  const branches = doomed.filter((r) => r.parentRestaurantId).map((r) => r.id);
  const heads = doomed.filter((r) => !r.parentRestaurantId).map((r) => r.id);
  // Branches first: a chain head cannot go while its branches point at it.
  if (branches.length > 0)
    await prisma.restaurant.deleteMany({ where: { id: { in: branches } } });
  if (heads.length > 0)
    await prisma.restaurant.deleteMany({ where: { id: { in: heads } } });

  // Accounts left with no venue: everyone but the platform admin and the
  // showcase menus' owners.
  const owners = await prisma.restaurant.findMany({ select: { ownerId: true } });
  const removedUsers = await prisma.user.deleteMany({
    where: {
      role: { not: "SUPER_ADMIN" },
      restaurantId: null,
      id: { notIn: owners.map((o) => o.ownerId) },
    },
  });
  await prisma.rateLimit.deleteMany({});
  await prisma.otpChallenge.deleteMany({ where: { phone: { startsWith: "0912000" } } });

  // Their photos and logos went with them; the folders are theirs alone.
  for (const venue of doomed) {
    const dir = path.join(UPLOADS, venue.id);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  console.log(
    `  removed ${doomed.length} restaurants (${branches.length} branches) and ${removedUsers.count} other accounts`,
  );
}

// -------------------------------------------------------------- businesses

type PlanRow = Awaited<ReturnType<typeof prisma.plan.findMany>>[number];
interface Plans {
  get(code: string): PlanRow;
}

async function createBusiness(
  spec: DemoBusiness,
  plans: Plans,
  photos: Map<string, string>,
  admin: Actor,
) {
  const plan = plans.get(spec.planCode);
  const rand = rng(`setup:${spec.slug}`);

  // When the account began, from how it is billed.
  let signupAt: Date;
  let periodEnd: Date;
  let status: "ACTIVE" | "TRIALING" | "EXPIRED" = "ACTIVE";
  if (spec.billing.kind === "expired") {
    periodEnd = morningDaysAgo(spec.billing.endedDaysAgo);
    signupAt = addMonths(periodEnd, -5);
    status = "EXPIRED";
  } else {
    signupAt = morningDaysAgo(spec.signupDaysAgo);
    periodEnd = NOW; // set below
  }
  const until = status === "EXPIRED" ? periodEnd : new Date(NOW.getTime() + DAY);

  // ---- people
  const password = async () => hashPassword(DEMO_PASSWORD);
  const ownerId = nextId("s");
  const owner: Actor = {
    id: ownerId,
    phone: spec.owner.phone,
    name: spec.owner.name,
    role: "OWNER",
  };
  const people: Prisma.UserCreateManyInput[] = [
    {
      id: ownerId,
      name: spec.owner.name,
      phone: spec.owner.phone,
      passwordHash: await password(),
      role: "OWNER",
      phoneVerifiedAt: signupAt,
      lastLoginAt:
        status === "EXPIRED" ? periodEnd : new Date(NOW.getTime() - 3 * 60 * MINUTE),
      createdAt: signupAt,
    },
  ];

  const headId = nextId("h");
  const staffActors = new Map<string, Actor>();
  const staffRows = async (list: DemoBusiness["staff"], since: Date) => {
    for (const staff of list) {
      const id = nextId("s");
      staffActors.set(staff.phone, {
        id,
        phone: staff.phone,
        name: staff.name,
        role: "STAFF",
      });
      people.push({
        id,
        name: staff.name,
        phone: staff.phone,
        passwordHash: await password(),
        role: "STAFF",
        staffTabs: staff.tabs,
        phoneVerifiedAt: new Date(since.getTime() + DAY),
        lastLoginAt: new Date(NOW.getTime() - int(rand, 20, 600) * MINUTE),
        createdAt: new Date(since.getTime() + 2 * 60 * MINUTE),
      });
    }
  };
  await staffRows(spec.staff, signupAt);

  const branchSites = spec.branches.map((branch) => ({
    branch,
    id: nextId("h"),
    managerId: nextId("s"),
    opensAt: morningDaysAgo(branch.opensDaysAgo),
  }));
  for (const { branch, managerId, opensAt } of branchSites) {
    people.push({
      id: managerId,
      name: branch.manager.name,
      phone: branch.manager.phone,
      passwordHash: await password(),
      role: "BRANCH_MANAGER",
      phoneVerifiedAt: new Date(opensAt.getTime() + DAY),
      lastLoginAt: new Date(NOW.getTime() - int(rand, 30, 900) * MINUTE),
      createdAt: new Date(opensAt.getTime() - 3 * DAY),
    });
    staffActors.set(branch.manager.phone, {
      id: managerId,
      phone: branch.manager.phone,
      name: branch.manager.name,
      role: "BRANCH_MANAGER",
    });
    await staffRows(branch.staff, opensAt);
  }
  await prisma.user.createMany({ data: people });

  // ---- sites
  const logoUrl = await writeLogo(headId, spec);
  const featuredDish = spec.menu
    .flatMap((c) => c.products)
    .find((p) => p.featured && p.photo);
  const coverUrl = copyPhoto(photos, featuredDish?.photo ?? null, headId, "cover");
  const common = {
    templateId: spec.templateId,
    theme: spec.theme,
    ownerId,
    logoUrl,
    onlineOrderingEnabled: spec.settings.onlineOrdering,
    onlinePaymentEnabled: spec.settings.onlinePayment,
    takeawayEnabled: spec.settings.takeaway,
    taxEnabled: spec.settings.tax > 0,
    taxPercent: spec.settings.tax || 10,
    serviceChargeEnabled: spec.settings.service > 0,
    serviceChargePercent: spec.settings.service || 10,
    tipEnabled: spec.settings.tip,
    roundingIncrement: spec.settings.rounding,
    roundingDirection: "nearest",
    bilingualEnabled: spec.settings.bilingual,
    phoneCollectionEnabled: spec.settings.phoneCollection,
    staffCallEnabled: spec.settings.staffCall,
    discountCodesEnabled: Boolean(spec.settings.discountCode),
    featuredSectionEnabled: true,
    isPublished: true,
  };
  await prisma.restaurant.create({
    data: {
      id: headId,
      slug: spec.slug,
      name: spec.name,
      nameEn: spec.nameEn,
      tagline: spec.tagline,
      taglineEn: spec.taglineEn,
      description: spec.description,
      address: spec.address,
      phone: spec.owner.phone,
      coverUrl,
      businessDayStart: sameHours(spec.hours, CALENDAR_DAY) ? null : spec.hours.start,
      businessDayEnd: sameHours(spec.hours, CALENDAR_DAY) ? null : spec.hours.end,
      createdAt: signupAt,
      ...common,
    },
  });
  for (const { branch, id, opensAt } of branchSites) {
    await prisma.restaurant.create({
      data: {
        id,
        slug: branch.slug,
        name: branch.name,
        nameEn: branch.nameEn,
        address: branch.address,
        phone: branch.manager.phone,
        parentRestaurantId: headId,
        businessDayStart: branch.hours?.start ?? null,
        businessDayEnd: branch.hours?.end ?? null,
        createdAt: new Date(opensAt.getTime() - 3 * DAY),
        ...common,
      },
    });
  }

  // Everyone belongs to their site now that the sites exist.
  await prisma.user.update({ where: { id: ownerId }, data: { restaurantId: headId } });
  for (const staff of spec.staff) {
    await prisma.user.update({
      where: { phone: staff.phone },
      data: { restaurantId: headId },
    });
  }
  for (const { branch, id } of branchSites) {
    await prisma.user.updateMany({
      where: {
        phone: { in: [branch.manager.phone, ...branch.staff.map((s) => s.phone)] },
      },
      data: { restaurantId: id },
    });
  }

  // ---- subscription and what was paid for it
  const subscriptionId = nextId("b");
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const extensions: Prisma.SubscriptionExtensionCreateManyInput[] = [];
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  const snapshot = snapshotLimits(plan);
  const pay = (at: Date, interval: "monthly" | "yearly") => {
    const amount = interval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
    const verifiedAt = new Date(at.getTime() + 2 * MINUTE);
    payments.push({
      id: nextId("y"),
      restaurantId: headId,
      purpose: "SUBSCRIPTION",
      subscriptionId,
      planId: plan.id,
      interval,
      planSnapshot: {
        name: plan.name,
        interval,
        amount,
        regularAmount: amount,
        ...snapshot,
      },
      provider: "zarinpal",
      amount,
      status: "PAID",
      authority: nextAuthority(rand),
      refId: String(int(rand, 1_000_000_000, 9_999_999_999)),
      cardPan: `603799******${int(rand, 1000, 9999)}`,
      verifiedAt,
      createdAt: at,
      updatedAt: verifiedAt,
    });
  };

  const billing = spec.billing;
  if (billing.kind === "monthly") {
    let k = 0;
    while (addMonths(signupAt, k).getTime() <= NOW.getTime()) {
      pay(
        new Date(
          addMonths(signupAt, k).getTime() - (k === 0 ? 0 : int(rand, 1, 3) * DAY),
        ),
        "monthly",
      );
      k += 1;
    }
    periodEnd = addMonths(signupAt, k);
  } else if (billing.kind === "yearly") {
    pay(signupAt, "yearly");
    periodEnd = addMonths(signupAt, 12);
  } else if (billing.kind === "expired") {
    for (let k = 0; k < 5; k++) pay(addMonths(signupAt, k), "monthly");
  } else if (billing.kind === "trial") {
    status = "TRIALING";
    periodEnd = new Date(NOW.getTime() + billing.endsInDays * DAY);
  } else {
    // A contract plan: platform staff extend it after each bank transfer.
    const days = billing.months === 12 ? 365 : 30;
    let previous = signupAt;
    let at = signupAt;
    while (at.getTime() <= NOW.getTime()) {
      const next = new Date(previous.getTime() + days * DAY);
      const reason =
        billing.months === 12
          ? "قرارداد سالانه — واریز بانکی"
          : `قرارداد چندشعبه — واریز ماه ${calendarKey(at).slice(0, 7)}`;
      extensions.push({
        id: nextId("n"),
        subscriptionId,
        adminId: admin.id,
        adminLabel: admin.phone,
        extensionType: "MANUAL",
        previousExpiration: previous,
        newExpiration: next,
        durationDays: days,
        reason,
        createdAt: at,
      });
      audits.push({
        id: nextId("a"),
        restaurantId: headId,
        actorUserId: admin.id,
        actorLabel: admin.phone,
        actorRole: "SUPER_ADMIN",
        action: "SUBSCRIPTION_EXTENDED",
        entityType: "Subscription",
        entityId: subscriptionId,
        summary: `اشتراک ${days} روز تمدید شد (دستی) — ${reason}`,
        createdAt: at,
      });
      previous = next;
      // Staff renew a week ahead, once the transfer for the next month is in.
      at = new Date(next.getTime() - 7 * DAY);
    }
    periodEnd = previous;
  }

  await prisma.subscription.create({
    data: {
      id: subscriptionId,
      restaurantId: headId,
      planId: plan.id,
      status,
      interval:
        billing.kind === "yearly" ||
        (billing.kind === "contract" && billing.months === 12)
          ? "yearly"
          : "monthly",
      startedAt: signupAt,
      currentPeriodEnd: periodEnd,
      limitsSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      createdAt: signupAt,
    },
  });

  if (spec.createdByAdmin) {
    audits.push({
      id: nextId("a"),
      restaurantId: headId,
      actorUserId: admin.id,
      actorLabel: admin.phone,
      actorRole: "SUPER_ADMIN",
      action: "ACCOUNT_CREATED",
      entityType: "Restaurant",
      entityId: headId,
      summary: `حساب «${spec.name}» برای ${spec.owner.phone} ساخته شد`,
      metadata: { slug: spec.slug, planCode: spec.planCode },
      createdAt: new Date(signupAt.getTime() - 10 * MINUTE),
    });
  }
  if (!sameHours(spec.hours, CALENDAR_DAY)) {
    audits.push({
      id: nextId("a"),
      restaurantId: headId,
      actorUserId: ownerId,
      actorLabel: spec.owner.phone,
      actorRole: "OWNER",
      action: "SETTINGS_CHANGED",
      entityType: "Restaurant",
      entityId: headId,
      summary: `ساعت کاری روی ${clock(spec.hours.start)} تا ${clock(spec.hours.end)} تنظیم شد`,
      createdAt: new Date(signupAt.getTime() + 40 * MINUTE),
    });
  }
  for (const staff of [...spec.staff, ...spec.branches.flatMap((b) => b.staff)]) {
    audits.push({
      id: nextId("a"),
      restaurantId: headId,
      actorUserId: ownerId,
      actorLabel: spec.owner.phone,
      actorRole: "OWNER",
      action: "STAFF_CREATED",
      entityType: "User",
      entityId: staffActors.get(staff.phone)!.id,
      summary: `حساب کارمند ساخته شد: ${staff.name} (${staff.phone})`,
      metadata: { tabs: staff.tabs },
      createdAt: new Date(signupAt.getTime() + 2 * 60 * MINUTE),
    });
  }

  // ---- tables
  const tables: Prisma.RestaurantTableCreateManyInput[] = [];
  const tableNumbers = new Map<string, string[]>();
  const addTables = (siteId: string, count: number) => {
    const numbers = Array.from({ length: count }, (_, i) => String(i + 1));
    tableNumbers.set(siteId, numbers);
    for (const number of numbers) {
      tables.push({
        id: nextId("q"),
        restaurantId: siteId,
        number,
        seats: Number(number) % 3 === 0 ? 2 : Number(number) % 5 === 0 ? 6 : 4,
      });
    }
  };
  addTables(headId, spec.tables);
  for (const { branch, id } of branchSites) addTables(id, branch.tables);
  await prisma.restaurantTable.createMany({ data: tables });

  // ---- suppliers and stock catalogue (the chain's, shared by its branches)
  const supplierIds = new Map<string, string>();
  for (const supplier of spec.suppliers) {
    const id = nextId("f");
    supplierIds.set(supplier.name, id);
    await prisma.supplier.create({
      data: {
        id,
        restaurantId: headId,
        name: supplier.name,
        phone: supplier.phone,
        note: supplier.note ?? null,
        createdAt: signupAt,
      },
    });
  }
  const items: RuntimeItem[] = spec.stock.map((item) => ({
    id: nextId("j"),
    spec: item,
  }));
  const itemByName = new Map(items.map((item) => [item.spec.name, item.id]));

  // ---- menu
  const categories: Prisma.CategoryCreateManyInput[] = [];
  const productRows: Prisma.ProductCreateManyInput[] = [];
  const groups: Prisma.ProductOptionGroupCreateManyInput[] = [];
  const choices: Prisma.ProductOptionChoiceCreateManyInput[] = [];
  const infos: Prisma.ProductInfoSectionCreateManyInput[] = [];
  const ingredients: Prisma.ProductIngredientCreateManyInput[] = [];
  const windows: Prisma.AvailabilityWindowCreateManyInput[] = [];
  const products: RuntimeProduct[] = [];
  let featuredOrder = 0;

  for (const [ci, category] of spec.menu.entries()) {
    const categoryId = nextId("g");
    categories.push({
      id: categoryId,
      restaurantId: headId,
      name: category.name,
      nameEn: category.nameEn,
      icon: category.icon,
      sortOrder: ci,
      createdAt: signupAt,
    });
    if (category.window) {
      for (let day = 0; day < 7; day++) {
        windows.push({
          id: nextId("z"),
          restaurantId: headId,
          categoryId,
          dayOfWeek: day,
          startMinute: category.window[0],
          endMinute: category.window[1],
        });
      }
    }
    for (const [pi, product] of category.products.entries()) {
      const productId = nextId("r");
      const recipe = product.recipe.map(([itemName, amount]) => {
        const itemId = itemByName.get(itemName);
        if (!itemId)
          throw new Error(
            `${spec.slug}: «${product.name}» uses unknown item «${itemName}»`,
          );
        return { itemId, perUnitMilli: Math.round(amount * 1000) };
      });
      productRows.push({
        id: productId,
        restaurantId: headId,
        categoryId,
        name: product.name,
        nameEn: product.nameEn,
        shortDescription: product.short,
        fullDescription: product.full,
        shortDescriptionEn: product.shortEn ?? null,
        fullDescriptionEn: product.fullEn ?? null,
        imageUrl: copyPhoto(photos, product.photo, headId, product.nameEn),
        price: product.price,
        priceExact: product.price,
        costPrice: product.cost,
        isAvailable: product.available !== false,
        isFeatured: product.featured ?? false,
        featuredOrder: product.featured ? featuredOrder++ : 0,
        featuredLabel: product.featured
          ? featuredOrder === 1
            ? "chefsChoice"
            : "popular"
          : null,
        prepMinutes: product.prep ?? null,
        dietaryTags: product.tags,
        sortOrder: pi,
        createdAt: signupAt,
      });
      for (const [gi, group] of product.options.entries()) {
        const groupId = nextId("og");
        groups.push({
          id: groupId,
          productId,
          name: group.name,
          nameEn: group.nameEn,
          isRequired: group.required,
          minSelect: group.required ? 1 : 0,
          maxSelect: group.max,
          isUpgrade: group.upgrade ?? false,
          sortOrder: gi,
        });
        group.choices.forEach((choice, sortOrder) =>
          choices.push({
            id: nextId("oc"),
            groupId,
            name: choice.name,
            nameEn: choice.nameEn,
            priceDelta: choice.price,
            costDelta: choice.cost,
            sortOrder,
          }),
        );
      }
      product.info.forEach((info, sortOrder) =>
        infos.push({
          id: nextId("in"),
          productId,
          title: info.title,
          content: info.content,
          icon: info.icon,
          sortOrder,
        }),
      );
      for (const line of recipe) {
        const item = items.find((i) => i.id === line.itemId)!;
        ingredients.push({
          id: nextId("ig"),
          productId,
          itemId: line.itemId,
          perUnitMilli: line.perUnitMilli,
          unit: item.spec.unit,
        });
      }
      products.push({
        id: productId,
        name: product.name,
        role: category.role,
        pop: product.pop,
        price: product.price,
        cost: product.cost,
        // The menu went up about 12% eleven weeks ago, like most of the city.
        oldPrice: roundTo(product.price / 1.12, 5_000),
        oldCost: roundTo(product.cost / 1.12, 1_000),
        window: category.window ?? null,
        orderable: product.available !== false,
        groups: product.options.map((group) => ({
          name: group.name,
          required: group.required,
          max: group.max,
          choices: group.choices.map((c) => ({
            name: c.name,
            price: c.price,
            cost: c.cost,
            w: c.w ?? 1,
          })),
        })),
        recipe,
      });
    }
  }
  await prisma.category.createMany({ data: categories });
  await prisma.product.createMany({ data: productRows });
  if (groups.length) await prisma.productOptionGroup.createMany({ data: groups });
  if (choices.length) await prisma.productOptionChoice.createMany({ data: choices });
  if (infos.length) await prisma.productInfoSection.createMany({ data: infos });
  if (windows.length) await prisma.availabilityWindow.createMany({ data: windows });

  // ---- months of trading
  const actorFor = (phoneNumber: string): Actor =>
    phoneNumber === spec.owner.phone ? owner : (staffActors.get(phoneNumber) ?? owner);
  const storekeeper = spec.staff.find((s) => s.tabs.includes("inventory"));
  const sites: Site[] = [
    {
      id: headId,
      slug: spec.slug,
      hours: spec.hours,
      opensAt: signupAt,
      until,
      volume: spec.volume,
      rampFrom: 0.55,
      rampDays: Math.max(30, (NOW.getTime() - signupAt.getTime()) / DAY),
      tables: tableNumbers.get(headId)!,
      closer: actorFor(spec.closer),
      stockActor: storekeeper ? actorFor(storekeeper.phone) : owner,
      openingCash: spec.openingCash,
      rent: spec.rent,
      payroll: spec.payroll,
      marketing: spec.marketing,
      maxDailyViews: plan.maxDailyViews,
    },
    ...branchSites.map(({ branch, id, opensAt }) => ({
      id,
      slug: branch.slug,
      hours: branch.hours ?? spec.hours,
      opensAt,
      until,
      volume: branch.volume,
      rampFrom: 0.4,
      rampDays: 75,
      tables: tableNumbers.get(id)!,
      closer: actorFor(branch.staff[0]?.phone ?? branch.manager.phone),
      stockActor: actorFor(branch.manager.phone),
      openingCash: branch.openingCash,
      rent: branch.rent,
      payroll: branch.payroll,
      marketing: 0,
      maxDailyViews: plan.maxDailyViews,
    })),
  ];

  const business: Business = {
    spec,
    menuOwnerId: headId,
    sites,
    products,
    items,
    supplierIds,
    pricing: {
      taxEnabled: spec.settings.tax > 0,
      taxPercent: spec.settings.tax,
      serviceChargeEnabled: spec.settings.service > 0,
      serviceChargePercent: spec.settings.service,
      roundingIncrement: spec.settings.rounding,
      roundingDirection: "nearest",
    },
    priceRiseAt: morningDaysAgo(77),
    now: NOW,
  };
  const history = generateHistory(business);
  selfCheck(business, history);

  // ---- write it
  if (items.length > 0) {
    await prisma.inventoryItem.createMany({
      data: items.map((item) => {
        const reference = history.referencePrices.get(item.id);
        return {
          id: item.id,
          restaurantId: headId,
          name: item.spec.name,
          unit: item.spec.unit,
          purchasePrice: reference?.price ?? item.spec.price,
          priceUnit: item.spec.unit,
          priceUpdatedAt: reference?.at ?? signupAt,
          lowStockMilli: Math.round(item.spec.low * 1000),
          categoryName: item.spec.category,
          supplierId: supplierIds.get(item.spec.supplier) ?? null,
          createdAt: signupAt,
        };
      }),
    });
    await prisma.productIngredient.createMany({ data: ingredients });
  }

  await insert("customers", history.customers, (chunk) =>
    prisma.customer.createMany({
      data: chunk.map((c) => ({
        id: c.id,
        restaurantId: headId,
        phone: c.phone,
        name: c.name,
        marketingConsent: c.consent,
        consentUpdatedAt: c.consent ? c.createdAt : null,
        createdAt: c.createdAt,
      })),
    }),
  );
  await insert("orders", history.orders, (data) => prisma.order.createMany({ data }));
  await insert("order lines", history.items, (data) =>
    prisma.orderItem.createMany({ data }),
  );
  await insert("line options", history.options, (data) =>
    prisma.orderItemOption.createMany({ data }),
  );
  await insert(
    "order events",
    history.events,
    (data) => prisma.orderEvent.createMany({ data }),
    5_000,
  );
  await insert("payments", [...payments, ...history.payments], (data) =>
    prisma.payment.createMany({ data }),
  );
  if (extensions.length)
    await prisma.subscriptionExtension.createMany({ data: extensions });
  await insert("reviews", history.reviews, (data) =>
    prisma.orderReview.createMany({ data }),
  );
  await insert("purchases", history.purchases, (data) =>
    prisma.purchase.createMany({ data }),
  );
  await insert("purchase lines", history.purchaseLines, (data) =>
    prisma.purchaseLine.createMany({ data }),
  );
  await insert("stock counts", history.stocktakes, (data) =>
    prisma.stocktake.createMany({ data }),
  );
  await insert("count lines", history.stocktakeLines, (data) =>
    prisma.stocktakeLine.createMany({ data }),
  );
  await insert(
    "stock movements",
    history.movements,
    (data) => prisma.stockMovement.createMany({ data }),
    5_000,
  );
  await insert("stock levels", history.levels, (data) =>
    prisma.stockLevel.createMany({ data }),
  );
  await insert("till closes", history.closes, (data) =>
    prisma.dailyClose.createMany({ data }),
  );
  await insert("menu views", history.views, (data) =>
    prisma.menuDailyView.createMany({ data }),
  );
  await insert("expenses", history.expenses, (data) =>
    prisma.expense.createMany({ data }),
  );
  await insert("activity log", [...audits, ...history.audits], (data) =>
    prisma.auditLog.createMany({ data }),
  );

  for (const [siteId, last] of history.sequences) {
    await prisma.restaurant.update({
      where: { id: siteId },
      data: { orderSequence: last },
    });
  }

  const code = spec.settings.discountCode;
  if (code) {
    await prisma.discountCode.create({
      data: {
        restaurantId: headId,
        code: code.code,
        type: "PERCENT",
        value: code.percent,
        maxDiscount: code.max,
        createdAt: new Date(NOW.getTime() - code.sinceDaysAgo * DAY),
      },
    });
  }
  for (const ticket of spec.supportTickets) {
    const createdAt = morningDaysAgo(ticket.daysAgo);
    await prisma.supportTicket.create({
      data: {
        restaurantId: headId,
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.reply ? "ANSWERED" : "OPEN",
        reply: ticket.reply ?? null,
        repliedAt: ticket.reply ? new Date(createdAt.getTime() + 3 * 60 * MINUTE) : null,
        createdAt,
      },
    });
  }

  const revenue = history.orders
    .filter((o) => o.status !== "CANCELED")
    .reduce((sum, o) => sum + o.total, 0);
  return {
    spec,
    signupAt,
    orders: history.orders.length,
    customers: history.customers.length,
    revenue,
    sites: sites.length,
  };
}

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

const int = (rand: () => number, low: number, high: number) =>
  Math.floor(low + rand() * (high - low + 1));

/**
 * The generator's shortcuts checked against the application's own functions,
 * and the invariants every screen relies on.
 */
function selfCheck(business: Business, history: ReturnType<typeof generateHistory>) {
  const problems: string[] = [];
  const hoursOf = new Map<string, BusinessHours>(
    business.sites.map((s) => [s.id, s.hours]),
  );

  history.orders.forEach((order, index) => {
    if (index % 37 !== 0) return;
    const hours = hoursOf.get(order.restaurantId)!;
    const real = businessDateKey(order.placedAt as Date, hours);
    const filed = (order.businessDate as Date).toISOString().slice(0, 10);
    if (real !== filed)
      problems.push(`order ${order.id}: filed ${filed}, app says ${real}`);
  });
  history.movements.forEach((movement, index) => {
    if (index % 101 !== 0) return;
    const hours = hoursOf.get(movement.restaurantId as string)!;
    const real = businessDateKey(movement.createdAt as Date, hours);
    const fast = fastBusinessKey(movement.createdAt as Date, hours);
    if (real !== fast) problems.push(`movement ${movement.id}: ${fast} vs ${real}`);
  });

  // The ledger adds up to the shelf, site by site.
  const sums = new Map<string, number>();
  for (const m of history.movements) {
    const key = `${m.restaurantId}:${m.itemId}`;
    sums.set(key, (sums.get(key) ?? 0) + m.deltaMilli);
  }
  for (const level of history.levels) {
    const sum = sums.get(`${level.restaurantId}:${level.itemId}`) ?? 0;
    if (sum !== level.quantityMilli) {
      problems.push(
        `level ${level.restaurantId}/${level.itemId}: ${level.quantityMilli} ≠ ledger ${sum}`,
      );
    }
    if ((level.quantityMilli ?? 0) < 0) problems.push(`negative stock ${level.itemId}`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Demo data failed its own checks:\n  ${problems.slice(0, 10).join("\n  ")}`,
    );
  }
}

// ------------------------------------------------------------------- main

async function main() {
  console.log("Demo seed — development database only.\n");
  const plansRows = await prisma.plan.findMany();
  const planByCode = new Map(plansRows.map((p) => [p.code, p]));
  for (const spec of BUSINESSES) {
    if (!planByCode.has(spec.planCode)) {
      throw new Error(`Plan ${spec.planCode} is missing — run npm run db:seed first.`);
    }
  }
  const plans: Plans = { get: (code) => planByCode.get(code)! };

  // Showcase photos, by dish name, read before anything is touched.
  const showcase = await prisma.product.findMany({
    where: { restaurant: { isDemo: true }, imageUrl: { not: null } },
    select: { name: true, imageUrl: true },
    orderBy: { createdAt: "asc" },
  });
  const photos = new Map<string, string>();
  for (const product of showcase) {
    if (!photos.has(product.name) && product.imageUrl)
      photos.set(product.name, product.imageUrl);
  }

  console.log("Removing every restaurant except the homepage showcase menus…");
  await wipe();

  // The platform admin signs in with a password too.
  const adminRow =
    (await prisma.user.findUnique({ where: { phone: DEV_ADMIN_PHONE } })) ??
    (await prisma.user.create({
      data: { phone: DEV_ADMIN_PHONE, name: "مدیر پلتفرم", role: "SUPER_ADMIN" },
    }));
  await prisma.user.update({
    where: { id: adminRow.id },
    data: {
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      phoneVerifiedAt: adminRow.phoneVerifiedAt ?? NOW,
      isActive: true,
    },
  });
  const admin: Actor = {
    id: adminRow.id,
    phone: DEV_ADMIN_PHONE,
    name: adminRow.name,
    role: "SUPER_ADMIN",
  };

  // The showcase menus' own accounts get the demo password, so they can be
  // opened from the admin panel and signed into like any other.
  const showcaseUsers = await prisma.user.findMany({
    where: { restaurant: { isDemo: true }, passwordHash: null },
    select: { id: true },
  });
  for (const user of showcaseUsers) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(DEMO_PASSWORD) },
    });
  }

  resetGuestNumbers();
  const results = [];
  for (const spec of BUSINESSES) {
    console.log(`\n• ${spec.name} (${spec.slug}, ${spec.planCode})`);
    results.push(await createBusiness(spec, plans, photos, admin));
  }

  console.log(
    "\nDone. Every account's password:",
    DEMO_PASSWORD,
    "— admin:",
    ADMIN_PASSWORD,
  );
  console.log("\n  phone         role             business");
  console.log(`  ${DEV_ADMIN_PHONE}   platform admin   —`);
  for (const spec of BUSINESSES) {
    console.log(`  ${spec.owner.phone}   owner            ${spec.name}`);
    for (const staff of spec.staff)
      console.log(`  ${staff.phone}   staff            ${spec.name} — ${staff.title}`);
    for (const branch of spec.branches) {
      console.log(`  ${branch.manager.phone}   branch manager   ${branch.name}`);
      for (const staff of branch.staff)
        console.log(
          `  ${staff.phone}   branch staff     ${branch.name} — ${staff.title}`,
        );
    }
  }
  console.log(
    "\n  business                     since        orders   guests   sales (Toman)",
  );
  for (const r of results) {
    console.log(
      `  ${r.spec.slug.padEnd(28)} ${calendarKey(r.signupAt)}   ${String(r.orders).padStart(6)}   ${String(r.customers).padStart(6)}   ${formatMoney(r.revenue, "en")}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
