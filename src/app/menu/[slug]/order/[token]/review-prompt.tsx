"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { getDictionary } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Asking a guest how the meal was, once it has arrived.
 *
 * Shown only on DELIVERED, because a rating left while the food is still being
 * cooked is a rating of the wait — and an owner reading "2 stars" would have no
 * way to tell the two apart. The server refuses an early one as well; this is
 * the half that stops it being asked.
 *
 * Rating first, comment second, and the comment never required. Most people
 * will tap a star and close the tab, and a form that demands a sentence before
 * it accepts the tap collects nothing from them at all.
 */
export function ReviewPrompt({
  token,
  locale,
  initialRating,
  initialComment,
}: {
  token: string;
  locale: Locale;
  initialRating: number | null;
  initialComment: string | null;
}) {
  const t = getDictionary(locale);

  const [rating, setRating] = React.useState(initialRating ?? 0);
  const [comment, setComment] = React.useState(initialComment ?? "");
  const [saved, setSaved] = React.useState(initialRating !== null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /** True once the guest has changed something since the last save. */
  const [dirty, setDirty] = React.useState(false);

  async function submit(nextRating: number, nextComment: string) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/public/orders/${token}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rating: nextRating,
          comment: nextComment.trim() || undefined,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setError(payload?.error?.message ?? t.common.error);
        return;
      }

      setSaved(true);
      setDirty(false);
    } catch {
      setError(t.common.error);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Tapping a star saves immediately.
   *
   * The rating is the whole of what most guests will leave, and making them
   * find a second button to confirm it is how a one-tap answer becomes no
   * answer. The comment box appears afterwards for anyone who wants to say
   * more, and saves on its own.
   */
  function chooseRating(value: number) {
    setRating(value);
    void submit(value, comment);
  }

  return (
    <section className="menu-surface mt-5 p-4">
      <h2 className="text-sm font-black">
        {saved ? t.orderStatus.reviewThanks : t.orderStatus.reviewTitle}
      </h2>
      <p className="mt-1 text-xs opacity-60">
        {saved ? t.orderStatus.reviewChangeHint : t.orderStatus.reviewHint}
      </p>

      {/*
        Buttons rather than a radio group with a star background: each star is
        its own control with its own label, so a screen reader announces "4 of
        5" rather than an unlabelled graphic, and a tap target stays 44px.
      */}
      <div
        className="mt-3 flex items-center gap-1"
        role="group"
        aria-label={t.orderStatus.reviewTitle}
      >
        {[1, 2, 3, 4, 5].map((value) => {
          const filled = value <= rating;
          return (
            <button
              key={value}
              type="button"
              onClick={() => chooseRating(value)}
              disabled={busy}
              aria-pressed={rating === value}
              aria-label={`${value} / 5`}
              className="tap-safe grid size-11 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-60"
            >
              <Star
                className={cn("size-7", filled ? "fill-current" : "opacity-30")}
                style={filled ? { color: "var(--m-primary)" } : undefined}
              />
            </button>
          );
        })}
      </div>

      {rating > 0 && (
        <div className="mt-3">
          <label
            htmlFor="review-comment"
            className="mb-1.5 block text-xs font-semibold opacity-70"
          >
            {t.orderStatus.reviewCommentLabel}
          </label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setDirty(true);
            }}
            rows={3}
            maxLength={1000}
            className="w-full rounded-[var(--m-radius-sm)] border p-3 text-sm leading-7"
            style={{
              borderColor: "var(--m-border)",
              background: "var(--m-surface-bg)",
            }}
          />

          {/* Only once there is something unsaved to save. A button that does
              nothing is a button that teaches people not to press it. */}
          {dirty && (
            <button
              type="button"
              onClick={() => submit(rating, comment)}
              disabled={busy}
              className="tap-safe mt-2 h-11 w-full rounded-full text-sm font-extrabold disabled:opacity-60"
              style={{
                background: "var(--m-primary)",
                color: "var(--m-primary-contrast)",
              }}
            >
              {busy ? t.orderStatus.reviewSaving : t.orderStatus.reviewSave}
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
