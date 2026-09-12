"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/client-api";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await api.post("/api/auth/logout");
        router.replace("/");
        router.refresh();
      }}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink-300 bg-surface px-4 text-sm font-bold text-ink-700 transition-colors hover:border-ink-400 hover:text-ink-900"
    >
      <LogOut className="size-4" />
      {label}
    </button>
  );
}
