"use client";

import * as React from "react";
import { Check, Plus, Star } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { formatDateTime, formatMoney, formatNumber, formatPercent } from "@/lib/format";

/** One dish and everything currently promoting it. */
export interface MerchandisingProduct {
  id: string;
  name: string;
  categoryName: string;
  isFeatured: boolean;
  featuredLabel: string | null;
  pairingNames: string[];
  bundleComponentNames: string[];
  upgradeOptions: { name: string; extraCost: number }[];
}

export interface PairSuggestion {
  sourceProductId: string;
  targetProductId: string;
  sourceName: string;
  targetName: string;
  pairCount: number;
  confidence: number;
}

/**
 * The owner's view of their own merchandising.
 *
 * Two jobs, in this order: show what is switched on and where a guest will meet
 * it, then offer what the venue's own bills suggest switching on next. Reading
 * comes before acting because an owner opening this page is usually orienting
 * rather than editing.
 *
 * Deliberately not a marketing dashboard. There are no charts, no funnels and
 * no scores — the performance figures already live on the analytics page, and
 * duplicating them here would make this the second place to look for the same
 * number. This page answers "what is on?", and nothing else.
 */
export function MerchandisingView({
  products,
  suggestions,
  existingBySource,
  computedAt,
}: {
  products: MerchandisingProduct[];
  suggestions: PairSuggestion[];
  /** Each dish's current pairings, so accepting one can append rather than replace. */
  existingBySource: Record<string, string[]>;
  computedAt: string | null;
}) {
  const { t, locale } = useI18n();
  const m = t.merchandising;

  /** Dishes with nothing switched on are not worth a row. */
  const promoted = products.filter(
    (product) =>
      product.isFeatured ||
      product.pairingNames.length > 0 ||
      product.bundleComponentNames.length > 0 ||
      product.upgradeOptions.length > 0,
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-ink-900">{m.title}</h1>
        <p className="mt-0.5 text-sm text-ink-500">{m.subtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{m.promotions}</CardTitle>
        </CardHeader>
        <CardBody>
          {promoted.length === 0 ? (
            <p className="text-sm text-ink-500">{m.empty}</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {promoted.map((product) => (
                <li key={product.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-ink-800">
                      {product.name}
                    </span>
                    <span className="text-xs text-ink-500">{product.categoryName}</span>
                  </div>

                  {/*
                    One line per promotion, each naming where it appears.

                    "Where" is the half an owner cannot otherwise discover: a
                    pairing shows on the product page *and* in the cart, a
                    featured dish at the top of the menu, an upgrade on the
                    product page. Guessing wrong about that is what makes
                    merchandising feel like it is not working.
                  */}
                  <div className="mt-1.5 space-y-1">
                    {product.isFeatured && (
                      <PromotionLine
                        icon={<Star className="size-3.5" aria-hidden />}
                        label={m.featured}
                        detail={
                          product.featuredLabel
                            ? (t.featuredLabels[
                                product.featuredLabel as keyof typeof t.featuredLabels
                              ] ?? null)
                            : null
                        }
                        where={m.appearsMenu}
                      />
                    )}

                    {product.pairingNames.length > 0 && (
                      <PromotionLine
                        label={m.pairings}
                        detail={product.pairingNames.join("، ")}
                        where={`${m.appearsProductSheet} · ${m.appearsCart}`}
                      />
                    )}

                    {product.bundleComponentNames.length > 0 && (
                      <PromotionLine
                        label={m.bundle}
                        detail={product.bundleComponentNames.join(" + ")}
                        where={`${m.appearsProductSheet} · ${m.appearsCart}`}
                      />
                    )}

                    {product.upgradeOptions.length > 0 && (
                      <PromotionLine
                        label={m.upgrade}
                        detail={product.upgradeOptions
                          .map(
                            (option) =>
                              `${option.name} +${formatMoney(option.extraCost, locale)}`,
                          )
                          .join("، ")}
                        where={m.appearsProductSheet}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <SuggestionsCard
        suggestions={suggestions}
        existingBySource={existingBySource}
        computedAt={computedAt}
      />
    </div>
  );
}

function PromotionLine({
  icon,
  label,
  detail,
  where,
}: {
  icon?: React.ReactNode;
  label: string;
  detail: string | null;
  where: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
      <span className="inline-flex items-center gap-1 font-semibold text-ink-700">
        {icon}
        {label}
      </span>
      {detail && <span className="text-ink-600">{detail}</span>}
      <span className="text-ink-400">· {where}</span>
    </div>
  );
}

/**
 * "These two sell together — want to make it a pairing?"
 *
 * The only place the venue's order history becomes an action. Each row states
 * the evidence in the owner's own terms — how many bills, and what share of the
 * source dish's bills — because a suggestion an owner cannot check is a
 * suggestion they cannot trust.
 *
 * Accepting one writes an ordinary `ProductRecommendation` through the existing
 * product route. There is no new endpoint and no new permission: the owner is
 * doing exactly what the product dialog already lets them do, with the typing
 * saved.
 */
function SuggestionsCard({
  suggestions,
  existingBySource,
  computedAt,
}: {
  suggestions: PairSuggestion[];
  existingBySource: Record<string, string[]>;
  computedAt: string | null;
}) {
  const { t, locale } = useI18n();
  const m = t.merchandising;

  const [added, setAdded] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);

  /**
   * Pairings added during this visit, on top of what the server rendered.
   *
   * Held as state rather than written back into `existingBySource`, which is a
   * prop: accepting two suggestions for the *same* dish has to send the first
   * one again with the second, and mutating the prop to remember that would be
   * a lie the next render tells.
   */
  const [addedBySource, setAddedBySource] = React.useState<Record<string, string[]>>({});

  /**
   * Appends one pairing to the dish that already has some.
   *
   * The product route replaces child collections wholesale — the existing
   * convention — so the full list has to be sent. It comes from the server
   * render rather than a read-back, because there is no `GET /api/products/:id`
   * and adding one would be a new authenticated surface for data this page has
   * already loaded.
   */
  async function accept(pair: PairSuggestion) {
    const key = `${pair.sourceProductId}|${pair.targetProductId}`;
    setBusy(key);
    setFailed(null);

    const existing =
      addedBySource[pair.sourceProductId] ?? existingBySource[pair.sourceProductId] ?? [];
    const next = [...existing, pair.targetProductId];

    const result = await api.patch(`/api/products/${pair.sourceProductId}`, {
      recommendations: next.map((recommendedProductId) => ({
        recommendedProductId,
        isActive: true,
      })),
    });

    setBusy(null);

    if (result.ok) {
      setAddedBySource((prev) => ({ ...prev, [pair.sourceProductId]: next }));
      setAdded((prev) => new Set(prev).add(key));
    } else {
      // Stated rather than swallowed: a silent no-op on a button press is the
      // one failure mode an owner cannot diagnose or work around.
      setFailed(key);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.suggestionsTitle}</CardTitle>
        <p className="mt-0.5 text-xs text-ink-500">{m.suggestionsHint}</p>
      </CardHeader>
      <CardBody>
        {suggestions.length === 0 ? (
          <p className="text-sm text-ink-500">{m.suggestionsEmpty}</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {suggestions.map((pair) => {
              const key = `${pair.sourceProductId}|${pair.targetProductId}`;
              const isAdded = added.has(key);

              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800">
                      {pair.sourceName} + {pair.targetName}
                    </p>
                    {/*
                      The evidence, stated as an association and never a cause —
                      the same discipline `sales-insights.ts` follows. Counts get
                      `dir="ltr"` per the convention for every figure here.
                    */}
                    <p className="mt-0.5 text-xs text-ink-500">
                      <span dir="ltr">
                        {m.togetherCount.replace(
                          "{count}",
                          formatNumber(pair.pairCount, locale),
                        )}
                      </span>
                      {" · "}
                      {m.togetherShare
                        .replace("{percent}", formatPercent(pair.confidence, locale))
                        .replace("{source}", pair.sourceName)}
                    </p>
                  </div>

                  {isAdded ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <Check className="size-4" aria-hidden />
                      {m.added}
                    </span>
                  ) : failed === key ? (
                    <span className="text-xs font-semibold text-rose-700">
                      {t.common.error}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy === key}
                      onClick={() => accept(pair)}
                    >
                      <Plus className="size-4" />
                      {m.addAsPairing}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/*
          When the figures were last counted.

          Always shown, because the refresh is lazy and can fail quietly. An
          owner reading day-old numbers should know they are day-old rather than
          assume they are live.
        */}
        <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-400">
          {m.computedAt}:{" "}
          {computedAt ? (
            /* `formatDateTime`, not `toLocaleString`: the platform formats every
               other date through it, and a raw call here would print a Jalali
               date in a different shape from the rest of the dashboard. */
            <span dir="ltr">{formatDateTime(computedAt, locale)}</span>
          ) : (
            m.never
          )}
        </p>
      </CardBody>
    </Card>
  );
}
