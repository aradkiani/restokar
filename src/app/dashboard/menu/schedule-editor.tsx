"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Toggle } from "@/components/ui/field";
import { useI18n } from "@/components/i18n-provider";
import {
  MAX_SCHEDULE_WINDOWS,
  WEEK_ORDER,
  formatTimeOfDay,
  parseTimeOfDay,
  resolveAvailability,
  type ScheduleWindow,
} from "@/lib/availability";
import { zonedMoment } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Opening hours, as a restaurant owner sets them.
 *
 * Shared by the product and the category dialog rather than written twice: the
 * two schedules mean different things but are edited identically, and a second
 * copy would be the one that stopped matching the server's rules.
 *
 * The editor deals in `"HH:MM"` strings because that is what a time input
 * produces and what an owner reads. Conversion to the minutes the API stores
 * happens at the edges, through the same `parseTimeOfDay` the server validates
 * with.
 */

/** One row of the editor. Times are `"HH:MM"`, as the inputs hold them. */
export interface ScheduleRow {
  dayOfWeek: number;
  start: string;
  end: string;
}

/**
 * A time input cannot represent 24:00, so an owner closing at midnight picks
 * 00:00. The API takes "24:00" for the end of a day and normalises 00:00 to it
 * anyway; sending the explicit form keeps the intent visible on the wire.
 */
function toWireEnd(value: string): string {
  return parseTimeOfDay(value) === 0 ? "24:00" : value;
}

/** The reverse, so a stored end-of-day comes back into the input as 00:00. */
export function endMinuteToInput(minute: number): string {
  return minute >= 1440 ? "00:00" : formatTimeOfDay(minute);
}

/** Stored windows as editor rows. */
export function windowsToRows(
  windows: readonly { dayOfWeek: number; startMinute: number; endMinute: number }[],
): ScheduleRow[] {
  return windows.map((window) => ({
    dayOfWeek: window.dayOfWeek,
    start: formatTimeOfDay(window.startMinute),
    end: endMinuteToInput(window.endMinute),
  }));
}

/** Rows as the API wants them. */
export function rowsToPayload(rows: ScheduleRow[]) {
  return rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    start: row.start,
    end: toWireEnd(row.end),
  }));
}

/** Rows as the pure availability rules want them, for the live preview. */
function rowsToWindows(rows: ScheduleRow[]): ScheduleWindow[] {
  return rows.flatMap((row) => {
    const startMinute = parseTimeOfDay(row.start);
    const endRaw = parseTimeOfDay(toWireEnd(row.end));
    if (startMinute === null || endRaw === null || startMinute === endRaw) return [];
    return [{ dayOfWeek: row.dayOfWeek, startMinute, endMinute: endRaw }];
  });
}

export function ScheduleEditor({
  enabled,
  rows,
  onEnabledChange,
  onRowsChange,
  /** Named in the empty-state copy so the owner knows what they are scheduling. */
  scope,
}: {
  enabled: boolean;
  rows: ScheduleRow[];
  onEnabledChange: (value: boolean) => void;
  onRowsChange: (rows: ScheduleRow[]) => void;
  scope: "product" | "category";
}) {
  const { t } = useI18n();
  const s = t.schedule;

  const dayNames = s.days;

  /*
    Whether the schedule would be open right now.

    Read in the venue's timezone rather than the browser's, so an owner
    checking their menu from abroad sees what their guests in Tehran see.
    Recomputed on each render, which is often enough for a dialog and avoids a
    timer the dialog would have to tear down.
  */
  const preview = React.useMemo(() => {
    const windows = rowsToWindows(rows);
    if (windows.length === 0) return null;

    return resolveAvailability(
      { isAvailable: true, product: { scheduleEnabled: enabled, windows } },
      zonedMoment(),
    ).available;
  }, [rows, enabled]);

  function update(index: number, patch: Partial<ScheduleRow>) {
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    // Copies the previous row's hours: a venue setting the same times across
    // several days is the common case, and retyping them is the tedious part.
    const previous = rows[rows.length - 1];
    onRowsChange([
      ...rows,
      {
        dayOfWeek: previous?.dayOfWeek ?? WEEK_ORDER[0],
        start: previous?.start ?? "09:00",
        end: previous?.end ?? "17:00",
      },
    ]);
  }

  /** Repeats the first row across the whole week — "every day, 07:00–12:00". */
  function applyToEveryDay() {
    const first = rows[0];
    if (!first) return;
    onRowsChange(
      WEEK_ORDER.map((dayOfWeek) => ({ dayOfWeek, start: first.start, end: first.end })),
    );
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-ink-200 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink-800">{s.title}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {scope === "category" ? s.categoryHint : s.productHint}
          </p>
        </div>

        {/* Only meaningful once there is something to suspend. */}
        {rows.length > 0 && (
          <Toggle checked={enabled} onChange={onEnabledChange} label={s.enabled} />
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-ink-500">{s.emptyHint}</p>
      ) : (
        <>
          {/* Status is worth stating plainly: an owner who has just built a
              schedule wants to know whether it is open now, and "open" versus
              "closed" is the whole question the rules answer. */}
          {preview !== null && (
            <p
              className={cn(
                "mt-3 text-xs font-semibold",
                !enabled
                  ? "text-ink-500"
                  : preview
                    ? "text-emerald-700"
                    : "text-amber-700",
              )}
            >
              {!enabled ? s.suspended : preview ? s.openNow : s.closedNow}
            </p>
          )}

          <ul className="mt-2.5 space-y-2">
            {rows.map((row, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label={s.day}
                  className="h-10 w-auto min-w-28 flex-1"
                  value={row.dayOfWeek}
                  onChange={(e) => update(index, { dayOfWeek: Number(e.target.value) })}
                >
                  {WEEK_ORDER.map((day) => (
                    <option key={day} value={day}>
                      {dayNames[day]}
                    </option>
                  ))}
                </Select>

                {/* dir="ltr" on the time inputs: a clock reads left-to-right
                    even on an RTL page, and letting them flip puts the minutes
                    before the hours. */}
                <input
                  type="time"
                  dir="ltr"
                  aria-label={s.start}
                  value={row.start}
                  onChange={(e) => update(index, { start: e.target.value })}
                  className="tap-safe h-10 rounded-[var(--radius-xs)] border border-ink-200 bg-white px-2 text-sm text-ink-800"
                />
                <span className="text-xs text-ink-500">{s.to}</span>
                <input
                  type="time"
                  dir="ltr"
                  aria-label={s.end}
                  value={row.end}
                  onChange={(e) => update(index, { end: e.target.value })}
                  className="tap-safe h-10 rounded-[var(--radius-xs)] border border-ink-200 bg-white px-2 text-sm text-ink-800"
                />

                <button
                  type="button"
                  onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}
                  aria-label={s.remove}
                  className="tap-safe grid size-9 place-items-center rounded-[var(--radius-xs)] text-ink-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>

          {/* An overnight window is legitimate but looks like a mistake, so it
              is explained where it happens rather than left to be discovered. */}
          {rows.some((row) => {
            const start = parseTimeOfDay(row.start);
            const end = parseTimeOfDay(toWireEnd(row.end));
            return start !== null && end !== null && end < start;
          }) && <p className="mt-2 text-xs text-ink-500">{s.overnightHint}</p>}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addRow}
          disabled={rows.length >= MAX_SCHEDULE_WINDOWS}
        >
          <Plus className="size-4" />
          {s.addWindow}
        </Button>

        {rows.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={applyToEveryDay}>
            {s.everyDay}
          </Button>
        )}
      </div>
    </div>
  );
}
