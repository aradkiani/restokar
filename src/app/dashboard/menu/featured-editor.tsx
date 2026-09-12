"use client";

import * as React from "react";
import { Field, Input, Select, Toggle } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import { FEATURED_LABELS, isFeaturedNow, withinFeaturedWindow } from "@/lib/featured";
import { cn } from "@/lib/utils";

/**
 * "Show this one off" — the owner's side of merchandising.
 *
 * Inside the product dialog beside the serving hours and the suggestions,
 * because all three answer questions about the same dish and an owner deciding
 * to push it is already looking at it.
 *
 * Everything below the switch is hidden until the switch is on. A dish nobody
 * is promoting has no badge, no order and no window, and showing four inert
 * controls on every product would make the dialog look like configuration
 * rather than a menu.
 */

/** The editor's draft. Times are `"YYYY-MM-DDTHH:mm"`, as the inputs hold them. */
export interface FeaturedDraft {
  isFeatured: boolean;
  featuredOrder: number;
  featuredLabel: string;
  featuredLabelText: string;
  featuredFrom: string;
  featuredUntil: string;
}

export function FeaturedEditor({
  draft,
  onChange,
  /** Whether the dish can currently be ordered at all. */
  isAvailable,
}: {
  draft: FeaturedDraft;
  onChange: (patch: Partial<FeaturedDraft>) => void;
  isAvailable: boolean;
}) {
  const { t } = useI18n();
  const f = t.featured;

  /*
    What the owner would see on the menu right now.

    Computed with the same functions the public menu uses, so this cannot claim
    a dish is showing when it is not. Parsing the inputs as local time is
    correct enough for a status line an owner reads while typing — the value
    that gets *stored* is parsed in the venue's zone server-side.
  */
  const status = React.useMemo(() => {
    if (!draft.isFeatured) return null;
    if (!isAvailable) return "unavailable" as const;

    const from = draft.featuredFrom ? new Date(draft.featuredFrom) : null;
    const until = draft.featuredUntil ? new Date(draft.featuredUntil) : null;
    const config = {
      isFeatured: true,
      featuredFrom: from && !Number.isNaN(from.getTime()) ? from : null,
      featuredUntil: until && !Number.isNaN(until.getTime()) ? until : null,
    };

    const now = new Date();
    if (isFeaturedNow({ ...config, isAvailable: true }, now)) return "active" as const;
    if (!withinFeaturedWindow(config, now)) {
      return config.featuredFrom && now.getTime() < config.featuredFrom.getTime()
        ? ("later" as const)
        : ("expired" as const);
    }
    return "active" as const;
  }, [draft, isAvailable]);

  return (
    <div className="rounded-[var(--radius-sm)] border border-ink-200 p-3.5">
      <div>
        <p className="text-sm font-semibold text-ink-800">{f.title}</p>
        <p className="mt-0.5 text-xs text-ink-500">{f.hint}</p>
      </div>

      <div className="mt-3">
        <Toggle
          checked={draft.isFeatured}
          onChange={(v) => onChange({ isFeatured: v })}
          label={f.markFeatured}
        />
      </div>

      {draft.isFeatured && (
        <>
          {/* Stated plainly, because "I ticked the box and nothing happened" is
              the whole failure mode of a feature with a window and an
              availability rule behind it. */}
          {status && (
            <p
              className={cn(
                "mt-3 text-xs font-semibold",
                status === "active" ? "text-emerald-700" : "text-amber-700",
              )}
            >
              {status === "active"
                ? f.activeNow
                : status === "later"
                  ? f.scheduledLater
                  : status === "expired"
                    ? f.expired
                    : f.notAvailable}
            </p>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={f.label} htmlFor="f-label">
              <Select
                id="f-label"
                value={draft.featuredLabel}
                onChange={(e) => onChange({ featuredLabel: e.target.value })}
              >
                <option value="">{f.labelNone}</option>
                {FEATURED_LABELS.filter((key) => key !== "custom").map((key) => (
                  <option key={key} value={key}>
                    {t.featuredLabels[key]}
                  </option>
                ))}
                <option value="custom">{f.labelCustom}</option>
              </Select>
            </Field>

            {draft.featuredLabel === "custom" && (
              <Field label={f.customText} htmlFor="f-label-text">
                <Input
                  id="f-label-text"
                  // Matches MAX_CUSTOM_LABEL_LENGTH; the server refuses longer.
                  maxLength={20}
                  value={draft.featuredLabelText}
                  onChange={(e) => onChange({ featuredLabelText: e.target.value })}
                  placeholder="ویژه آخر هفته"
                />
              </Field>
            )}

            <Field label={f.order} hint={f.orderHint} htmlFor="f-order">
              <Input
                id="f-order"
                type="number"
                min={0}
                max={9999}
                value={draft.featuredOrder}
                onChange={(e) =>
                  onChange({ featuredOrder: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </Field>
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-sm font-semibold text-ink-800">{f.window}</p>
            <p className="mb-2 text-xs text-ink-500">{f.windowHint}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={f.from} htmlFor="f-from">
                {/* dir="ltr": a date-time reads left to right even on an RTL
                    page, the same reason the serving-hours inputs do. */}
                <Input
                  id="f-from"
                  type="datetime-local"
                  dir="ltr"
                  value={draft.featuredFrom}
                  onChange={(e) => onChange({ featuredFrom: e.target.value })}
                />
              </Field>
              <Field label={f.until} htmlFor="f-until">
                <Input
                  id="f-until"
                  type="datetime-local"
                  dir="ltr"
                  value={draft.featuredUntil}
                  onChange={(e) => onChange({ featuredUntil: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
