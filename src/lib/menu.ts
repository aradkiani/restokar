import "server-only";
import { prisma } from "./prisma";
import { resolveTheme, type ResolvedTheme } from "./theme";
import { SocialLinksSchema } from "./validation";
import type { SocialLink } from "./socials";
import { DAY_MS, GRACE_DAYS } from "./constants";
import { PAYMENTS_ENABLED } from "./features";
import { resolveAvailability } from "./availability";
import { isFeaturedNow } from "./featured";
import { zonedMoment } from "./time";
import { getTemplateMeta } from "@/templates/registry";
import type { MenuData, MenuPairStat } from "@/templates/types";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The single mapping between database rows and the public template contract.
 * Every field a template can read passes through here, which is what lets the
 * schema evolve without breaking four templates at once.
 */
export interface PublicMenu {
  data: MenuData;
  theme: ResolvedTheme;
  templateId: string;
  restaurantId: string;
  defaultLocale: string;
}

/**
 * Shared shape for both the public and the owner-preview queries.
 * `satisfies` (rather than `as const`) keeps the literal types Prisma needs
 * while leaving the object mutable, which its generated arg types require.
 */
const scheduleWindowSelect = {
  select: { dayOfWeek: true, startMinute: true, endMinute: true },
} as const;

const menuInclude = {
  /*
    The venue's whole recommendation graph, in one query.

    A top-level include rather than a nested one under each product: an edge is
    two ids, a busy menu has a few dozen of them, and reading them per dish
    would be the N+1 this feature must not introduce. Ordered by source and then
    by the owner's `sortOrder` so the client can keep the arrays it builds below
    in the order the owner chose without sorting again.
  */
  recommendations: {
    where: { isActive: true },
    orderBy: [{ sourceProductId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { sourceProductId: true, recommendedProductId: true },
  },
  /*
    The venue's bundle contents, in one query, for the same reason.

    A meal deal is an ordinary product that happens to list components, so its
    price, photo and availability already arrive with the rest of the menu —
    these rows only say what is inside it. Ordered by bundle and position so the
    arrays built below keep the owner's arrangement without a second sort.
  */
  bundleItems: {
    orderBy: [{ bundleProductId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { bundleProductId: true, componentProductId: true, quantity: true },
  },
  /*
    The co-occurrence aggregate — four integers per pair, already counted.

    Read, never computed, on this path. The counting pass is a scan of order
    history that belongs nowhere near a menu render; `co-occurrence-server.ts`
    does it on an authenticated dashboard visit and stores the result, and this
    is one indexed read of the outcome.

    Capped at a few hundred rows because a venue's qualifying pairs are few —
    the thresholds in `co-occurrence.ts` discard most of the graph — and because
    an unbounded include on the hottest page in the product is how a payload
    quietly triples.
  */
  pairStats: {
    orderBy: [{ pairCount: "desc" }, { sourceProductId: "asc" }],
    take: 400,
    select: {
      sourceProductId: true,
      targetProductId: true,
      pairCount: true,
      sourceSupport: true,
      targetSupport: true,
      totalOrders: true,
    },
  },
  categories: {
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      availabilityWindows: scheduleWindowSelect,
      products: {
        /*
          Whether a product is hidden is decided in `toPublicMenu`, not here.

          This clause used to filter `isAvailable: false AND hideWhenUnavailable`
          in SQL. It cannot any more: a dish outside its opening hours is
          unavailable too, and that is a question about the current time which
          the database is not being asked. Deciding it in one place in JS is
          what keeps the menu and the order path agreeing — the alternative is
          half the rule in SQL and half in `availability.ts`, which is how they
          come to disagree.

          The cost is loading the few rows that used to be filtered out; a menu
          is tens of products, and they are read by the same indexed query
          either way.

          The ordering here is deliberately the category's own and nothing
          else. `featuredOrder` is *not* part of it: leading with it would move
          a promoted dish within its category on the normal menu, so featuring
          something would silently reorder the page it appears on. The strip
          sorts by that column itself, from the value carried on each product.
        */
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          availabilityWindows: scheduleWindowSelect,
          infoSections: { orderBy: { sortOrder: "asc" } },
          optionGroups: {
            orderBy: { sortOrder: "asc" },
            include: { choices: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  },
} satisfies Prisma.RestaurantInclude;

type RestaurantWithMenu = Prisma.RestaurantGetPayload<{ include: typeof menuInclude }>;

/**
 * Tolerant parse of the `socialLinks` JSON column, mirroring `parseTheme`.
 *
 * A malformed value must never break a live menu, and this one is read from a
 * column rather than a request — so it could predate the current shape, or have
 * been written by hand. Anything that does not validate yields an empty row of
 * icons instead of a crashed page.
 */
function parseSocialLinks(value: unknown): SocialLink[] {
  const parsed = SocialLinksSchema.safeParse(value);
  return parsed.success ? (parsed.data as SocialLink[]) : [];
}

/**
 * @param soldOut Dishes this site has run out of today (see SoldOutProduct).
 *   Empty for the owner's design preview, which shows the whole menu.
 */
function toPublicMenu(
  restaurant: RestaurantWithMenu,
  soldOut: ReadonlySet<string> = new Set(),
): PublicMenu {
  const templateMeta = getTemplateMeta(restaurant.templateId);

  /*
    One reading of the clock for the whole menu.

    Taken once rather than per product for two reasons: a render that straddled
    a boundary minute would show two dishes disagreeing about what time it is,
    and the alternative is a `new Date()` per line on the hottest path in the
    product.
  */
  const now = zonedMoment();

  /*
    The same instant, as a plain Date.

    Opening hours are a wall-clock question and promotion windows are an
    absolute-time one, so they need the moment in two forms — but both must come
    from *one* reading of the clock, or a render straddling a boundary could
    call a dish available and not-yet-promoted from the same pass.
  */
  const renderedAt = new Date();

  /*
    Availability and the hide rule, resolved before anything is mapped.

    Hoisted out of the DTO because the recommendation ids below need to know
    which dishes actually made it onto the menu, and asking that question twice
    is how the two answers come to differ.
  */
  const visibleCategories = restaurant.categories
    .map((category) => {
      const categorySchedule = {
        scheduleEnabled: category.scheduleEnabled,
        windows: category.availabilityWindows,
      };

      const products = category.products
        .map((product) => ({
          product,
          availability: resolveAvailability(
            {
              isAvailable: product.isAvailable,
              soldOut: soldOut.has(product.id),
              product: {
                scheduleEnabled: product.scheduleEnabled,
                windows: product.availabilityWindows,
              },
              category: categorySchedule,
            },
            now,
          ),
        }))
        /*
          The rule that used to live in the SQL `where`, now applied to
          effective availability rather than to the manual switch alone.

          A dish outside its opening hours is unavailable in exactly the sense
          the owner already configured a response to: hide it, or leave it
          listed with the badge guests already understand. Reusing that switch
          means scheduling introduces no new menu behaviour to explain — an
          owner who wanted sold-out dishes hidden gets out-of-hours dishes
          hidden for the same reason.
        */
        .filter(
          ({ product, availability }) =>
            availability.available || !product.hideWhenUnavailable,
        );

      return { category, products };
    })
    // Categories with nothing left in them would render as empty headings.
    .filter(({ products }) => products.length > 0);

  /*
    Suggestions, keyed by the dish that triggers them.

    Both ends are checked against what this menu actually rendered. A dish the
    owner hid, or one whose category closed for the evening, is not on the page
    for the client to resolve — so listing its id would put an unresolvable
    reference in every guest's payload and leak the existence of something the
    venue chose not to show.

    The edges arrive already ordered by the owner's `sortOrder`, so appending in
    iteration order preserves it without a second sort.
  */
  const visibleProductIds = new Set(
    visibleCategories.flatMap(({ products }) =>
      products.map(({ product }) => product.id),
    ),
  );

  const recommendationsBySource = new Map<string, string[]>();
  for (const edge of restaurant.recommendations) {
    if (!visibleProductIds.has(edge.sourceProductId)) continue;
    if (!visibleProductIds.has(edge.recommendedProductId)) continue;

    const existing = recommendationsBySource.get(edge.sourceProductId);
    if (existing) existing.push(edge.recommendedProductId);
    else recommendationsBySource.set(edge.sourceProductId, [edge.recommendedProductId]);
  }

  /*
    Bundle contents, keyed by the deal.

    Both ends checked against what actually rendered, exactly like the edges
    above. A component the owner hid is not on the page to resolve, and a bundle
    is only honest if the guest can see what is in it — so a deal whose contents
    are partly invisible keeps the components that rendered and loses the rest,
    which `isBundleOrderable` then treats as it treats any missing dish.
  */
  const bundleComponentsByBundle = new Map<
    string,
    { productId: string; quantity: number }[]
  >();
  for (const item of restaurant.bundleItems) {
    if (!visibleProductIds.has(item.bundleProductId)) continue;
    if (!visibleProductIds.has(item.componentProductId)) continue;

    const entry = { productId: item.componentProductId, quantity: item.quantity };
    const existing = bundleComponentsByBundle.get(item.bundleProductId);
    if (existing) existing.push(entry);
    else bundleComponentsByBundle.set(item.bundleProductId, [entry]);
  }

  /*
    Co-occurrence, keyed by the dish it is a partner of.

    The raw counts travel rather than a finished ranking, so the thresholds stay
    in one place and the client applies exactly the rules the dashboard does.
    Four integers per pair — nothing here identifies a guest, which is the whole
    reason this feature needs no profiling to work.
  */
  const pairStatsBySource = new Map<string, MenuPairStat[]>();
  for (const stat of restaurant.pairStats) {
    if (!visibleProductIds.has(stat.sourceProductId)) continue;
    if (!visibleProductIds.has(stat.targetProductId)) continue;

    const existing = pairStatsBySource.get(stat.sourceProductId);
    if (existing) existing.push(stat);
    else pairStatsBySource.set(stat.sourceProductId, [stat]);
  }

  return {
    restaurantId: restaurant.id,
    templateId: templateMeta.id,
    defaultLocale: restaurant.defaultLocale,
    theme: resolveTheme(restaurant.theme, templateMeta.defaultTheme),
    data: {
      restaurant: {
        id: restaurant.id,
        slug: restaurant.slug,
        name: restaurant.name,
        nameEn: restaurant.nameEn,
        tagline: restaurant.tagline,
        description: restaurant.description,
        taglineEn: restaurant.taglineEn,
        descriptionEn: restaurant.descriptionEn,
        logoUrl: restaurant.logoUrl,
        coverUrl: restaurant.coverUrl,
        phone: restaurant.phone,
        phoneSecondary: restaurant.phoneSecondary,
        address: restaurant.address,
        instagram: restaurant.instagram,
        socialLinks: parseSocialLinks(restaurant.socialLinks),
        showPrices: restaurant.showPrices,
        showProductPhotos: restaurant.showProductPhotos,
        onlineOrderingEnabled: restaurant.onlineOrderingEnabled,
        // Never offered to a guest while the platform switch is off, whatever
        // the venue has chosen. Otherwise the checkout shows a card option that
        // `createOrder` then refuses — the worst possible moment to find out.
        onlinePaymentEnabled: PAYMENTS_ENABLED && restaurant.onlinePaymentEnabled,
        // Pricing options travel with the menu so the cart can show the same
        // total the server will charge — a basket that quietly gains tax at
        // checkout is worse than not offering tax at all.
        taxEnabled: restaurant.taxEnabled,
        taxPercent: restaurant.taxPercent,
        serviceChargeEnabled: restaurant.serviceChargeEnabled,
        serviceChargePercent: restaurant.serviceChargePercent,
        roundingIncrement: restaurant.roundingIncrement,
        roundingDirection: restaurant.roundingDirection,
        tipEnabled: restaurant.tipEnabled,
        tipPercents: restaurant.tipPercents,
        minimumOrderAmount: restaurant.minimumOrderAmount,
        discountCodesEnabled: restaurant.discountCodesEnabled,
        staffCallEnabled: restaurant.staffCallEnabled,
        staffCallLabel: restaurant.staffCallLabel,
        staffCallLabelEn: restaurant.staffCallLabelEn,
        bilingualEnabled: restaurant.bilingualEnabled,
        featuredSectionEnabled: restaurant.featuredSectionEnabled,
        phoneCollectionEnabled: restaurant.phoneCollectionEnabled,
        takeawayEnabled: restaurant.takeawayEnabled,
      },
      categories: visibleCategories.map(({ category, products }) => ({
        id: category.id,
        name: category.name,
        nameEn: category.nameEn,
        icon: category.icon,
        iconUrl: category.iconUrl,
        imageUrl: category.imageUrl,
        products: products.map(({ product, availability }) => ({
          id: product.id,
          name: product.name,
          nameEn: product.nameEn,
          shortDescription: product.shortDescription,
          fullDescription: product.fullDescription,
          shortDescriptionEn: product.shortDescriptionEn,
          fullDescriptionEn: product.fullDescriptionEn,
          imageUrl: product.imageUrl,
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          // The *effective* answer, so a template showing the existing
          // "unavailable" badge covers being out of hours with no template
          // change at all — and all eleven get it at once.
          isAvailable: availability.available,
          /*
            Also the effective answer, and for the same reason.

            A dish is reported as featured only while its promotion window is
            open *and* it is orderable, so the four templates that already read
            this flag stop promoting sold-out and out-of-hours dishes without a
            line of template code changing. `isFeaturedNow` composes the
            availability answer above rather than re-deriving it.
          */
          isFeatured: isFeaturedNow(
            { ...product, isAvailable: availability.available },
            renderedAt,
          ),
          featuredLabel: product.featuredLabel,
          featuredLabelText: product.featuredLabelText,
          featuredOrder: product.featuredOrder,
          prepMinutes: product.prepMinutes,
          categoryId: product.categoryId,
          recommendedProductIds: recommendationsBySource.get(product.id) ?? [],
          bundleComponents: bundleComponentsByBundle.get(product.id) ?? [],
          frequentlyWith: pairStatsBySource.get(product.id) ?? [],
          pairingNote: product.pairingNote,
          pairingNoteEn: product.pairingNoteEn,
          infoSections: product.infoSections.map((section) => ({
            id: section.id,
            title: section.title,
            content: section.content,
            titleEn: section.titleEn,
            contentEn: section.contentEn,
            icon: section.icon,
          })),
          // Note what is not copied: `costDelta`. This object is serialised
          // into every guest's page, and an option's cost of goods is the
          // owner's margin, not public information.
          optionGroups: product.optionGroups.map((group) => ({
            id: group.id,
            name: group.name,
            nameEn: group.nameEn,
            isRequired: group.isRequired,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            isUpgrade: group.isUpgrade,
            choices: group.choices.map((choice) => ({
              id: choice.id,
              name: choice.name,
              nameEn: choice.nameEn,
              priceDelta: choice.priceDelta,
              isAvailable: choice.isAvailable,
            })),
          })),
        })),
      })),
    },
  };
}

/**
 * Restores a slug that arrived percent-encoded in a URL path.
 *
 * Slugs may be Persian — `slugSchema` allows the whole Arabic block, and an
 * Iranian owner naturally picks «سنتی-حشمت» over a transliteration. Such a slug
 * reaches a route param still encoded as `%D8%B3%D9%86…`, which matches no row,
 * so the menu 404s even though the restaurant is live. Ordinary ASCII slugs
 * contain no `%` and decode to themselves, so this is a no-op for them.
 *
 * Malformed input (a stray `%` a scanner mangled) throws in decodeURIComponent;
 * falling back to the raw value simply misses the row and yields the same 404
 * the caller would otherwise show.
 */
export function decodeSlug(slug: string): string {
  if (!slug.includes("%")) return slug;
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

/**
 * The venue whose menu a given venue serves — itself, or its parent if it is a
 * branch of a chain.
 *
 * The single place the branch/parent distinction is resolved. Everything that
 * needs to ask "whose dishes are these?" goes through here, so the rule lives
 * in one line rather than being re-derived at each call site.
 */
export function menuOwnerId(restaurant: {
  id: string;
  parentRestaurantId: string | null;
}): string {
  return restaurant.parentRestaurantId ?? restaurant.id;
}

/**
 * A venue whose menu is offline only because its subscription lapsed: its
 * name, so the page can say «temporarily unavailable» instead of «not found».
 * Returns null for anything else — unknown, disabled or unpublished addresses
 * still get the plain 404. A printed QR code on a table should not tell a
 * guest the restaurant does not exist.
 */
export async function pausedVenue(slug: string): Promise<{ name: string } | null> {
  const venue = await prisma.restaurant.findUnique({
    where: { slug: decodeSlug(slug) },
    select: {
      name: true,
      isActive: true,
      isPublished: true,
      subscription: { select: { status: true } },
      parentRestaurant: { select: { subscription: { select: { status: true } } } },
    },
  });
  if (!venue || !venue.isActive || !venue.isPublished) return null;
  const subscription = venue.subscription ?? venue.parentRestaurant?.subscription;
  return subscription ? { name: venue.name } : null;
}

/**
 * The guest-facing menu. Returns null — which the page turns into a 404 — when
 * the restaurant is disabled, unpublished, or its subscription has lapsed.
 *
 * For a branch this composes two rows: the dishes, theme and template come from
 * the parent, while identity and location — name, slug, address, phone, and
 * crucially the `id` that orders are written against — stay the branch's own.
 * That split is the whole feature: one menu, many addresses, revenue landing in
 * the branch that earned it.
 */
export async function getPublicMenu(slug: string): Promise<PublicMenu | null> {
  const venue = await prisma.restaurant.findUnique({
    where: { slug: decodeSlug(slug) },
    include: { ...menuInclude, subscription: true },
  });

  if (!venue || !venue.isActive || !venue.isPublished) return null;

  let restaurant = venue;

  if (venue.parentRestaurantId) {
    const parent = await prisma.restaurant.findUnique({
      where: { id: venue.parentRestaurantId },
      include: { ...menuInclude, subscription: true },
    });

    // A branch whose parent is gone or switched off has nothing to serve. It
    // 404s rather than falling back to an empty menu, which would look like a
    // restaurant that sells nothing.
    if (!parent || !parent.isActive) return null;

    restaurant = {
      // Menu content and presentation belong to the chain…
      ...parent,
      // …identity, location and ownership of orders belong to the branch.
      id: venue.id,
      slug: venue.slug,
      name: venue.name,
      nameEn: venue.nameEn,
      tagline: venue.tagline,
      taglineEn: venue.taglineEn,
      phone: venue.phone,
      phoneSecondary: venue.phoneSecondary,
      address: venue.address,
      instagram: venue.instagram,
      socialLinks: venue.socialLinks,
      parentRestaurantId: venue.parentRestaurantId,
      isPublished: venue.isPublished,
      isActive: venue.isActive,
      onlineOrderingEnabled: venue.onlineOrderingEnabled,
      /*
        The chain is billed once, on the parent, so a branch normally carries
        no subscription row of its own. Falling back to the parent's is what
        makes a lapsed chain take *all* its branches offline — without it, a
        branch with no row would read as "predates billing" and stay up for
        free indefinitely.
      */
      subscription: venue.subscription ?? parent.subscription,
    };
  }

  // An expired subscription takes the public menu offline — the point at which
  // SaaS billing actually bites.
  //
  // The period end is the authority here, not `status`: nothing flips a row to
  // EXPIRED on a schedule, so trusting the status alone would mean no
  // subscription ever lapsed. CANCELED is honoured immediately.
  const subscription = restaurant.subscription;
  if (subscription) {
    if (subscription.status === "CANCELED") return null;

    // A few days of grace: a failed renewal at 9pm on a Thursday should not
    // black out a full restaurant's menu mid-service.
    const graceEndsAt = subscription.currentPeriodEnd.getTime() + GRACE_DAYS * DAY_MS;
    if (Date.now() > graceEndsAt) return null;
  }

  /*
    Sold out is per site: `venue.id` is the branch (or the single venue) the
    guest is standing in, even though the dishes are the chain's. Read here
    rather than through sold-out-server, which itself depends on this module.
  */
  const soldOut = await prisma.soldOutProduct.findMany({
    where: { restaurantId: venue.id, until: { gt: new Date() } },
    select: { productId: true },
  });

  return toPublicMenu(restaurant, new Set(soldOut.map((row) => row.productId)));
}

/**
 * Owner-side preview for the design editor: bypasses publish state and
 * subscription checks so an owner can always see what they are building.
 * Callers must have already established tenant ownership of `restaurantId`.
 */
export async function getMenuForPreview(
  restaurantId: string,
): Promise<PublicMenu | null> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: menuInclude,
  });

  return restaurant ? toPublicMenu(restaurant) : null;
}
