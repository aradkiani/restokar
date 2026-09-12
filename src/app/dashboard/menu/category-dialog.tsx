"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Toggle } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/components/icon";
import { ImageUploader } from "@/components/image-uploader";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { ScheduleEditor, rowsToPayload, type ScheduleRow } from "./schedule-editor";

export interface CategoryDraft {
  id: string | null;
  name: string;
  nameEn: string;
  icon: string;
  iconUrl: string;
  isActive: boolean;
  scheduleEnabled: boolean;
  schedule: ScheduleRow[];
}

export function CategoryDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: CategoryDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = React.useState(draft);
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      name: form.name,
      nameEn: form.nameEn || undefined,
      icon: form.icon || undefined,
      // Sent as "" rather than omitted when cleared, so removing a custom icon
      // actually clears the column instead of leaving the old one in place.
      iconUrl: form.iconUrl,
      isActive: form.isActive,
      scheduleEnabled: form.scheduleEnabled,
      schedule: rowsToPayload(form.schedule),
    };

    const result = form.id
      ? await api.patch(`/api/categories/${form.id}`, payload)
      : await api.post("/api/categories", payload);

    setSaving(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    toast.success(t.common.saved);
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? t.menuBuilder.editCategory : t.menuBuilder.addCategory}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.menuBuilder.categoryName} htmlFor="cat-name">
          <Input
            id="cat-name"
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="برگرها"
          />
        </Field>

        <Field
          label={t.menuBuilder.categoryNameEn}
          hint={t.common.optional}
          htmlFor="cat-name-en"
        >
          <Input
            id="cat-name-en"
            dir="ltr"
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            placeholder="Burgers"
          />
        </Field>

        {/* A venue whose category has no good match in the built-in set can
            upload its own mark. Uploading wins over the picker below, which
            stays available so clearing the upload restores the chosen icon. */}
        <div>
          <ImageUploader
            label={t.menuBuilder.customIcon}
            value={form.iconUrl}
            onChange={(url) => setForm({ ...form, iconUrl: url })}
          />
          <p className="mt-1.5 text-xs text-ink-500">{t.menuBuilder.customIconHint}</p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-800">
            {t.menuBuilder.categoryIcon}
          </p>
          <div
            className={cn(
              "grid max-h-44 grid-cols-8 gap-1.5 overflow-y-auto rounded-[var(--radius-sm)] border border-ink-200 p-2",
              form.iconUrl && "opacity-50",
            )}
          >
            {CATEGORY_ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setForm({ ...form, icon: name })}
                aria-label={name}
                aria-pressed={form.icon === name}
                className={cn(
                  "grid aspect-square place-items-center rounded-[var(--radius-xs)] transition-colors",
                  form.icon === name
                    ? "bg-brand-600 text-white"
                    : "text-ink-500 hover:bg-ink-100 hover:text-ink-800",
                )}
              >
                <CategoryIcon name={name} className="size-4.5" />
              </button>
            ))}
          </div>
        </div>

        <Toggle
          checked={form.isActive}
          onChange={(v) => setForm({ ...form, isActive: v })}
          label={t.common.active}
        />

        {/* Sits with the category's own switches: closing a category for part
            of the day is the same kind of decision as switching it off. */}
        <ScheduleEditor
          scope="category"
          enabled={form.scheduleEnabled}
          rows={form.schedule}
          onEnabledChange={(v) => setForm({ ...form, scheduleEnabled: v })}
          onRowsChange={(schedule) => setForm({ ...form, schedule })}
        />

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" loading={saving}>
            {t.common.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
