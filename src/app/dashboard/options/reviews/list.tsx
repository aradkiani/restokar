"use client";

import * as React from "react";
import { ChevronDown, Star } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/format";

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  orderNumber: number;
  customerName: string;
}

/** `null` is "every rating"; otherwise the star band being read. */
type Filter = number | null;

/**
 * The owner's view of what guests thought.
 *
 * Filtered by star band rather than sorted by it, because the question an owner
 * actually has is "what did the unhappy ones say?" — and a sort leaves those
 * answers spread through a list they have to keep scrolling.
 *
 * Comments start collapsed to one line. A page of five-line quotations is a
 * page nobody reads to the end of; a column of one-liners can be scanned, and
 * the ones worth reading properly open where they sit.
 */
export function ReviewsList({
  counts,
  total,
  average,
  reviews,
}: {
  counts: Record<number, number>;
  total: number;
  average: number;
  reviews: ReviewRow[];
}) {
  const { t, locale } = useI18n();

  const [filter, setFilter] = React.useState<Filter>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const visible = filter === null ? reviews : reviews.filter((r) => r.rating === filter);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (total === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Star className="size-6" />}
          title={t.reviews.emptyTitle}
          description={t.reviews.emptyBody}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t.reviews.title}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-ink-900 tabular-nums">
              {formatNumber(average, locale)}
            </span>
            <Stars rating={Math.round(average)} />
            <span className="text-xs text-ink-500">
              {formatNumber(total, locale)} {t.reviews.countSuffix}
            </span>
          </div>

          {/*
            One chip per band, each carrying its own count. A band with no
            reviews is shown and disabled rather than hidden: "no one has given
            us one star" is information, and a row of chips that changes shape
            as feedback arrives is harder to read at a glance.
          */}
          <div
            role="group"
            aria-label={t.reviews.filterLabel}
            className="flex flex-wrap gap-1.5"
          >
            <FilterChip
              active={filter === null}
              onClick={() => setFilter(null)}
              label={t.reviews.allRatings}
              count={total}
              locale={locale}
            />
            {[5, 4, 3, 2, 1].map((rating) => (
              <FilterChip
                key={rating}
                active={filter === rating}
                onClick={() => setFilter(rating)}
                disabled={counts[rating] === 0}
                label={`${formatNumber(rating, locale)} ★`}
                count={counts[rating] ?? 0}
                locale={locale}
              />
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm font-semibold text-ink-400">
              {t.reviews.noneInBand}
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {visible.map((review) => {
                const isOpen = expanded.has(review.id);
                const hasComment = Boolean(review.comment?.trim());

                return (
                  <li key={review.id}>
                    {/*
                      The whole row is the control when there is something to
                      open, so the tap target is the line the eye is already on
                      rather than a chevron at the end of it. A review with no
                      comment has nothing to expand and is plain markup.
                    */}
                    <div
                      {...(hasComment
                        ? {
                            role: "button" as const,
                            tabIndex: 0,
                            "aria-expanded": isOpen,
                            onClick: () => toggle(review.id),
                            onKeyDown: (e: React.KeyboardEvent) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggle(review.id);
                              }
                            },
                          }
                        : {})}
                      className={cn(
                        "flex items-start gap-3 p-3.5",
                        hasComment && "cursor-pointer hover:bg-ink-50",
                      )}
                    >
                      <Stars rating={review.rating} />

                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-500">
                          <span className="font-bold text-ink-800">
                            {review.customerName}
                          </span>
                          <span className="tabular-nums">
                            #{formatNumber(review.orderNumber, locale)}
                          </span>
                          <span>{formatDate(new Date(review.createdAt), locale)}</span>
                        </p>

                        {hasComment ? (
                          <p
                            className={cn(
                              "mt-1 text-sm leading-7 text-ink-700",
                              !isOpen && "line-clamp-1",
                            )}
                          >
                            {review.comment}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-ink-400">
                            {t.reviews.noComment}
                          </p>
                        )}
                      </div>

                      {hasComment && (
                        <ChevronDown
                          className={cn(
                            "mt-0.5 size-4 shrink-0 text-ink-400 transition-transform",
                            isOpen && "rotate-180",
                          )}
                          aria-hidden
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/** Five stars with `rating` of them filled. Decorative — the number is beside it. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn(
            "size-3.5",
            value <= rating ? "fill-amber-400 text-amber-400" : "text-ink-200",
          )}
        />
      ))}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  locale,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  locale: Parameters<typeof formatNumber>[1];
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "tap-safe inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 text-xs font-bold transition-colors",
        active
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-ink-200 text-ink-600 hover:bg-ink-50",
        disabled && "opacity-40",
      )}
    >
      {label}
      <span className="tabular-nums opacity-60">{formatNumber(count, locale)}</span>
    </button>
  );
}
