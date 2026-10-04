"use client";

import * as React from "react";
import { useI18n } from "@/components/i18n-provider";
import { Select } from "@/components/ui/field";
import { formatQuantity } from "@/lib/inventory";
import { localizeDigits } from "@/lib/format";
import { compatibleUnits, isUnitCode, type UnitCode } from "@/lib/units";

/** An item as the inventory forms need it: what it is and what this site holds. */
export interface StockItemOption {
  id: string;
  name: string;
  unit: string;
  isActive: boolean;
  quantityMilli: number;
  unitCost: number | null;
}

/** "2.5 کیلوگرم", with the reader's digits and unit name. */
export function useQuantityLabel() {
  const { t, locale } = useI18n();
  return React.useCallback(
    (milli: number, unit: string) =>
      `${localizeDigits(formatQuantity(milli), locale)} ${
        t.costing.units[unit as keyof typeof t.costing.units] ?? unit
      }`,
    [t, locale],
  );
}

/** The units an amount of this item may be typed in. */
export function UnitPicker({
  itemUnit,
  value,
  onChange,
  id,
  className,
}: {
  itemUnit: string;
  value: string;
  onChange: (unit: UnitCode) => void;
  id?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const base: UnitCode = isUnitCode(itemUnit) ? itemUnit : "piece";
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as UnitCode)}
      className={className}
      aria-label={t.stock.unit}
    >
      {compatibleUnits(base).map((unit) => (
        <option key={unit} value={unit}>
          {t.costing.units[unit as keyof typeof t.costing.units] ?? unit}
        </option>
      ))}
    </Select>
  );
}

/** Today in the browser's calendar, as a date input wants it. */
export function todayInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * A chosen calendar day as an instant to store: midday Tehran, so the day
 * cannot slide across midnight in any zone. Today is left to the server's
 * own clock, which records the real moment.
 */
export function dayToInstant(day: string): string | undefined {
  if (!day || day === todayInput()) return undefined;
  return `${day}T12:00:00+03:30`;
}
