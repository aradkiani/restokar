import { Badge } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";

type Status = "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELED";

const TONES = {
  RECEIVED: "info",
  PREPARING: "warning",
  READY: "success",
  DELIVERED: "neutral",
  CANCELED: "danger",
} as const;

export function OrderStatusBadge({ status, locale }: { status: Status; locale: Locale }) {
  const t = getDictionary(locale);
  return <Badge tone={TONES[status]}>{t.orderStatus[status]}</Badge>;
}
