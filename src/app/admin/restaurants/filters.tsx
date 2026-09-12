"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

/**
 * Search, filter and sort controls.
 *
 * State lives in the URL rather than component state, so a filtered view is
 * shareable and survives a refresh — and the server component above stays the
 * single place that reads and applies the filters.
 */
export function RestaurantFilters({
  plans,
}: {
  plans: { code: string; name: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const [search, setSearch] = React.useState(params.get("search") ?? "");

  const update = React.useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      router.push(`/admin/restaurants?${next.toString()}`);
    },
    [params, router],
  );

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    update({ search });
  }

  const hasFilters =
    Boolean(params.get("search")) ||
    Boolean(params.get("status")) ||
    Boolean(params.get("plan"));

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-ink-200 bg-surface p-3">
      <form onSubmit={submitSearch} className="relative min-w-[16rem] flex-1">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.admin.search}
          aria-label={t.admin.search}
          className="ps-10"
        />
      </form>

      <Select
        aria-label={t.admin.filterStatus}
        value={params.get("status") ?? ""}
        onChange={(event) => update({ status: event.target.value })}
        className="w-auto min-w-[10rem]"
      >
        <option value="">{t.admin.allStatuses}</option>
        {(["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "EXPIRED"] as const).map(
          (status) => (
            <option key={status} value={status}>
              {t.subscription[`status${status}` as keyof typeof t.subscription]}
            </option>
          ),
        )}
      </Select>

      <Select
        aria-label={t.admin.filterPlan}
        value={params.get("plan") ?? ""}
        onChange={(event) => update({ plan: event.target.value })}
        className="w-auto min-w-[9rem]"
      >
        <option value="">{t.admin.allPlans}</option>
        {plans.map((plan) => (
          <option key={plan.code} value={plan.code}>
            {plan.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label={t.admin.sortBy}
        value={`${params.get("sort") ?? "createdAt"}:${params.get("direction") ?? "desc"}`}
        onChange={(event) => {
          const [sort, direction] = event.target.value.split(":");
          update({ sort: sort!, direction: direction! });
        }}
        className="w-auto min-w-[11rem]"
      >
        <option value="createdAt:desc">{t.admin.sortCreatedAt} ↓</option>
        <option value="createdAt:asc">{t.admin.sortCreatedAt} ↑</option>
        <option value="name:asc">{t.admin.sortName} ↑</option>
        <option value="revenue:desc">{t.admin.sortRevenue} ↓</option>
        <option value="expiresAt:asc">{t.admin.sortExpiresAt} ↑</option>
        <option value="status:asc">{t.admin.sortStatus} ↑</option>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            router.push("/admin/restaurants");
          }}
        >
          <X className="size-4" />
          {t.common.cancel}
        </Button>
      )}
    </div>
  );
}
