"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Pencil,
  Plus,
  Star,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Badge, EmptyState } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { CategoryIcon } from "@/components/icon";
import { api } from "@/lib/client-api";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { CategoryDialog, type CategoryDraft } from "./category-dialog";
import { ProductDialog, type ProductDraft } from "./product-dialog";
import { windowsToRows } from "./schedule-editor";
import { recommendationsToRows } from "./recommendation-editor";
import { zonedWallClockOf } from "@/lib/time";

/**
 * A stored instant as the editor's `datetime-local` input wants it.
 *
 * Read in the venue's timezone rather than the browser's, so an owner
 * checking a weekend special from abroad sees the hours their guests will.
 */
function toLocalInput(value: string | null): string {
  return value ? zonedWallClockOf(new Date(value)) : "";
}

/** Stored opening hours, as both list endpoints return them. */
export interface ScheduleWindowRow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  nameEn: string | null;
  icon: string | null;
  iconUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  scheduleEnabled: boolean;
  availabilityWindows: ScheduleWindowRow[];
}

export interface ProductRow {
  id: string;
  categoryId: string;
  name: string;
  nameEn: string | null;
  shortDescription: string | null;
  fullDescription: string | null;
  shortDescriptionEn: string | null;
  fullDescriptionEn: string | null;
  /** The owner's line above this dish's pairings on the public menu. */
  pairingNote: string | null;
  pairingNoteEn: string | null;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  costPrice: number;
  prepMinutes: number | null;
  isAvailable: boolean;
  hideWhenUnavailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  scheduleEnabled: boolean;
  availabilityWindows: ScheduleWindowRow[];
  /** Suggestions made when this dish is ordered, in the owner's order. */
  recommendations: { recommendedProductId: string; isActive: boolean }[];
  featuredOrder: number;
  featuredLabel: string | null;
  featuredLabelText: string | null;
  /** ISO strings — the page serialises the columns for the client. */
  featuredFrom: string | null;
  featuredUntil: string | null;
  infoSections: {
    title: string;
    content: string;
    titleEn: string | null;
    contentEn: string | null;
    icon: string | null;
  }[];
  optionGroups: {
    name: string;
    nameEn: string | null;
    isRequired: boolean;
    maxSelect: number;
    choices: {
      name: string;
      nameEn: string | null;
      priceDelta: number;
      costDelta: number;
      isAvailable: boolean;
    }[];
  }[];
}

