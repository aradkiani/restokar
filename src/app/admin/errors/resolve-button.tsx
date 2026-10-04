"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";

export function ResolveButton({ id, resolved }: { id: string; resolved: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    setBusy(true);
    const result = await api.patch(`/api/admin/errors/${id}`, { resolved: !resolved });
    setBusy(false);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant={resolved ? "ghost" : "outline"}
      loading={busy}
      onClick={toggle}
    >
      {resolved ? t.admin.errorReopen : t.admin.errorResolve}
    </Button>
  );
}
