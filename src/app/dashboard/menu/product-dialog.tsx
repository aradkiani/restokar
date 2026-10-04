"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { ImageUploader } from "@/components/image-uploader";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/components/icon";
import { api } from "@/lib/client-api";
import { parseAmount } from "@/lib/format";
import {
  DISH_TAGS,
  DISH_TAG_ICONS,
  normaliseDishTags,
  type DishTag,
} from "@/lib/dish-tags";
import type { Locale } from "@/lib/i18n";
import { PriceHealthNote, type MenuPricing } from "./price-health";
import type { CategoryRow, ProductRow } from "./builder";
import { ScheduleEditor, rowsToPayload, type ScheduleRow } from "./schedule-editor";
import {
  RecommendationEditor,
  recommendationsToPayload,
  type RecommendationRow,
} from "./recommendation-editor";
import { BundleEditor, bundleItemsToPayload, type BundleItemRow } from "./bundle-editor";
import { FeaturedEditor } from "./featured-editor";

export interface InfoSectionDraft {
  title: string;
  content: string;
  titleEn: string;
  contentEn: string;
  icon: string;
}

export interface OptionChoiceDraft {
  name: string;
  nameEn: string;
  priceDelta: number;
  costDelta: number;
  isAvailable: boolean;
}

export interface OptionGroupDraft {
  name: string;
  nameEn: string;
  isRequired: boolean;
  maxSelect: number;
  /** This group is the dish's size ladder, offerable as a one-tap upgrade. */
  isUpgrade: boolean;
  choices: OptionChoiceDraft[];
}

export interface ProductDraft {
  id: string | null;
  categoryId: string;
  name: string;
  nameEn: string;
  shortDescription: string;
  fullDescription: string;
  shortDescriptionEn: string;
  fullDescriptionEn: string;
  /** The owner's line above this dish's pairings; empty falls back. */
  pairingNote: string;
  pairingNoteEn: string;
  imageUrl: string;
  price: number;
  /** The stored exact price. 0 for a dish not yet saved. */
  priceExact: number;
  compareAtPrice: number | null;
  costPrice: number;
  /** The cost comes from the recipe and is not typed here. */
  costFromRecipe: boolean;
  prepMinutes: number | null;
  dietaryTags: DishTag[];
  isAvailable: boolean;
  hideWhenUnavailable: boolean;
  isFeatured: boolean;
  scheduleEnabled: boolean;
  schedule: ScheduleRow[];
  recommendations: RecommendationRow[];
  /** What this dish contains, when the owner has made it a meal deal. */
  bundleItems: BundleItemRow[];
  featuredOrder: number;
  featuredLabel: string;
  featuredLabelText: string;
  featuredFrom: string;
  featuredUntil: string;
  infoSections: InfoSectionDraft[];
  optionGroups: OptionGroupDraft[];
}

/** The brief specifies three owner-defined information blocks per product. */
const MAX_INFO_SECTIONS = 3;

/** Matches the server bound in OptionGroupSchema. */
const MAX_OPTION_GROUPS = 6;

/** A new group starts with two blank choices: one option is not a choice. */
function emptyChoice(): OptionChoiceDraft {
  return { name: "", nameEn: "", priceDelta: 0, costDelta: 0, isAvailable: true };
}

