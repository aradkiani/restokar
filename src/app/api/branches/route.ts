import bcrypt from "bcryptjs";
import { ok, parseBody, route } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { HttpError, requireChainOwner } from "@/lib/auth/guards";
import { BranchSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Branches of a chain.
 *
 * A branch is a full tenant apart from one thing: it does not own a menu. It
 * carries `parentRestaurantId`, and `getPublicMenu` composes the parent's
 * dishes with the branch's own address, so the chain edits a price once and
 * every site serves it on the next request.
 *
 * Everything else stays the branch's: its slug and QR codes, its tables, its
 * orders, its expenses — which is what makes per-branch revenue meaningful
 * rather than a slice of one shared pile.
 */

export const GET = route(async () => {
  const { restaurantId } = await requireChainOwner();

  const branches = await prisma.restaurant.findMany({
    where: { parentRestaurantId: restaurantId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      members: {
        where: { role: "BRANCH_MANAGER" },
        select: { name: true, email: true },
      },
    },
  });

  return ok(branches);
});

export const POST = route(async (request: Request) => {
  const { restaurantId, user } = await requireChainOwner();
  const input = await parseBody(request, BranchSchema);

  const [slugTaken, emailTaken] = await Promise.all([
    prisma.restaurant.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    prisma.user.findUnique({
      where: { email: input.managerEmail },
      select: { id: true },
    }),
  ]);

  // Fallback text only — the client renders the localized string from `code`.
  if (slugTaken) throw new HttpError(409, "Slug already taken", "SLUG_TAKEN");
  if (emailTaken) throw new HttpError(409, "Email already registered", "EMAIL_TAKEN");

  const parent = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: {
      templateId: true,
      theme: true,
      logoUrl: true,
      coverUrl: true,
      defaultLocale: true,
      bilingualEnabled: true,
      showPrices: true,
      showProductPhotos: true,
      onlineOrderingEnabled: true,
      onlinePaymentEnabled: true,
    },
  });

  const passwordHash = await bcrypt.hash(input.managerPassword, 12);

  /*
    One transaction: a branch row without its manager account is a menu address
    nobody can operate, and a manager without a branch is an account that cannot
    sign in anywhere.
  */
  const branch = await prisma.$transaction(async (tx) => {
    const created = await tx.restaurant.create({
      data: {
        parentRestaurantId: restaurantId,
        // The chain owner owns every branch venue; the branch manager is a
        // member of it, not its owner. That is what keeps menu editing with the
        // chain while day-to-day operation sits at the site.
        ownerId: user.id,
        slug: input.slug,
        name: input.name,
        address: input.address || null,
        phone: input.phone || null,
        // Presentation is inherited so a new branch looks like the chain from
        // its first request. The menu itself is never copied — it is read
        // through the parent at render time.
        templateId: parent.templateId,
        theme: parent.theme ?? undefined,
        logoUrl: parent.logoUrl,
        coverUrl: parent.coverUrl,
        defaultLocale: parent.defaultLocale,
        bilingualEnabled: parent.bilingualEnabled,
        showPrices: parent.showPrices,
        showProductPhotos: parent.showProductPhotos,
        onlineOrderingEnabled: parent.onlineOrderingEnabled,
        onlinePaymentEnabled: parent.onlinePaymentEnabled,
        isPublished: true,
      },
      select: { id: true, name: true, slug: true },
    });

    await tx.user.create({
      data: {
        email: input.managerEmail,
        passwordHash,
        name: input.managerName,
        role: "BRANCH_MANAGER",
        restaurantId: created.id,
      },
    });

    if (input.tableCount && input.tableCount > 0) {
      await tx.restaurantTable.createMany({
        data: Array.from({ length: input.tableCount }, (_, i) => ({
          restaurantId: created.id,
          number: String(i + 1),
          seats: i % 3 === 0 ? 2 : 4,
        })),
      });
    }

    return created;
  });

  // STAFF_CREATED rather than a new enum value: creating a branch does create
  // the account that runs it, and the summary carries what actually happened.
  await recordAudit({
    actor: user,
    restaurantId,
    action: "STAFF_CREATED",
    summary: `Branch created: ${branch.name} (/menu/${branch.slug})`,
    entityType: "Restaurant",
    entityId: branch.id,
  });

  return ok(branch, { status: 201 });
});
