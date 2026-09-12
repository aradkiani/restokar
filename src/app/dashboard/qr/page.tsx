import type { Metadata } from "next";
import { requirePageTab } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { appUrlIsLocal, env } from "@/lib/env";
import { QrManager } from "./manager";

export const metadata: Metadata = { title: "بارکد میزها" };
export const dynamic = "force-dynamic";

export default async function QrPage() {
  const { restaurantId } = await requirePageTab("qr", "/dashboard/qr");

  const [restaurant, tables] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true, name: true, logoUrl: true },
    }),
    prisma.restaurantTable.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <QrManager
      baseUrl={env.NEXT_PUBLIC_APP_URL}
      isLocalUrl={appUrlIsLocal()}
      restaurant={{
        slug: restaurant?.slug ?? "",
        name: restaurant?.name ?? "",
        logoUrl: restaurant?.logoUrl ?? null,
      }}
      initialTables={tables.map((table) => ({
        id: table.id,
        number: table.number,
        label: table.label,
        seats: table.seats,
      }))}
    />
  );
}