export function ProductDialog({
  draft,
  categories,
  allProducts,
  locale,
  shortOnly = false,
  pricing,
  onClose,
  onSaved,
}: {
  draft: ProductDraft;
  /** The venue's display step and margin floor, for the price warnings. */
  pricing: MenuPricing;
  categories: CategoryRow[];
  /** The venue's whole menu, so suggestions can point anywhere in it. */
  allProducts: ProductRow[];
  locale: Locale;
  /** Venue is on a template that only ever shows the short description. */
  shortOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = React.useState(draft);
  const [saving, setSaving] = React.useState(false);

  function setField<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateGroup(index: number, patch: Partial<OptionGroupDraft>) {
    setForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.map((group, i) =>
        i === index ? { ...group, ...patch } : group,
      ),
    }));
  }

  function updateChoice(
    groupIndex: number,
    choiceIndex: number,
    patch: Partial<OptionChoiceDraft>,
  ) {
    setForm((prev) => ({
      ...prev,
      optionGroups: prev.optionGroups.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              choices: group.choices.map((choice, ci) =>
                ci === choiceIndex ? { ...choice, ...patch } : choice,
              ),
            }
          : group,
      ),
    }));
  }

  function updateSection(index: number, patch: Partial<InfoSectionDraft>) {
    setForm((prev) => ({
      ...prev,
      infoSections: prev.infoSections.map((section, i) =>
        i === index ? { ...section, ...patch } : section,
      ),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const payload = {
      categoryId: form.categoryId,
      name: form.name,
      nameEn: form.nameEn || undefined,
      shortDescription: form.shortDescription || undefined,
      fullDescription: form.fullDescription || undefined,
      shortDescriptionEn: form.shortDescriptionEn || undefined,
      fullDescriptionEn: form.fullDescriptionEn || undefined,
      imageUrl: form.imageUrl || undefined,
      price: form.price,
      compareAtPrice: form.compareAtPrice,
      // A recipe-costed dish takes its cost from the recipe; the server
      // ignores a typed one, and not sending it keeps the request honest.
      costPrice: form.costFromRecipe ? undefined : form.costPrice,
      prepMinutes: form.prepMinutes,
      dietaryTags: form.dietaryTags,
      isAvailable: form.isAvailable,
      hideWhenUnavailable: form.hideWhenUnavailable,
      isFeatured: form.isFeatured,
      scheduleEnabled: form.scheduleEnabled,
      schedule: rowsToPayload(form.schedule),
      recommendations: recommendationsToPayload(form.recommendations),
      bundleItems: bundleItemsToPayload(form.bundleItems),
      // Empty means "use the platform's phrase"; the route maps it to null.
      pairingNote: form.pairingNote,
      pairingNoteEn: form.pairingNoteEn,
      featuredOrder: form.featuredOrder,
      // Empty means "no badge" / "no boundary"; the schema maps both to null.
      featuredLabel: form.featuredLabel,
      featuredLabelText: form.featuredLabelText,
      featuredFrom: form.featuredFrom,
      featuredUntil: form.featuredUntil,
      // Blank rows are dropped rather than rejected — an owner who opened a
      // section and changed their mind should not hit a validation error.
      infoSections: form.infoSections
        .filter((section) => section.title.trim() && section.content.trim())
        .map((section) => ({
          title: section.title.trim(),
          content: section.content.trim(),
          titleEn: section.titleEn.trim() || undefined,
          contentEn: section.contentEn.trim() || undefined,
          icon: section.icon || undefined,
        })),
      // Half-filled groups are dropped rather than rejected: an owner who
      // opened a group, thought better of it and moved on should still be able
      // to save the product.
      optionGroups: form.optionGroups
        .filter(
          (group) =>
            group.name.trim() && group.choices.some((choice) => choice.name.trim()),
        )
        .map((group) => {
          const choices = group.choices
            .filter((choice) => choice.name.trim())
            .map((choice) => ({
              name: choice.name.trim(),
              nameEn: choice.nameEn.trim() || undefined,
              priceDelta: choice.priceDelta,
              costDelta: choice.costDelta,
              isAvailable: choice.isAvailable,
            }));

          return {
            name: group.name.trim(),
            nameEn: group.nameEn.trim() || undefined,
            isRequired: group.isRequired,
            minSelect: group.isRequired ? 1 : 0,
            // Clamped to what actually exists — the server rejects a group
            // demanding more picks than it offers, and blank rows were just
            // removed above.
            maxSelect: Math.min(Math.max(1, group.maxSelect), choices.length),
            /*
              Cleared whenever the group is not single-select.

              The server refuses the combination outright, so sending it would
              turn a stale toggle into a save failure the owner cannot explain.
              Clamping here means raising "how many can they pick?" quietly
              stops the group being an upgrade ladder, which is the only
              coherent reading of that edit.
            */
            isUpgrade:
              group.isUpgrade &&
              Math.min(Math.max(1, group.maxSelect), choices.length) === 1,
            choices,
          };
        }),
    };

    const result = form.id
      ? await api.patch(`/api/products/${form.id}`, payload)
      : await api.post("/api/products", payload);

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
      title={form.id ? t.menuBuilder.editProduct : t.menuBuilder.addProduct}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.menuBuilder.productName} htmlFor="p-name">
            <Input
              id="p-name"
              required
              autoFocus
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="چیزبرگر ویژه"
            />
          </Field>

          <Field
            label={t.menuBuilder.productNameEn}
            hint={t.common.optional}
            htmlFor="p-name-en"
          >
            <Input
              id="p-name-en"
              dir="ltr"
              value={form.nameEn}
              onChange={(e) => setField("nameEn", e.target.value)}
              placeholder="Special Cheeseburger"
            />
          </Field>
        </div>

        <Field label={t.menuBuilder.category} htmlFor="p-category">
          <Select
            id="p-category"
            value={form.categoryId}
            onChange={(e) => setField("categoryId", e.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t.menuBuilder.shortDescription}
            hint={t.menuBuilder.shortDescriptionHint}
            htmlFor="p-short"
          >
            <Input
              id="p-short"
              maxLength={160}
              value={form.shortDescription}
              onChange={(e) => setField("shortDescription", e.target.value)}
            />
          </Field>

          <Field
            label={t.menuBuilder.shortDescriptionEn}
            hint={t.common.optional}
            htmlFor="p-short-en"
          >
            <Input
              id="p-short-en"
              dir="ltr"
              maxLength={160}
              value={form.shortDescriptionEn}
              onChange={(e) => setField("shortDescriptionEn", e.target.value)}
            />
          </Field>
        </div>

        {shortOnly ? (
          <p className="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 px-3 py-2.5 text-xs leading-6 text-ink-600">
            {t.menuBuilder.shortOnlyNotice}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.menuBuilder.fullDescription}
              hint={t.menuBuilder.fullDescriptionHint}
              htmlFor="p-full"
            >
              <Textarea
                id="p-full"
                rows={3}
                maxLength={2000}
                value={form.fullDescription}
                onChange={(e) => setField("fullDescription", e.target.value)}
              />
            </Field>

            <Field
              label={t.menuBuilder.fullDescriptionEn}
              hint={t.common.optional}
              htmlFor="p-full-en"
            >
              <Textarea
                id="p-full-en"
                dir="ltr"
                rows={3}
                maxLength={2000}
                value={form.fullDescriptionEn}
                onChange={(e) => setField("fullDescriptionEn", e.target.value)}
              />
            </Field>
          </div>
        )}

        <ImageUploader
          label={t.menuBuilder.image}
          value={form.imageUrl}
          onChange={(url) => setField("imageUrl", url)}
        />

        {/* ------------------------------------------------------- pricing */}
        <fieldset className="rounded-[var(--radius-md)] border border-ink-200 p-4">
          <legend className="px-1.5 text-sm font-bold text-ink-800">
            {t.menuBuilder.price}
          </legend>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.menuBuilder.price} htmlFor="p-price">
              <MoneyInput
                id="p-price"
                required
                value={form.price}
                onValueChange={(amount) => setField("price", amount ?? 0)}
              />
            </Field>

            <Field
              label={t.menuBuilder.compareAtPrice}
              hint={t.common.optional}
              htmlFor="p-compare"
            >
              <MoneyInput
                id="p-compare"
                value={form.compareAtPrice}
                onValueChange={(amount) =>
                  setField("compareAtPrice", amount && amount > 0 ? amount : null)
                }
              />
            </Field>

            <Field
              label={t.menuBuilder.costPrice}
              hint={
                form.costFromRecipe
                  ? t.costing.costFromRecipeHint
                  : t.menuBuilder.costPriceHint
              }
              htmlFor="p-cost"
            >
              {/* Read-only when the recipe decides it: the figure is
                  recomputed whenever an ingredient's price or the recipe
                  changes, so a typed one would only be overwritten. */}
              <MoneyInput
                id="p-cost"
                readOnly={form.costFromRecipe}
                aria-describedby={form.costFromRecipe ? "p-cost-source" : undefined}
                value={form.costPrice}
                onValueChange={(amount) => setField("costPrice", amount ?? 0)}
                placeholder=""
                className={form.costFromRecipe ? "bg-ink-50 text-ink-600" : undefined}
              />
              {form.costFromRecipe && (
                <span
                  id="p-cost-source"
                  className="mt-1 block text-[11px] font-semibold text-emerald-700"
                >
                  {t.costing.costFromRecipe}
                </span>
              )}
            </Field>
          </div>

          <PriceHealthNote
            price={form.price}
            cost={form.costPrice}
            exactPrice={draft.id ? draft.priceExact : null}
            priceTouched={form.price !== draft.price}
            pricing={pricing}
            locale={locale}
          />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.menuBuilder.prepTime} hint={t.common.optional} htmlFor="p-prep">
            <Input
              id="p-prep"
              inputMode="numeric"
              value={form.prepMinutes ?? ""}
              onChange={(e) => {
                const minutes = parseAmount(e.target.value);
                setField("prepMinutes", minutes > 0 ? minutes : null);
              }}
            />
          </Field>

          <div className="flex flex-col justify-end gap-2 pb-1">
            <Toggle
              checked={form.isAvailable}
              onChange={(v) => setField("isAvailable", v)}
              label={t.menuBuilder.available}
            />
            <Toggle
              checked={form.isFeatured}
              onChange={(v) => setField("isFeatured", v)}
              label={t.menuBuilder.featured}
            />
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-bold text-ink-800">{t.dishTags.title}</legend>
          <p className="mt-1 text-xs text-ink-500">{t.dishTags.hint}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DISH_TAGS.map((tag) => {
              const on = form.dietaryTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setField(
                      "dietaryTags",
                      on
                        ? form.dietaryTags.filter((x) => x !== tag)
                        : normaliseDishTags([...form.dietaryTags, tag]),
                    )
                  }
                  className={
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors " +
                    (on
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-surface text-ink-600 hover:border-ink-300")
                  }
                >
                  <span aria-hidden>{DISH_TAG_ICONS[tag]}</span>
                  {t.dishTags.labels[tag]}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/*
          Shown while the product is unavailable — and now also whenever it has
          opening hours, because those make it unavailable for part of every
          day. Without the second condition an owner who schedules a dish can
          never reach the switch that decides what guests see while it is off.
        */}
        {(!form.isAvailable || form.schedule.length > 0) && (
          <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3">
            <Toggle
              checked={form.hideWhenUnavailable}
              onChange={(v) => setField("hideWhenUnavailable", v)}
              label={t.menuBuilder.hideWhenUnavailable}
              description={
                form.hideWhenUnavailable
                  ? t.menuBuilder.hideWhenUnavailableOn
                  : t.menuBuilder.hideWhenUnavailableOff
              }
            />
          </div>
        )}

        {/* Beside the availability switches, which is what an owner is already
            thinking about when they come to set hours. */}
        <ScheduleEditor
          scope="product"
          enabled={form.scheduleEnabled}
          rows={form.schedule}
          onEnabledChange={(v) => setField("scheduleEnabled", v)}
          onRowsChange={(schedule) => setField("schedule", schedule)}
        />

        {/* Directly after the hours, because both answer "when and with what is
            this dish sold?" and an owner setting one often wants the other. */}
        {/* Merchandising sits with the availability switches and the
            suggestions: all three describe how this dish is sold. */}
        <FeaturedEditor
          draft={form}
          isAvailable={form.isAvailable}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        />

        <RecommendationEditor
          rows={form.recommendations}
          onRowsChange={(recommendations) => setField("recommendations", recommendations)}
          allProducts={allProducts}
          currentProductId={form.id}
          locale={locale}
          pairingNote={form.pairingNote}
          onPairingNoteChange={(value) => setField("pairingNote", value)}
          pairingNoteEn={form.pairingNoteEn}
          onPairingNoteEnChange={(value) => setField("pairingNoteEn", value)}
        />

        {/* A meal deal is a product that lists other products, so its contents
            belong with the other things that describe how this dish is sold. */}
        <BundleEditor
          rows={form.bundleItems}
          onRowsChange={(bundleItems) => setField("bundleItems", bundleItems)}
          allProducts={allProducts}
          currentProductId={form.id}
          price={form.price}
          locale={locale}
        />

        {/*
          Info panels and option groups are hidden entirely on a
          short-description-only template. They are not disabled-but-visible:
          a greyed-out field an owner can never use is a worse answer than a
          field that is simply not part of this template.
        */}
        {!shortOnly && (
          <>
            {/* ------------------------------------------- info sections (≤ 3) */}
            <fieldset className="rounded-[var(--radius-md)] border border-ink-200 p-4">
              <legend className="px-1.5 text-sm font-bold text-ink-800">
                {t.menuBuilder.infoSections}
              </legend>
              <p className="mb-3 text-xs text-ink-500">
                {t.menuBuilder.infoSectionsHint}
              </p>

              <div className="space-y-3">
                {form.infoSections.map((section, index) => (
                  <div
                    key={index}
                    className="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Select
                        aria-label={t.menuBuilder.categoryIcon}
                        value={section.icon}
                        onChange={(e) => updateSection(index, { icon: e.target.value })}
                        className="!h-9 w-28 shrink-0 text-xs"
                      >
                        <option value="">—</option>
                        {CATEGORY_ICON_NAMES.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </Select>

                      <Input
                        aria-label={t.menuBuilder.infoTitle}
                        placeholder={t.menuBuilder.infoTitle}
                        value={section.title}
                        onChange={(e) => updateSection(index, { title: e.target.value })}
                        className="!h-9 flex-1 text-sm"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            infoSections: prev.infoSections.filter((_, i) => i !== index),
                          }))
                        }
                        aria-label={t.common.delete}
                        className="grid size-9 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-surface hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <Textarea
                      aria-label={t.menuBuilder.infoContent}
                      placeholder={t.menuBuilder.infoContent}
                      rows={2}
                      value={section.content}
                      onChange={(e) => updateSection(index, { content: e.target.value })}
                      className="mt-2 !min-h-16 text-sm"
                    />

                    <Input
                      dir="ltr"
                      aria-label={t.menuBuilder.infoTitleEn}
                      placeholder={t.menuBuilder.infoTitleEn}
                      value={section.titleEn}
                      onChange={(e) => updateSection(index, { titleEn: e.target.value })}
                      className="mt-2 !h-9 text-sm"
                    />

                    <Textarea
                      dir="ltr"
                      aria-label={t.menuBuilder.infoContentEn}
                      placeholder={t.menuBuilder.infoContentEn}
                      rows={2}
                      value={section.contentEn}
                      onChange={(e) =>
                        updateSection(index, { contentEn: e.target.value })
                      }
                      className="mt-2 !min-h-16 text-sm"
                    />

                    {section.icon && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
                        <CategoryIcon name={section.icon} className="size-3.5" />
                        {t.common.preview}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {form.infoSections.length < MAX_INFO_SECTIONS && (
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      infoSections: [
                        ...prev.infoSections,
                        { title: "", content: "", titleEn: "", contentEn: "", icon: "" },
                      ],
                    }))
                  }
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-ink-300 px-3 text-xs font-bold text-ink-600 hover:border-brand-400 hover:text-brand-700"
                >
                  <Plus className="size-3.5" />
                  {t.menuBuilder.addInfoSection}
                </button>
              )}
            </fieldset>

            {/* ------------------------------------------------- option groups */}
            <fieldset className="rounded-[var(--radius-md)] border border-ink-200 p-4">
              <legend className="px-1.5 text-sm font-bold text-ink-800">
                {t.menuBuilder.optionGroups}
              </legend>
              <p className="mb-3 text-xs leading-6 text-ink-500">
                {t.menuBuilder.optionGroupsHint}
              </p>

              <div className="space-y-4">
                {form.optionGroups.map((group, groupIndex) => (
                  <div
                    key={groupIndex}
                    className="rounded-[var(--radius-sm)] border border-ink-200 bg-ink-50 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <Input
                          aria-label={t.menuBuilder.optionGroupName}
                          placeholder={t.menuBuilder.optionGroupNamePlaceholder}
                          value={group.name}
                          onChange={(e) =>
                            updateGroup(groupIndex, { name: e.target.value })
                          }
                          className="!h-9 text-sm"
                        />
                        <Input
                          dir="ltr"
                          aria-label={t.menuBuilder.optionGroupNameEn}
                          placeholder={t.menuBuilder.optionGroupNameEn}
                          value={group.nameEn}
                          onChange={(e) =>
                            updateGroup(groupIndex, { nameEn: e.target.value })
                          }
                          className="!h-9 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            optionGroups: prev.optionGroups.filter(
                              (_, i) => i !== groupIndex,
                            ),
                          }))
                        }
                        aria-label={t.common.delete}
                        className="grid size-9 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-surface hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {/* Optional groups are where menus get unwieldy: an owner adds
                    six extras to one dish, and guests scroll a form instead of
                    reading a menu. Separate products are usually the better
                    shape, so the advice appears exactly when the choice is
                    being made. */}
                    {!group.isRequired && (
                      <p className="mt-2.5 rounded-[var(--radius-xs)] bg-amber-50 p-2.5 text-[11px] leading-6 text-amber-900">
                        {t.menuBuilder.optionalGroupAdvice}
                      </p>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-4">
                      <Toggle
                        checked={group.isRequired}
                        onChange={(v) => updateGroup(groupIndex, { isRequired: v })}
                        label={t.menuBuilder.optionRequired}
                      />
                      <label className="flex items-center gap-2 text-xs font-semibold text-ink-700">
                        {t.menuBuilder.optionMaxSelect}
                        <Input
                          type="number"
                          min={1}
                          max={Math.max(1, group.choices.length)}
                          value={group.maxSelect}
                          onChange={(e) =>
                            updateGroup(groupIndex, {
                              maxSelect: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="!h-9 !w-20 text-sm"
                        />
                      </label>

                      {/*
                        Offered only on a single-select group, because that is
                        the only shape an upgrade can take — in a multi-select
                        group the choices accumulate, so "make it large" would
                        add a second size rather than replace the first.

                        Hidden rather than disabled: a greyed-out control an
                        owner can never reach from here is a worse answer than
                        one that appears when it becomes relevant, which is the
                        same rule the info panels follow above.
                      */}
                      {group.maxSelect === 1 && group.choices.length > 1 && (
                        <Toggle
                          checked={group.isUpgrade}
                          onChange={(v) => updateGroup(groupIndex, { isUpgrade: v })}
                          label={t.menuBuilder.optionIsUpgrade}
                        />
                      )}
                    </div>

                    {group.isUpgrade && group.maxSelect === 1 && (
                      <p className="mt-2.5 rounded-[var(--radius-xs)] bg-surface p-2.5 text-[11px] leading-6 text-ink-600">
                        {t.menuBuilder.optionIsUpgradeHint}
                      </p>
                    )}

                    <div className="mt-3 space-y-2">
                      {group.choices.map((choice, choiceIndex) => (
                        <div key={choiceIndex} className="flex items-center gap-2">
                          <Input
                            aria-label={t.menuBuilder.optionChoiceName}
                            placeholder={t.menuBuilder.optionChoiceNamePlaceholder}
                            value={choice.name}
                            onChange={(e) =>
                              updateChoice(groupIndex, choiceIndex, {
                                name: e.target.value,
                              })
                            }
                            className="!h-9 min-w-0 flex-1 text-sm"
                          />
                          <Input
                            dir="ltr"
                            aria-label={t.menuBuilder.optionChoiceNameEn}
                            placeholder="English"
                            value={choice.nameEn}
                            onChange={(e) =>
                              updateChoice(groupIndex, choiceIndex, {
                                nameEn: e.target.value,
                              })
                            }
                            className="!h-9 w-28 shrink-0 text-sm"
                          />
                          <MoneyInput
                            allowNegative
                            aria-label={t.menuBuilder.optionPriceDelta}
                            title={t.menuBuilder.optionPriceDelta}
                            value={choice.priceDelta}
                            onValueChange={(amount) =>
                              updateChoice(groupIndex, choiceIndex, {
                                priceDelta: amount ?? 0,
                              })
                            }
                            className="!h-9 w-28 shrink-0 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                optionGroups: prev.optionGroups.map((g, i) =>
                                  i === groupIndex
                                    ? {
                                        ...g,
                                        choices: g.choices.filter(
                                          (_, ci) => ci !== choiceIndex,
                                        ),
                                      }
                                    : g,
                                ),
                              }))
                            }
                            aria-label={t.common.delete}
                            className="grid size-9 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-surface hover:text-red-600"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          optionGroups: prev.optionGroups.map((g, i) =>
                            i === groupIndex
                              ? { ...g, choices: [...g.choices, emptyChoice()] }
                              : g,
                          ),
                        }))
                      }
                      className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-ink-300 px-3 text-xs font-bold text-ink-600 hover:border-brand-400 hover:text-brand-700"
                    >
                      <Plus className="size-3.5" />
                      {t.menuBuilder.addOptionChoice}
                    </button>
                  </div>
                ))}
              </div>

              {form.optionGroups.length < MAX_OPTION_GROUPS && (
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      optionGroups: [
                        ...prev.optionGroups,
                        {
                          name: "",
                          nameEn: "",
                          isRequired: true,
                          maxSelect: 1,
                          isUpgrade: false,
                          choices: [emptyChoice(), emptyChoice()],
                        },
                      ],
                    }))
                  }
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-ink-300 px-3 text-xs font-bold text-ink-600 hover:border-brand-400 hover:text-brand-700"
                >
                  <Plus className="size-3.5" />
                  {t.menuBuilder.addOptionGroup}
                </button>
              )}
            </fieldset>
          </>
        )}

        <div className="flex justify-end gap-2.5">
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
