"use client";

import * as React from "react";
import { Ban, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError } from "@/lib/api-error";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SoldOutBoardDish } from "@/lib/sold-out-server";

/**
 * "We're out of it" — from the board, by whoever runs the pass.
 *
 * One tap greys a dish out on the guest menu until 05:00 the next morning;
 * another brings it back. The list is fetched when opened, so the board's
 * thirty-second poll does not carry the whole menu.
 */
export function SoldOutButton({ initialCount }: { initialCount: number }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [dishes, setDishes] = React.useState<SoldOutBoardDish[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function openList() {
    setOpen(true);
    setQuery("");
    const result = await api.get<SoldOutBoardDish[]>("/api/orders/sold-out");
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      setOpen(false);
      return;
    }
    setDishes(result.data);
  }

  async function toggle(dish: SoldOutBoardDish) {
    setBusyId(dish.id);
    const result = await api.post<{ soldOut: boolean; until: string | null }>(
      "/api/orders/sold-out",
      { productId: dish.id, soldOut: !dish.soldOut },
    );
    setBusyId(null);
    if (!result.ok) {
      toast.error(localizeApiError(result.error, t));
      return;
    }
    setDishes((current) =>
      (current ?? []).map((row) =>
        row.id === dish.id
          ? { ...row, soldOut: result.data.soldOut, until: result.data.until }
          : row,
      ),
    );
    toast.success(
      (result.data.soldOut ? t.kitchen.soldOutDone : t.kitchen.soldOutUndone).replace(
        "{name}",
        dish.name,
      ),
    );
  }

  // The page's count until the list has been opened; the list's own after.
  const count = dishes ? dishes.filter((dish) => dish.soldOut).length : initialCount;
  const needle = query.trim();
  const visible = (dishes ?? []).filter(
    (dish) => !needle || dish.name.includes(needle) || dish.categoryName.includes(needle),
  );
  // Sold-out dishes first, so the answer to "what are we out of?" is on top.
  const sorted = [...visible].sort((a, b) => Number(b.soldOut) - Number(a.soldOut));

  return (
    <>
      <button
        type="button"
        onClick={openList}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold",
          count > 0
            ? "border-red-300 bg-red-50 text-red-800 hover:border-red-400"
            : "border-ink-300 bg-surface text-ink-800 hover:border-ink-400",
        )}
      >
        <Ban className="size-4" />
        {t.kitchen.soldOutButton}
        {count > 0 && (
          <span className="rounded-full bg-red-600 px-1.5 text-xs text-white tabular-nums">
            {formatNumber(count, locale)}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title={t.kitchen.soldOutTitle}
        description={t.kitchen.soldOutHint}
      >
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.kitchen.soldOutSearch}
              aria-label={t.kitchen.soldOutSearch}
              className="ps-9"
            />
          </label>

          {dishes === null ? (
            <p className="py-8 text-center text-sm text-ink-500">{t.common.loading}</p>
          ) : sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">
              {t.kitchen.soldOutEmpty}
            </p>
          ) : (
            <ul className="max-h-[55vh] divide-y divide-ink-100 overflow-y-auto rounded-[var(--radius-md)] border border-ink-200">
              {sorted.map((dish) => (
                <li key={dish.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm font-bold",
                        dish.soldOut ? "text-ink-400 line-through" : "text-ink-900",
                      )}
                    >
                      {dish.name}
                    </p>
                    <p className="truncate text-xs text-ink-500">{dish.categoryName}</p>
                  </div>
                  {!dish.isAvailable ? (
                    <span className="text-xs text-ink-400">
                      {t.kitchen.soldOutOwnerOff}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === dish.id}
                      onClick={() => toggle(dish)}
                      aria-pressed={dish.soldOut}
                      className={cn(
                        "tap-safe min-h-9 shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors disabled:opacity-50",
                        dish.soldOut
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "border border-red-300 text-red-700 hover:bg-red-50",
                      )}
                    >
                      {dish.soldOut ? t.kitchen.soldOutBack : t.kitchen.soldOutMark}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
