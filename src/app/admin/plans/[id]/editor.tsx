"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, History, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea, Toggle } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client-api";
import {
  describeChange,
  diffPlan,
  touchesLimits,
  touchesPrice,
  type PlanState,
} from "@/lib/plan-edit";
import type { PlanFeature } from "@/lib/plan-features";

const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});
const faNumber = (n: number) => n.toLocaleString("fa-IR");

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface VersionRow {
  version: number;
  createdAt: string;
  createdBy: string | null;
  data: PlanState;
}

/**
 * One plan's editor. Saving shows exactly what changes (old → new) and who it
 * reaches before anything is written; the server re-checks everything.
 */
export function PlanEditor({
  planId,
  code,
  isContractPriced,
  version: initialVersion,
  initial,
  builtIn,
  versions,
  subscribers,
}: {
  planId: string;
  code: string;
  isContractPriced: boolean;
  version: number;
  initial: PlanState;
  builtIn: PlanFeature[];
  versions: VersionRow[];
  subscribers: number;
}) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = React.useState<PlanState>(initial);
  const [base, setBase] = React.useState<PlanState>(initial);
  const [version, setVersion] = React.useState(initialVersion);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirming, setConfirming] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [promoOn, setPromoOn] = React.useState(
    initial.promoMonthlyPrice !== null || initial.promoYearlyPrice !== null,
  );

  const changes = diffPlan(base, form);
  const dirty = changes.length > 0;

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof PlanState>(key: K, value: PlanState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    setSaving(true);
    setErrors({});
    const result = await api.patch<{ version: number }>(`/api/admin/plans/${planId}`, {
      ...form,
      expectedVersion: version,
    });
    setSaving(false);
    setConfirming(false);
    if (!result.ok) {
      setErrors(result.error.details ?? {});
      toast.error(
        result.error.code === "VALIDATION_ERROR"
          ? "بعضی از فیلدها نیاز به اصلاح دارند."
          : result.error.message,
      );
      return;
    }
    setVersion(result.data.version);
    setBase(form);
    toast.success("پلن ذخیره شد.");
    router.refresh();
  }

  function loadVersion(row: VersionRow) {
    setForm(row.data);
    setPromoOn(row.data.promoMonthlyPrice !== null || row.data.promoYearlyPrice !== null);
    toast.success(
      `مقادیر نسخهٔ ${faNumber(row.version)} در فرم قرار گرفت. برای اعمال، «ذخیره» را بزنید.`,
    );
  }

  const features = form.features;

  return (
    <div className="space-y-5 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/plans"
            className="inline-flex items-center gap-1 text-xs font-bold text-ink-500 hover:text-ink-800"
          >
            <ArrowRight className="size-3.5 ltr:rotate-180" />
            پلن‌ها
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-ink-900">
            {base.name}
            <span className="text-sm font-semibold text-ink-400" dir="ltr">
              {code}
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            {faNumber(subscribers)} مشترک فعلی روی این پلن
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isContractPriced && (
            <Badge tone="info">قیمت قراردادی؛ خرید آنلاین ندارد</Badge>
          )}
          {dirty && <Badge tone="warning">تغییرات ذخیره‌نشده</Badge>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>نام و توضیح</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="نام" error={errors.name} htmlFor="plan-name">
                <Input
                  id="plan-name"
                  value={form.name}
                  maxLength={40}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label="نام انگلیسی" error={errors.nameEn} htmlFor="plan-name-en">
                <Input
                  id="plan-name-en"
                  dir="ltr"
                  value={form.nameEn}
                  maxLength={40}
                  onChange={(e) => set("nameEn", e.target.value)}
                />
              </Field>
              <Field label="توضیح" error={errors.description} htmlFor="plan-desc">
                <Textarea
                  id="plan-desc"
                  rows={2}
                  value={form.description ?? ""}
                  maxLength={200}
                  onChange={(e) => set("description", e.target.value || null)}
                />
              </Field>
              <Field
                label="توضیح انگلیسی"
                error={errors.descriptionEn}
                htmlFor="plan-desc-en"
              >
                <Textarea
                  id="plan-desc-en"
                  dir="ltr"
                  rows={2}
                  value={form.descriptionEn ?? ""}
                  maxLength={200}
                  onChange={(e) => set("descriptionEn", e.target.value || null)}
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>قیمت (تومان)</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ماهانه" error={errors.monthlyPrice} htmlFor="plan-monthly">
                  <MoneyInput
                    id="plan-monthly"
                    value={form.monthlyPrice}
                    onValueChange={(value) => set("monthlyPrice", value ?? 0)}
                  />
                </Field>
                <Field label="سالانه" error={errors.yearlyPrice} htmlFor="plan-yearly">
                  <MoneyInput
                    id="plan-yearly"
                    value={form.yearlyPrice}
                    onValueChange={(value) => set("yearlyPrice", value ?? 0)}
                  />
                </Field>
              </div>

              <Toggle
                checked={promoOn}
                onChange={(on) => {
                  setPromoOn(on);
                  if (!on) {
                    setForm((current) => ({
                      ...current,
                      promoMonthlyPrice: null,
                      promoYearlyPrice: null,
                      promoStartsAt: null,
                      promoEndsAt: null,
                    }));
                  }
                }}
                label="قیمت تخفیفی"
                description="روی کارت‌ها قیمت عادی خط می‌خورد و قیمت تخفیفی دریافت می‌شود. بدون تاریخ یعنی از همین حالا تا وقتی خاموشش کنید."
              />
              {promoOn && (
                <div className="grid gap-4 rounded-[var(--radius-md)] border border-ink-200 bg-ink-50/50 p-4 sm:grid-cols-2">
                  <Field
                    label="ماهانهٔ تخفیفی"
                    error={errors.promoMonthlyPrice}
                    htmlFor="plan-promo-monthly"
                  >
                    <MoneyInput
                      id="plan-promo-monthly"
                      value={form.promoMonthlyPrice}
                      onValueChange={(value) => set("promoMonthlyPrice", value)}
                    />
                  </Field>
                  <Field
                    label="سالانهٔ تخفیفی"
                    error={errors.promoYearlyPrice}
                    htmlFor="plan-promo-yearly"
                  >
                    <MoneyInput
                      id="plan-promo-yearly"
                      value={form.promoYearlyPrice}
                      onValueChange={(value) => set("promoYearlyPrice", value)}
                    />
                  </Field>
                  <DateField
                    id="plan-promo-start"
                    label="شروع"
                    value={form.promoStartsAt}
                    error={errors.promoStartsAt}
                    onChange={(value) => set("promoStartsAt", value)}
                  />
                  <DateField
                    id="plan-promo-end"
                    label="پایان"
                    value={form.promoEndsAt}
                    error={errors.promoEndsAt}
                    onChange={(value) => set("promoEndsAt", value)}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>محدودیت‌ها و امکانات</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <LimitField
                  id="plan-tables"
                  label="میز"
                  value={form.maxTables}
                  error={errors.maxTables}
                  onChange={(value) => set("maxTables", value)}
                />
                <LimitField
                  id="plan-views"
                  label="بازدید منو در روز"
                  value={form.maxDailyViews}
                  error={errors.maxDailyViews}
                  onChange={(value) => set("maxDailyViews", value)}
                />
                <LimitField
                  id="plan-products"
                  label="محصول"
                  value={form.maxProducts}
                  error={errors.maxProducts}
                  onChange={(value) => set("maxProducts", value)}
                />
                <LimitField
                  id="plan-categories"
                  label="دسته‌بندی"
                  value={form.maxCategories}
                  error={errors.maxCategories}
                  onChange={(value) => set("maxCategories", value)}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle
                  checked={form.allowsOnlinePay}
                  onChange={(v) => set("allowsOnlinePay", v)}
                  label="پرداخت آنلاین سفارش‌ها"
                />
                <Toggle
                  checked={form.allowsAnalytics}
                  onChange={(v) => set("allowsAnalytics", v)}
                  label="گزارش‌ها"
                />
                <Toggle
                  checked={form.allowsBranches}
                  onChange={(v) => set("allowsBranches", v)}
                  label="شعبه‌ها"
                />
                <Toggle
                  checked={form.allowsCustomDomain}
                  onChange={(v) => set("allowsCustomDomain", v)}
                  label="دامنهٔ اختصاصی"
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>نمایش</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <Toggle
                checked={form.isPublic}
                onChange={(v) => {
                  set("isPublic", v);
                  if (!v) set("isRecommended", false);
                }}
                label="در صفحهٔ تعرفه‌ها نمایش داده شود و قابل خرید باشد"
                description="خاموش کردن، پلن را از فروش برمی‌دارد؛ مشترکان فعلی آن دست نمی‌خورند."
              />
              <Toggle
                checked={form.isRecommended}
                onChange={(v) => set("isRecommended", v)}
                disabled={!form.isPublic}
                label="برچسب «پیشنهاد ما»"
                description="فقط یک پلن این برچسب را دارد؛ روشن کردنش آن را از پلن دیگر برمی‌دارد."
              />
              {errors.isRecommended && (
                <p role="alert" className="text-xs font-medium text-red-600">
                  {errors.isRecommended}
                </p>
              )}
              <Field
                label="ترتیب نمایش"
                hint="عدد کمتر، جلوتر"
                error={errors.sortOrder}
                htmlFor="plan-sort"
                className="max-w-40"
              >
                <Input
                  id="plan-sort"
                  type="number"
                  dir="ltr"
                  min={0}
                  max={1000}
                  value={form.sortOrder}
                  onChange={(e) => set("sortOrder", Number(e.target.value) || 0)}
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>فهرست امکانات روی کارت</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-xs leading-6 text-ink-500">
                فقط متن نمایشی است؛ آنچه پلن واقعاً اجازه می‌دهد از بخش «محدودیت‌ها و
                امکانات» می‌آید. سقف میز و بازدید همیشه بالای این فهرست نشان داده می‌شود.
              </p>
              <Toggle
                checked={features === null}
                onChange={(useDefault) => set("features", useDefault ? null : builtIn)}
                label="فهرست پیش‌فرض"
              />
              {features === null ? (
                <ul className="list-inside list-disc space-y-1 text-sm text-ink-600">
                  {builtIn.map((item) => (
                    <li key={item.fa}>{item.fa}</li>
                  ))}
                  {builtIn.length === 0 && <li>(خالی)</li>}
                </ul>
              ) : (
                <div className="space-y-2">
                  {errors.features && (
                    <p role="alert" className="text-xs font-medium text-red-600">
                      {errors.features}
                    </p>
                  )}
                  {features.map((item, index) => {
                    const update = (patch: Partial<PlanFeature>) =>
                      set(
                        "features",
                        features.map((f, i) => (i === index ? { ...f, ...patch } : f)),
                      );
                    const move = (to: number) => {
                      const next = [...features];
                      const [moved] = next.splice(index, 1);
                      next.splice(to, 0, moved!);
                      set("features", next);
                    };
                    return (
                      <div
                        key={index}
                        className="grid gap-2 rounded-[var(--radius-md)] border border-ink-200 p-3 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <Field error={errors[`features.${index}.fa`]}>
                          <Input
                            aria-label={`مورد ${faNumber(index + 1)} فارسی`}
                            value={item.fa}
                            maxLength={80}
                            onChange={(e) => update({ fa: e.target.value })}
                          />
                        </Field>
                        <Field error={errors[`features.${index}.en`]}>
                          <Input
                            aria-label={`مورد ${faNumber(index + 1)} انگلیسی`}
                            dir="ltr"
                            placeholder="English (optional)"
                            value={item.en}
                            maxLength={80}
                            onChange={(e) => update({ en: e.target.value })}
                          />
                        </Field>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="بالاتر"
                            disabled={index === 0}
                            onClick={() => move(index - 1)}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="پایین‌تر"
                            disabled={index === features.length - 1}
                            onClick={() => move(index + 1)}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="حذف"
                            onClick={() =>
                              set(
                                "features",
                                features.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <Trash2 className="size-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={features.length >= 12}
                    onClick={() => set("features", [...features, { fa: "", en: "" }])}
                  >
                    <Plus className="size-4" />
                    افزودن مورد
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>چه کسانی را تغییر می‌دهد؟</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-xs leading-6 text-ink-600">
              <p>
                قیمت و محدودیت جدید از همین لحظه برای خریدها و تمدیدهای بعدی اعمال می‌شود.
              </p>
              <p>
                مشترکان فعلی ({faNumber(subscribers)}) تا پایان دورهٔ پرداخت‌شده‌شان همان
                قیمت و محدودیتی را دارند که خریده‌اند.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4" />
                تاریخچه
              </CardTitle>
            </CardHeader>
            <CardBody>
              {versions.length === 0 ? (
                <p className="text-sm text-ink-500">هنوز ویرایشی ثبت نشده است.</p>
              ) : (
                <ul className="space-y-3">
                  {versions.map((row) => (
                    <li
                      key={row.version}
                      className="flex items-start justify-between gap-2 border-b border-ink-100 pb-3 text-xs leading-6 text-ink-600 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-bold text-ink-900">
                          {row.version === 0
                            ? "پیش از اولین ویرایش"
                            : `نسخهٔ ${faNumber(row.version)}`}
                        </p>
                        <p>{dateTime.format(new Date(row.createdAt))}</p>
                        {row.createdBy && <p>{row.createdBy}</p>}
                        <p>{faNumber(row.data.monthlyPrice)} تومان ماهانه</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => loadVersion(row)}>
                        بارگذاری
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-5 py-3">
          <Button onClick={() => setConfirming(true)} disabled={!dirty}>
            ذخیره
          </Button>
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setForm(base);
                setPromoOn(
                  base.promoMonthlyPrice !== null || base.promoYearlyPrice !== null,
                );
                setErrors({});
              }}
            >
              <X className="size-4" />
              برگرداندن تغییرات
            </Button>
          )}
          <a
            href="/pricing"
            target="_blank"
            rel="noopener"
            className="ms-auto text-sm font-bold text-brand-700 hover:underline"
          >
            صفحهٔ تعرفه‌ها
          </a>
        </div>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="md"
        title="ذخیرهٔ تغییرات پلن؟"
      >
        <div className="space-y-4">
          <ul className="space-y-1.5 text-sm text-ink-800">
            {changes.map((change) => (
              <li
                key={change.field}
                className="rounded-[var(--radius-sm)] bg-ink-50 px-3 py-2"
              >
                {describeChange(change)}
              </li>
            ))}
          </ul>
          {touchesPrice(changes) && (
            <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-900">
              قیمت جدید از همین حالا روی صفحهٔ تعرفه‌ها و برای هر خرید یا تمدید بعدی اعمال
              می‌شود. مشترکان فعلی تا پایان دورهٔ پرداخت‌شده‌شان چیزی پرداخت نمی‌کنند.
            </p>
          )}
          {touchesLimits(changes) && (
            <p className="rounded-[var(--radius-md)] border border-ink-200 bg-ink-50 px-4 py-3 text-sm leading-7 text-ink-700">
              محدودیت‌های جدید برای {faNumber(subscribers)} مشترک فعلی از تمدید بعدی‌شان
              اعمال می‌شود؛ مشترکان تازه از همین حالا.
            </p>
          )}
          <div className="flex justify-end gap-2.5">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              انصراف
            </Button>
            <Button loading={saving} onClick={save}>
              تأیید و ذخیره
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function LimitField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  error?: string;
  onChange: (value: number) => void;
}) {
  const unlimited = value < 0;
  return (
    <Field label={label} error={error} htmlFor={id}>
      <div className="flex items-center gap-3">
        <Input
          id={id}
          type="number"
          dir="ltr"
          min={0}
          className="max-w-32"
          disabled={unlimited}
          value={unlimited ? "" : value}
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => onChange(e.target.checked ? -1 : 0)}
            className="size-4 accent-brand-600"
          />
          نامحدود
        </label>
      </div>
    </Field>
  );
}

function DateField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  error?: string;
  onChange: (value: string | null) => void;
}) {
  const local = toLocalInput(value);
  return (
    <Field label={label} error={error} htmlFor={id}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          type="datetime-local"
          dir="ltr"
          className="max-w-56"
          value={local}
          onChange={(e) =>
            onChange(e.target.value ? new Date(e.target.value).toISOString() : null)
          }
        />
        {value && (
          <span className="text-xs text-ink-500">{dateTime.format(new Date(value))}</span>
        )}
      </div>
    </Field>
  );
}
