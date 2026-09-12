import type { Metadata } from "next";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getMenuForPreview } from "@/lib/menu";
import { parseTheme } from "@/lib/theme";
import { DesignEditor } from "./editor";

export const metadata: Metadata = { title: "طراحی منو" };
export const dynamic = "force-dynamic";

export default async function DesignPage() {
  const { restaurantId } = await requirePageTab("design", "/dashboard/design");
  const { locale } = await getI18n();

  const [restaurant, preview] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { templateId: true, theme: true, showProductPhotos: true },
    }),
    getMenuForPreview(restaurantId),
  ]);

  return (
    <DesignEditor
      locale={locale}
      initialTemplateId={restaurant?.templateId ?? "aurora"}
      initialTheme={parseTheme(restaurant?.theme)}
      initialShowProductPhotos={restaurant?.showProductPhotos ?? true}
      previewData={preview?.data ?? null}
    />
  );
}
