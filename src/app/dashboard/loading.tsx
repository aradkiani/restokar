import { PageSkeleton } from "@/components/ui/skeleton";
import { getI18n } from "@/lib/i18n";

/**
 * Shown inside the panel's own frame while the next page renders, so a tap on
 * the menu gets an immediate response instead of a frozen screen.
 */
export default async function Loading() {
  const { t } = await getI18n();
  return <PageSkeleton label={t.common.loading} />;
}