export function MenuBuilder({
  locale,
  initialCategories,
  initialProducts,
  limits,
  shortOnly = false,
}: {
  locale: Locale;
  /** Venue is on a template that only shows a product's short description. */
  shortOnly?: boolean;
  initialCategories: CategoryRow[];
  initialProducts: ProductRow[];
  limits: { maxProducts: number; maxCategories: number };
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [categories, setCategories] = React.useState(initialCategories);
  const [products, setProducts] = React.useState(initialProducts);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(
    initialCategories[0]?.id ?? null,
  );

  const [categoryDialog, setCategoryDialog] = React.useState<CategoryDraft | null>(null);
  const [productDialog, setProductDialog] = React.useState<ProductDraft | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<{
    kind: "category" | "product";
    id: string;
  } | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Keep the server copy authoritative after every mutation.
  React.useEffect(() => setCategories(initialCategories), [initialCategories]);
  React.useEffect(() => setProducts(initialProducts), [initialProducts]);

  /**
   * Moves a category one place up or down the rail.
   *
   * Buttons rather than drag-and-drop, deliberately. The panel is used on a
   * phone behind a counter as often as on a laptop, and HTML5 drag events do
   * not fire from touch at all — a drag handle would be dead on the device
   * this is most used from. Two arrows work by pointer, by finger and by
   * keyboard, and need no library.
   *
   * The list is reordered locally first and the whole arrangement is sent, so
   * the rail responds immediately and the server is told what the owner is
   * actually looking at rather than being asked to infer it. A failure puts the
   * previous order straight back.
   */
  async function moveCategory(categoryId: string, direction: -1 | 1) {
    const from = categories.findIndex((category) => category.id === categoryId);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= categories.length) return;

    const previous = categories;
    const next = [...categories];
    // Swap rather than splice: one step is a swap, and writing it as one keeps
    // the two positions that changed obvious.
    [next[from], next[to]] = [next[to]!, next[from]!];
    setCategories(next);

    const result = await api.patch("/api/categories", {
      order: next.map((category) => category.id),
    });

    if (!result.ok) {
      setCategories(previous);
      toast.error(result.error.message);
      return;
    }

    // Re-read, so the rail agrees with the order everything else will load.
    router.refresh();
  }

  /**
   * The effective selection, derived rather than stored.
   *
   * The selected id can stop existing — the category was deleted, or a server
   * refresh no longer includes it. Correcting that in an effect meant one
   * render still used the stale id before the effect fired; deriving it means
   * there is no such frame, and no effect to keep in sync.
   */
  const activeCategoryId =
    selectedCategoryId && categories.some((c) => c.id === selectedCategoryId)
      ? selectedCategoryId
      : (categories[0]?.id ?? null);

  const visibleProducts = products.filter((p) => p.categoryId === activeCategoryId);

  const atCategoryLimit =
    limits.maxCategories >= 0 && categories.length >= limits.maxCategories;
  const atProductLimit = limits.maxProducts >= 0 && products.length >= limits.maxProducts;

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);

    const url =
      pendingDelete.kind === "category"
        ? `/api/categories/${pendingDelete.id}`
        : `/api/products/${pendingDelete.id}`;

    const result = await api.del(url);
    setDeleting(false);
    setPendingDelete(null);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    toast.success(t.common.saved);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t.dashboard.menu}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {formatNumber(products.length, locale)} {t.dashboard.products}
            {limits.maxProducts >= 0 && ` / ${formatNumber(limits.maxProducts, locale)}`}
          </p>
        </div>

        {/* Both labels are long in Persian; side by side they exceed a 320px
            screen, so they wrap rather than widening the page. */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setCategoryDialog({
                id: null,
                name: "",
                nameEn: "",
                icon: "utensils",
                iconUrl: "",
                isActive: true,
                scheduleEnabled: true,
                schedule: [],
              })
            }
            disabled={atCategoryLimit}
          >
            <Plus className="size-4" />
            {t.menuBuilder.addCategory}
          </Button>
          <Button
            onClick={() =>
              activeCategoryId &&
              setProductDialog({
                id: null,
                categoryId: activeCategoryId,
                name: "",
                nameEn: "",
                shortDescription: "",
                fullDescription: "",
                shortDescriptionEn: "",
                fullDescriptionEn: "",
                pairingNote: "",
                pairingNoteEn: "",
                imageUrl: "",
                price: 0,
                compareAtPrice: null,
                costPrice: 0,
                prepMinutes: null,
                isAvailable: true,
                hideWhenUnavailable: false,
                isFeatured: false,
                scheduleEnabled: true,
                schedule: [],
                recommendations: [],
                featuredOrder: 0,
                featuredLabel: "",
                featuredLabelText: "",
                featuredFrom: "",
                featuredUntil: "",
                infoSections: [],
                optionGroups: [],
              })
            }
            disabled={!activeCategoryId || atProductLimit}
          >
            <Plus className="size-4" />
            {t.menuBuilder.addProduct}
          </Button>
        </div>
      </header>

      {(atCategoryLimit || atProductLimit) && (
        <p className="rounded-[var(--radius-md)] bg-amber-50 p-3.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
          {t.errors.limitReached} — {t.errors.limitReachedHint}
        </p>
      )}

      {categories.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UtensilsCrossed className="size-6" />}
            title={t.menuBuilder.noCategories}
            description={t.menuBuilder.noCategoriesHint}
            action={
              <Button
                onClick={() =>
                  setCategoryDialog({
                    id: null,
                    name: "",
                    nameEn: "",
                    icon: "utensils",
                    iconUrl: "",
                    isActive: true,
                    scheduleEnabled: true,
                    schedule: [],
                  })
                }
              >
                <Plus className="size-4" />
                {t.menuBuilder.addCategory}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          {/* ------------------------------------------------ category rail */}
          <nav aria-label={t.dashboard.categories} className="space-y-1.5">
            {categories.map((category, index) => {
              const count = products.filter((p) => p.categoryId === category.id).length;
              const active = category.id === activeCategoryId;
              const first = index === 0;
              const last = index === categories.length - 1;

              return (
                <div
                  key={category.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-[var(--radius-md)] border transition-colors",
                    active
                      ? "border-brand-300 bg-brand-50"
                      : "border-ink-200 bg-surface hover:border-ink-300",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId(category.id)}
                    aria-current={active ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2.5 p-3 text-start"
                  >
                    <CategoryIcon
                      name={category.icon}
                      url={category.iconUrl}
                      className={cn(
                        "size-4.5 shrink-0",
                        active ? "text-brand-700" : "text-ink-400",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink-900">
                        {category.name}
                      </span>
                      <span className="block text-[11px] text-ink-500">
                        {formatNumber(count, locale)} {t.dashboard.products}
                      </span>
                    </span>
                    {!category.isActive && (
                      <Badge tone="neutral">{t.common.inactive}</Badge>
                    )}
                  </button>

                  {/*
                    Reordering, kept in its own column beside the edit/delete
                    pair so the two kinds of action do not read as one stack of
                    four. Hidden when there is only one category, where there is
                    no order to change.

                    Up and down are physical directions on the screen and stay
                    up and down in RTL — unlike start/end, these are not
                    logical properties and must not be flipped.
                  */}
                  {categories.length > 1 && (
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => moveCategory(category.id, -1)}
                        disabled={first}
                        aria-label={`${t.menuBuilder.moveUp} — ${category.name}`}
                        className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-surface hover:text-ink-800 disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCategory(category.id, 1)}
                        disabled={last}
                        aria-label={`${t.menuBuilder.moveDown} — ${category.name}`}
                        className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-surface hover:text-ink-800 disabled:pointer-events-none disabled:opacity-30"
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex shrink-0 flex-col pe-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setCategoryDialog({
                          id: category.id,
                          name: category.name,
                          nameEn: category.nameEn ?? "",
                          icon: category.icon ?? "utensils",
                          iconUrl: category.iconUrl ?? "",
                          isActive: category.isActive,
                          scheduleEnabled: category.scheduleEnabled,
                          schedule: windowsToRows(category.availabilityWindows),
                        })
                      }
                      aria-label={`${t.common.edit} ${category.name}`}
                      className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-surface hover:text-ink-800"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingDelete({ kind: "category", id: category.id })
                      }
                      aria-label={`${t.common.delete} ${category.name}`}
                      className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-surface hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </nav>

          {/* --------------------------------------------------- product grid */}
          <div>
            {visibleProducts.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<UtensilsCrossed className="size-6" />}
                  title={t.menuBuilder.noProducts}
                  action={
                    <Button
                      onClick={() =>
                        activeCategoryId &&
                        setProductDialog({
                          id: null,
                          categoryId: activeCategoryId,
                          name: "",
                          nameEn: "",
                          shortDescription: "",
                          fullDescription: "",
                          shortDescriptionEn: "",
                          fullDescriptionEn: "",
                          pairingNote: "",
                          pairingNoteEn: "",
                          imageUrl: "",
                          price: 0,
                          compareAtPrice: null,
                          costPrice: 0,
                          prepMinutes: null,
                          isAvailable: true,
                          hideWhenUnavailable: false,
                          isFeatured: false,
                          scheduleEnabled: true,
                          schedule: [],
                          recommendations: [],
                          featuredOrder: 0,
                          featuredLabel: "",
                          featuredLabelText: "",
                          featuredFrom: "",
                          featuredUntil: "",
                          infoSections: [],
                          optionGroups: [],
                        })
                      }
                      disabled={atProductLimit}
                    >
                      <Plus className="size-4" />
                      {t.menuBuilder.addProduct}
                    </Button>
                  }
                />
              </Card>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {visibleProducts.map((product) => {
                  const profit = product.price - product.costPrice;
                  const margin = product.price > 0 ? profit / product.price : 0;

                  return (
                    <li
                      key={product.id}
                      className="group relative flex gap-3 rounded-[var(--radius-lg)] border border-ink-200 bg-surface p-3 shadow-[var(--shadow-soft)] transition-all hover:border-ink-300"
                    >
                      <div className="relative size-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-ink-100">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="grid size-full place-items-center text-ink-400">
                            <ImageIcon className="size-6" />
                          </span>
                        )}
                        {product.isFeatured && (
                          <span className="absolute start-1 top-1 grid size-5 place-items-center rounded-full bg-brand-500 text-ink-950">
                            <Star className="size-3 fill-current" />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-bold text-ink-900">
                            {product.name}
                          </p>
                          <div className="flex shrink-0 gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                setProductDialog({
                                  id: product.id,
                                  categoryId: product.categoryId,
                                  name: product.name,
                                  nameEn: product.nameEn ?? "",
                                  shortDescription: product.shortDescription ?? "",
                                  fullDescription: product.fullDescription ?? "",
                                  shortDescriptionEn: product.shortDescriptionEn ?? "",
                                  fullDescriptionEn: product.fullDescriptionEn ?? "",
                                  pairingNote: product.pairingNote ?? "",
                                  pairingNoteEn: product.pairingNoteEn ?? "",
                                  imageUrl: product.imageUrl ?? "",
                                  price: product.price,
                                  compareAtPrice: product.compareAtPrice,
                                  costPrice: product.costPrice,
                                  prepMinutes: product.prepMinutes,
                                  isAvailable: product.isAvailable,
                                  hideWhenUnavailable: product.hideWhenUnavailable,
                                  isFeatured: product.isFeatured,
                                  scheduleEnabled: product.scheduleEnabled,
                                  schedule: windowsToRows(product.availabilityWindows),
                                  recommendations: recommendationsToRows(
                                    product.recommendations,
                                  ),
                                  featuredOrder: product.featuredOrder,
                                  featuredLabel: product.featuredLabel ?? "",
                                  featuredLabelText: product.featuredLabelText ?? "",
                                  featuredFrom: toLocalInput(product.featuredFrom),
                                  featuredUntil: toLocalInput(product.featuredUntil),
                                  infoSections: product.infoSections.map((section) => ({
                                    title: section.title,
                                    content: section.content,
                                    titleEn: section.titleEn ?? "",
                                    contentEn: section.contentEn ?? "",
                                    icon: section.icon ?? "",
                                  })),

                                  optionGroups: product.optionGroups.map((group) => ({
                                    name: group.name,

                                    nameEn: group.nameEn ?? "",

                                    isRequired: group.isRequired,

                                    maxSelect: group.maxSelect,

                                    choices: group.choices.map((choice) => ({
                                      name: choice.name,

                                      nameEn: choice.nameEn ?? "",

                                      priceDelta: choice.priceDelta,

                                      costDelta: choice.costDelta,

                                      isAvailable: choice.isAvailable,
                                    })),
                                  })),
                                })
                              }
                              aria-label={`${t.common.edit} ${product.name}`}
                              className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-800"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingDelete({ kind: "product", id: product.id })
                              }
                              aria-label={`${t.common.delete} ${product.name}`}
                              className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-red-600"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {product.shortDescription && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">
                            {product.shortDescription}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="font-black text-ink-900 tabular-nums">
                            {formatMoney(product.price, locale)}
                          </span>
                          {product.costPrice > 0 && (
                            <span className="text-emerald-700 tabular-nums">
                              {t.menuBuilder.marginPreview}{" "}
                              {formatPercent(margin, locale)}
                            </span>
                          )}
                          {/* Two distinct states worth telling apart at a
                              glance: sold out but still listed, versus sold out
                              and pulled from the menu entirely. */}
                          {!product.isAvailable && (
                            <Badge tone="danger">
                              {product.hideWhenUnavailable
                                ? t.menuBuilder.hiddenFromMenu
                                : t.publicMenu.unavailable}
                            </Badge>
                          )}
                          {product.infoSections.length > 0 && (
                            <span className="text-ink-400">
                              {formatNumber(product.infoSections.length, locale)}{" "}
                              {t.menuBuilder.infoSections}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {categoryDialog && (
        <CategoryDialog
          draft={categoryDialog}
          onClose={() => setCategoryDialog(null)}
          onSaved={() => {
            setCategoryDialog(null);
            router.refresh();
          }}
        />
      )}

      {productDialog && (
        <ProductDialog
          draft={productDialog}
          categories={categories}
          // Every dish the venue sells, so suggestions can be picked from the
          // whole menu rather than only the category being edited. Already in
          // memory here; the dialog does no fetching of its own.
          allProducts={products}
          locale={locale}
          shortOnly={shortOnly}
          onClose={() => setProductDialog(null)}
          onSaved={() => {
            setProductDialog(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        loading={deleting}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title={
          pendingDelete?.kind === "category"
            ? t.menuBuilder.deleteCategoryConfirm
            : t.menuBuilder.deleteProductConfirm
        }
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
      />
    </div>
  );
}
