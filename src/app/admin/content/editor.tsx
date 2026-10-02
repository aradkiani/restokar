"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Eye,
  History,
  ImagePlus,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea, Toggle } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { RichText } from "@/components/rich-text";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { DocumentDef, FieldDef, Localized } from "@/lib/cms/schema";

/**
 * The editor for one public document (a page, or the site settings).
 *
 * Built from the document's field list in src/lib/cms/schema.ts, so adding a
 * field there adds it here. Like the rest of the platform console it is
 * Persian-only; the English tab edits the English *content*.
 *
 * Flow: edit → «ذخیرهٔ پیش‌نویس» (nothing public changes) → «پیش‌نمایش» (the
 * real page, showing the draft, visible only to the admin) → «انتشار». Every
 * publish is a version that can be copied back into the draft from history.
 */

type Values = Record<string, unknown>;
type Lang = "fa" | "en";

export interface EditorState {
  key: string;
  values: Values;
  hasDraft: boolean;
  version: number;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
}

export interface VersionRow {
  version: number;
  publishedAt: string;
  publishedBy: string | null;
  restoredFrom: number | null;
}

const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tehran",
});
const formatWhen = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");
const faNumber = (n: number) => n.toLocaleString("fa-IR");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** An ISO time as the value of a datetime-local input, in the browser's zone. */
function toLocalInput(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyItem(fields: FieldDef[]): Values {
  const item: Values = {};
  for (const field of fields) {
    if ((field.type === "text" || field.type === "textarea") && field.localized) {
      item[field.key] = { fa: "", en: "" };
    } else if (field.type === "boolean") item[field.key] = false;
    else item[field.key] = "";
  }
  return item;
}

export function ContentEditor({
  def,
  initial,
  initialVersions,
}: {
  def: DocumentDef;
  initial: EditorState;
  initialVersions: VersionRow[];
}) {
  const toast = useToast();
  const [values, setValues] = React.useState<Values>(initial.values);
  const [saved, setSaved] = React.useState(() => JSON.stringify(initial.values));
  const [meta, setMeta] = React.useState(initial);
  const [versions, setVersions] = React.useState(initialVersions);
  const [lang, setLang] = React.useState<Lang>("fa");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<null | string>(null);
  const [confirm, setConfirm] = React.useState<null | "publish" | "discard">(null);

  const dirty = JSON.stringify(values) !== saved;
  const hasLocalized = React.useMemo(
    () =>
      def.fields.some(
        (field) =>
          (("localized" in field && field.localized) || field.type === "list") &&
          (field.type !== "list" ||
            field.item.some((item) => "localized" in item && item.localized)),
      ),
    [def],
  );

  // Leaving with unsaved edits asks first.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function applyState(state: EditorState) {
    setMeta(state);
    setValues(state.values);
    setSaved(JSON.stringify(state.values));
  }

  async function save(): Promise<boolean> {
    setBusy("save");
    setErrors({});
    const result = await api.put<EditorState>(`/api/admin/content/${def.key}`, {
      values,
    });
    setBusy(null);
    if (!result.ok) {
      setErrors(result.error.details ?? {});
      toast.error(result.error.message);
      return false;
    }
    applyState(result.data);
    return true;
  }

  async function handleSave() {
    if (await save())
      toast.success("پیش‌نویس ذخیره شد. هنوز چیزی در سایت تغییر نکرده است.");
  }

  async function handlePreview() {
    // Opened before the save so the browser treats it as the click's popup.
    const tab = window.open("about:blank", "_blank");
    if (dirty && !(await save())) {
      tab?.close();
      return;
    }
    const url = `/api/admin/preview?path=${encodeURIComponent(def.previewPath)}`;
    if (tab) tab.location.href = url;
    // Popup blocked: go there in this tab. A full navigation on purpose — the
    // route sets the preview cookie and redirects, which a router push skips.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    else window.location.href = url;
  }

  async function handlePublish() {
    if (dirty && !(await save())) {
      setConfirm(null);
      return;
    }
    setBusy("publish");
    const result = await api.post<{ version: number; state: EditorState }>(
      `/api/admin/content/${def.key}/publish`,
    );
    setBusy(null);
    setConfirm(null);
    if (!result.ok) {
      toast.error(
        result.error.code === "NO_DRAFT"
          ? "تغییری برای انتشار نیست؛ آنچه می‌بینید همان نسخهٔ منتشرشده است."
          : result.error.message,
      );
      return;
    }
    applyState(result.data.state);
    toast.success(`منتشر شد — نسخهٔ ${faNumber(result.data.version)}`);
    const list = await api.get<VersionRow[]>(`/api/admin/content/${def.key}/versions`);
    if (list.ok) setVersions(list.data);
  }

  async function handleDiscard() {
    setBusy("discard");
    const result = await api.del<EditorState>(`/api/admin/content/${def.key}`);
    setBusy(null);
    setConfirm(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    applyState(result.data);
    setErrors({});
    toast.success("پیش‌نویس کنار گذاشته شد.");
  }

  async function handleRestore(version: number) {
    if (dirty && !window.confirm("تغییرات ذخیره‌نشده از بین می‌روند. ادامه می‌دهید؟"))
      return;
    setBusy(`restore-${version}`);
    const result = await api.post<EditorState>(`/api/admin/content/${def.key}/versions`, {
      version,
    });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    applyState(result.data);
    toast.success(
      `نسخهٔ ${faNumber(version)} در پیش‌نویس قرار گرفت. برای نمایش در سایت، «انتشار» را بزنید.`,
    );
  }

  const set = (key: string, value: unknown) =>
    setValues((current) => ({ ...current, [key]: value }));

  const errorCount = Object.keys(errors).length;
  const enErrors = Object.keys(errors).some((path) => path.endsWith(".en"));
  const faErrors = Object.keys(errors).some((path) => path.endsWith(".fa"));

  return (
    <div className="space-y-5 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/content"
            className="inline-flex items-center gap-1 text-xs font-bold text-ink-500 hover:text-ink-800"
          >
            <ArrowRight className="size-3.5 ltr:rotate-180" />
            محتوای سایت
          </Link>
          <h1 className="mt-1 text-2xl font-black text-ink-900">{def.title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-7 text-ink-600">
            {def.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {meta.version > 0 ? (
            <Badge tone="success">نسخهٔ منتشرشده: {faNumber(meta.version)}</Badge>
          ) : (
            <Badge tone="neutral">متن پیش‌فرض سایت</Badge>
          )}
          {(meta.hasDraft || dirty) && (
            <Badge tone="warning">
              {dirty ? "تغییرات ذخیره‌نشده" : "پیش‌نویس منتشرنشده"}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {hasLocalized && (
            <div
              role="tablist"
              aria-label="زبان متن"
              className="inline-flex gap-1 rounded-full bg-ink-100 p-1"
            >
              {(["fa", "en"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={lang === value}
                  onClick={() => setLang(value)}
                  className={cn(
                    "relative min-h-9 rounded-full px-4 text-sm font-bold transition-colors",
                    lang === value
                      ? "bg-surface text-ink-900 shadow-sm"
                      : "text-ink-600 hover:text-ink-900",
                  )}
                >
                  {value === "fa" ? "فارسی" : "English"}
                  {((value === "en" && enErrors) || (value === "fa" && faErrors)) && (
                    <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-red-500" />
                  )}
                </button>
              ))}
            </div>
          )}
          {lang === "en" && (
            <p className="rounded-[var(--radius-md)] border border-ink-200 bg-ink-50 px-4 py-3 text-xs leading-6 text-ink-600">
              هر متن انگلیسی که خالی بماند، در نسخهٔ انگلیسی سایت با متن پیش‌فرض یا فارسی
              نمایش داده می‌شود.
            </p>
          )}

          {errorCount > 0 && (
            <p
              role="alert"
              className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
            >
              {faNumber(errorCount)} فیلد نیاز به اصلاح دارد
              {enErrors && faErrors
                ? " (در هر دو زبان)."
                : enErrors
                  ? " (در زبانهٔ English)."
                  : "."}
            </p>
          )}

          <Card>
            <CardBody className="space-y-5">
              {def.fields.map((field) => (
                <FieldEditor
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  onChange={(value) => set(field.key, value)}
                  path={field.key}
                  lang={lang}
                  errors={errors}
                />
              ))}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>وضعیت</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm text-ink-700">
              <p>
                آخرین انتشار:{" "}
                <span className="font-bold">{formatWhen(meta.publishedAt)}</span>
              </p>
              <p>
                آخرین ذخیرهٔ پیش‌نویس:{" "}
                <span className="font-bold">{formatWhen(meta.draftUpdatedAt)}</span>
              </p>
              <p className="pt-2 text-xs leading-6 text-ink-500">
                «ذخیره» فقط پیش‌نویس را نگه می‌دارد. سایت تنها با «انتشار» تغییر می‌کند و
                همان لحظه به‌روز می‌شود.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-4" />
                نسخه‌های قبلی
              </CardTitle>
            </CardHeader>
            <CardBody>
              {versions.length === 0 ? (
                <p className="text-sm text-ink-500">هنوز نسخه‌ای منتشر نشده است.</p>
              ) : (
                <ul className="space-y-3">
                  {versions.map((row) => (
                    <li
                      key={row.version}
                      className="flex items-start justify-between gap-2 border-b border-ink-100 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="text-xs leading-6 text-ink-600">
                        <p className="text-sm font-bold text-ink-900">
                          نسخهٔ {faNumber(row.version)}
                          {row.version === meta.version && (
                            <span className="ms-1.5 text-xs font-bold text-emerald-700">
                              (فعلی)
                            </span>
                          )}
                        </p>
                        <p>{formatWhen(row.publishedAt)}</p>
                        {row.publishedBy && <p>{row.publishedBy}</p>}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `restore-${row.version}`}
                        onClick={() => handleRestore(row.version)}
                        title="این نسخه را در پیش‌نویس بگذار"
                      >
                        <RotateCcw className="size-4" />
                        بازگردانی
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
          <Button onClick={handleSave} loading={busy === "save"} disabled={!dirty}>
            ذخیرهٔ پیش‌نویس
          </Button>
          <Button variant="outline" onClick={handlePreview} disabled={busy !== null}>
            <Eye className="size-4" />
            پیش‌نمایش
          </Button>
          <Button
            variant="secondary"
            onClick={() => setConfirm("publish")}
            disabled={busy !== null || (!dirty && !meta.hasDraft)}
          >
            <Send className="size-4" />
            انتشار
          </Button>
          {meta.hasDraft && (
            <Button
              variant="ghost"
              onClick={() => setConfirm("discard")}
              disabled={busy !== null}
              className="ms-auto"
            >
              <Trash2 className="size-4" />
              کنار گذاشتن پیش‌نویس
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={confirm === "publish"}
        onClose={() => setConfirm(null)}
        size="sm"
        title="انتشار در سایت؟"
        description={`«${def.title}» با همین متن‌ها برای همهٔ بازدیدکنندگان نمایش داده می‌شود. نسخهٔ فعلی در تاریخچه می‌ماند و می‌توانید برگردید.`}
      >
        <div className="flex justify-end gap-2.5">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            انصراف
          </Button>
          <Button
            variant="secondary"
            loading={busy === "publish" || busy === "save"}
            onClick={handlePublish}
          >
            انتشار
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirm === "discard"}
        onClose={() => setConfirm(null)}
        size="sm"
        title="کنار گذاشتن پیش‌نویس؟"
        description="تغییرات منتشرنشده پاک می‌شوند و ویرایشگر به نسخهٔ منتشرشده برمی‌گردد. سایت تغییری نمی‌کند."
      >
        <div className="flex justify-end gap-2.5">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            انصراف
          </Button>
          <Button variant="danger" loading={busy === "discard"} onClick={handleDiscard}>
            کنار گذاشتن
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ fields

function FieldEditor({
  field,
  value,
  onChange,
  path,
  lang,
  errors,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  lang: Lang;
  errors: Record<string, string>;
}) {
  const id = `field-${path}`;

  switch (field.type) {
    case "text":
    case "textarea":
    case "richtext": {
      if (!field.localized) {
        const text = typeof value === "string" ? value : "";
        return (
          <Field label={field.label} hint={field.hint} error={errors[path]} htmlFor={id}>
            {field.type === "text" ? (
              <Input
                id={id}
                value={text}
                maxLength={field.max}
                onChange={(event) => onChange(event.target.value)}
              />
            ) : (
              <Textarea
                id={id}
                rows={3}
                value={text}
                maxLength={field.max}
                onChange={(event) => onChange(event.target.value)}
              />
            )}
          </Field>
        );
      }
      const localized: Localized = isRecord(value)
        ? { fa: String(value.fa ?? ""), en: String(value.en ?? "") }
        : { fa: "", en: "" };
      const text = localized[lang];
      const update = (next: string) => onChange({ ...localized, [lang]: next });
      const placeholder = lang === "en" ? localized.fa || field.default.en : undefined;
      return (
        <Field
          label={field.label}
          hint={field.hint}
          error={errors[`${path}.${lang}`]}
          htmlFor={id}
        >
          {field.type === "text" ? (
            <Input
              id={id}
              dir={lang === "en" ? "ltr" : "rtl"}
              value={text}
              maxLength={field.max}
              placeholder={placeholder}
              onChange={(event) => update(event.target.value)}
            />
          ) : field.type === "textarea" ? (
            <Textarea
              id={id}
              dir={lang === "en" ? "ltr" : "rtl"}
              rows={3}
              value={text}
              maxLength={field.max}
              placeholder={placeholder}
              onChange={(event) => update(event.target.value)}
            />
          ) : (
            <RichTextInput
              id={id}
              lang={lang}
              value={text}
              max={field.max}
              placeholder={placeholder}
              onChange={update}
            />
          )}
          {field.type !== "richtext" && (
            <p className="mt-1 text-end text-[11px] text-ink-400 tabular-nums">
              {faNumber(text.length)} / {faNumber(field.max)}
            </p>
          )}
        </Field>
      );
    }

    case "url":
    case "phone":
    case "email":
      return (
        <Field label={field.label} hint={field.hint} error={errors[path]} htmlFor={id}>
          <Input
            id={id}
            dir="ltr"
            type={
              field.type === "email" ? "email" : field.type === "phone" ? "tel" : "url"
            }
            value={typeof value === "string" ? value : ""}
            placeholder={
              field.type === "url"
                ? "https://"
                : field.type === "phone"
                  ? "021-12345678"
                  : "name@example.com"
            }
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );

    case "image":
      return (
        <ImageField
          id={id}
          label={field.label}
          hint={field.hint}
          error={errors[path]}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      );

    case "datetime": {
      const local = toLocalInput(value);
      return (
        <Field label={field.label} hint={field.hint} error={errors[path]} htmlFor={id}>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={id}
              type="datetime-local"
              dir="ltr"
              className="max-w-60"
              value={local}
              onChange={(event) =>
                onChange(
                  event.target.value ? new Date(event.target.value).toISOString() : "",
                )
              }
            />
            {local && (
              <>
                <span className="text-xs text-ink-500">
                  {formatWhen(typeof value === "string" ? value : null)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => onChange("")}>
                  <X className="size-4" />
                  پاک کردن
                </Button>
              </>
            )}
          </div>
        </Field>
      );
    }

    case "number":
      return (
        <Field label={field.label} hint={field.hint} error={errors[path]} htmlFor={id}>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            dir="ltr"
            className="max-w-40"
            min={field.min}
            max={field.max}
            value={typeof value === "number" || typeof value === "string" ? value : ""}
            onChange={(event) => {
              const raw = event.target.value;
              const number = Number(raw);
              onChange(raw !== "" && Number.isFinite(number) ? number : raw);
            }}
          />
        </Field>
      );

    case "boolean":
      return (
        <Toggle
          checked={value === true}
          onChange={onChange}
          label={field.label}
          description={field.hint}
        />
      );

    case "list": {
      const items = (Array.isArray(value) ? value : []).filter(isRecord);
      const move = (from: number, to: number) => {
        const next = [...items];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item!);
        onChange(next);
      };
      return (
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold text-ink-800">
            {field.label}
            {field.hint && (
              <span className="ms-1.5 font-normal text-ink-500">({field.hint})</span>
            )}
          </legend>
          {errors[path] && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {errors[path]}
            </p>
          )}
          {items.map((item, index) => (
            <div
              key={index}
              className="space-y-3 rounded-[var(--radius-md)] border border-ink-200 bg-ink-50/50 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-ink-500">
                  مورد {faNumber(index + 1)}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="بالاتر"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="پایین‌تر"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="حذف این مورد"
                    onClick={() => onChange(items.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </div>
              </div>
              {field.item.map((sub) => (
                <FieldEditor
                  key={sub.key}
                  field={sub}
                  value={item[sub.key]}
                  onChange={(next) =>
                    onChange(
                      items.map((current, i) =>
                        i === index ? { ...current, [sub.key]: next } : current,
                      ),
                    )
                  }
                  path={`${path}.${index}.${sub.key}`}
                  lang={lang}
                  errors={errors}
                />
              ))}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={items.length >= field.maxItems}
            onClick={() => onChange([...items, emptyItem(field.item)])}
          >
            <Plus className="size-4" />
            افزودن مورد
          </Button>
        </fieldset>
      );
    }
  }
}

function RichTextInput({
  id,
  lang,
  value,
  max,
  placeholder,
  onChange,
}: {
  id: string;
  lang: Lang;
  value: string;
  max: number;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [showPreview, setShowPreview] = React.useState(false);
  return (
    <div className="space-y-2">
      <Textarea
        id={id}
        dir={lang === "en" ? "ltr" : "rtl"}
        rows={16}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        className="font-mono text-sm leading-7"
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => setShowPreview((v) => !v)}>
          <Eye className="size-4" />
          {showPreview ? "بستن نمای متن" : "نمای متن"}
        </Button>
        <span className="text-[11px] text-ink-400 tabular-nums">
          {faNumber(value.length)} / {faNumber(max)}
        </span>
      </div>
      {showPreview && (
        <div
          dir={lang === "en" ? "ltr" : "rtl"}
          className="rounded-[var(--radius-md)] border border-ink-200 bg-surface p-5"
        >
          <RichText source={value || placeholder || ""} />
        </div>
      )}
    </div>
  );
}

function ImageField({
  id,
  label,
  hint,
  error,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const toast = useToast();
  const [uploading, setUploading] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/admin/upload", { method: "POST", body }).catch(
      () => null,
    );
    const payload = (await response?.json().catch(() => null)) as
      | { ok: true; data: { url: string } }
      | { ok: false; error: { message: string } }
      | null;
    setUploading(false);
    if (!payload) {
      toast.error("ارتباط با سرور برقرار نشد");
      return;
    }
    if (!payload.ok) {
      toast.error(payload.error.message);
      return;
    }
    onChange(payload.data.url);
  }

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-20 w-36 rounded-[var(--radius-sm)] border border-ink-200 object-cover"
          />
        ) : (
          <span className="grid h-20 w-36 place-items-center rounded-[var(--radius-sm)] border border-dashed border-ink-300 text-xs text-ink-400">
            تصویر پیش‌فرض
          </span>
        )}
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
        <Button
          size="sm"
          variant="outline"
          loading={uploading}
          onClick={() => input.current?.click()}
        >
          <ImagePlus className="size-4" />
          {value ? "تصویر دیگر" : "بارگذاری تصویر"}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange("")}>
            <X className="size-4" />
            برداشتن
          </Button>
        )}
      </div>
    </Field>
  );
}
