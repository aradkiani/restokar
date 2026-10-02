"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select, Toggle } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { ImageUploader } from "@/components/image-uploader";
import {
  DEFAULT_DEVICE_PREVIEW,
  buildDesignPreviewUrl,
  getDevicePreview,
} from "@/lib/device-preview";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { FONT_OPTIONS, resolveTheme, themeToCssVars, type Theme } from "@/lib/theme";
import { PALETTES, type Palette } from "@/lib/palettes";
import { TEMPLATES, getTemplateMeta } from "@/templates/registry";
import type { MenuData } from "@/templates/types";
import type { Locale } from "@/lib/i18n";

/**
 * Template picker + theme editor.
 *
 * The preview is the real menu in an iframe, not a mock-up and no longer a
 * simulation of one — the same page, the same code path, its own viewport. What
 * an owner approves here is what ships, and it keeps working when the platform
 * updates a template. See `src/app/design-preview/page.tsx` for why the frame
 * is a document rather than components rendered inline.
 */
export function DesignEditor({
  locale,
  initialTemplateId,
  initialTheme,
  initialShowProductPhotos,
  previewData,
}: {
  locale: Locale;
  initialTemplateId: string;
  initialTheme: Theme;
  initialShowProductPhotos: boolean;
  previewData: MenuData | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [templateId, setTemplateId] = React.useState(initialTemplateId);
  const [theme, setTheme] = React.useState<Theme>(initialTheme);
  const [showProductPhotos, setShowProductPhotos] = React.useState(
    initialShowProductPhotos,
  );
  const [saving, setSaving] = React.useState(false);
  /**
   * One device, rendered at its true width — no state and no scaling, because
   * there is nothing to switch between and nothing to shrink to fit.
   */
  const device = getDevicePreview(DEFAULT_DEVICE_PREVIEW);

  const meta = getTemplateMeta(templateId);
  const resolved = React.useMemo(
    () => resolveTheme(theme, meta.defaultTheme),
    [theme, meta.defaultTheme],
  );

  /**
   * What the frame has to reload for: markup the server renders.
   *
   * Everything else is a CSS custom property and reaches it without one, so
   * this changes on a template switch, the photo toggle and the background
   * image — and not while a colour is being dragged.
   */
  const previewSrc = buildDesignPreviewUrl({
    templateId,
    showProductPhotos,
    backgroundImage: resolved.backgroundImage,
  });

  const frameRef = React.useRef<HTMLIFrameElement>(null);

  /**
   * The theme, written straight into the preview document.
   *
   * The frame is same-origin, so the tokens can be set on its `.menu-scope`
   * root exactly as the server sets them — no message protocol, no reload, and
   * a dragged colour follows the control.
   *
   * Assigned as one `cssText` rather than key by key, because the token *set*
   * changes with the surface style: glass adds `--m-surface-blur` and friends,
   * and setting properties individually would leave those behind when the
   * owner switched back to flat, blurring a surface that should be opaque.
   */
  const cssText = React.useMemo(
    () =>
      Object.entries(themeToCssVars(resolved))
        .map(([token, value]) => `${token}:${value}`)
        .join(";"),
    [resolved],
  );

  const applyTheme = React.useCallback(() => {
    /*
      Written to the frame's root element, not to the menu wrapper inside it.

      `onLoad` fires when the document has loaded, which is *before* React in
      the frame has hydrated, so writing to an element React renders meant
      handing it a style attribute it had not produced — a hydration mismatch
      it declined to patch up. `<html>` is not a node React reconciles here and
      the root layout marks it `suppressHydrationWarning`, so this can land at
      any moment in the frame's lifecycle without racing anything. The preview
      route publishes the same tokens as a `:root` rule, which an inline style
      on the root outranks.
    */
    const root = frameRef.current?.contentDocument?.documentElement;
    if (root) root.style.cssText = cssText;
  }, [cssText]);

  React.useEffect(applyTheme, [applyTheme]);

  function setToken<K extends keyof Theme>(key: K, value: Theme[K]) {
    setTheme((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Applies a scheme's six colour tokens, leaving background image, font and
   * radius alone — those are independent choices the owner has already made.
   */
  function applyPalette(palette: Palette) {
    setTheme((prev) => ({ ...prev, ...palette.theme }));
  }

  /**
   * Switching template clears colour overrides so the new template's own
   * palette is what the owner sees. Keeping stale overrides is the classic way
   * a template switch produces something unusable.
   */
  function switchTemplate(id: string) {
    setTemplateId(id);
    setTheme((prev) => ({
      backgroundImage: prev.backgroundImage,
      backgroundOverlay: prev.backgroundOverlay,
      font: prev.font,
    }));
  }

  async function handleSave() {
    setSaving(true);
    const result = await api.patch("/api/design", {
      templateId,
      theme,
      showProductPhotos,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(t.design.applied);
    router.refresh();
  }

  const colorFields: { key: keyof Theme; label: string }[] = [
    { key: "primary", label: t.design.primaryColor },
    { key: "secondary", label: t.design.secondaryColor },
    { key: "background", label: t.design.backgroundColor },
    { key: "surface", label: t.design.surfaceColor },
    { key: "text", label: t.design.textColor },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t.design.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{t.design.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setTheme({});
              toast.show(t.design.resetTheme);
            }}
          >
            <RotateCcw className="size-4" />
            {t.design.resetTheme}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t.common.save}
          </Button>
        </div>
      </header>

      {/*
        minmax(0, 1fr), not the implicit auto column: an auto column grows to its
        widest child, and the device preview is a phone wide plus its bezel, so
        on a phone the whole page scrolled sideways by the bezel's width.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {/* ------------------------------------------------ template picker */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t.design.template}</CardTitle>
                <p className="mt-1 text-xs text-ink-500">{t.design.templateHint}</p>
              </div>
            </CardHeader>
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2">
                {TEMPLATES.map((template) => {
                  const selected = template.id === templateId;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => switchTemplate(template.id)}
                      aria-pressed={selected}
                      className={cn(
                        "relative rounded-[var(--radius-md)] border p-4 text-start transition-all",
                        selected
                          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/25"
                          : "border-ink-200 bg-surface hover:border-ink-300",
                      )}
                    >
                      {selected && (
                        <span className="absolute end-3 top-3 grid size-5 place-items-center rounded-full bg-brand-600 text-white">
                          <Check className="size-3" />
                        </span>
                      )}

                      <div className="mb-3 flex gap-1.5" aria-hidden>
                        {template.swatch.map((color) => (
                          <span
                            key={color}
                            className="size-6 rounded-md ring-1 ring-black/10"
                            style={{ background: color }}
                          />
                        ))}
                      </div>

                      <p className="text-sm font-black text-ink-900">
                        {locale === "en" ? template.nameEn : template.nameFa}
                      </p>
                      <p className="mt-1 text-xs leading-6 text-ink-500">
                        {locale === "en"
                          ? template.descriptionEn
                          : template.descriptionFa}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {/* -------------------------------------------------- dish photos */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t.design.productPhoto}</CardTitle>
                <p className="mt-1 text-xs text-ink-500">{t.design.productPhotoHint}</p>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              <Toggle
                checked={showProductPhotos}
                onChange={setShowProductPhotos}
                label={t.design.productPhotoEnable}
              />
              {!showProductPhotos && (
                <p className="text-xs leading-6 text-ink-500">
                  {t.design.productPhotoOffNote}
                </p>
              )}
            </CardBody>
          </Card>

          {/* --------------------------------------------------------- colors */}
          <Card>
            <CardHeader>
              <CardTitle>{t.design.colors}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {/* One-click schemes come first: most owners are not designers,
                  and six raw pickers reliably produce unreadable menus. Each
                  scheme is contrast-checked (scripts/audit-palettes.ts). */}
              <div>
                <p className="mb-1 text-sm font-semibold text-ink-800">
                  {t.design.palettes}
                </p>
                <p className="mb-3 text-xs text-ink-500">{t.design.palettesHint}</p>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PALETTES.map((palette) => {
                    const isActive = colorFields.every(
                      ({ key }) =>
                        (
                          theme[key as keyof Theme] as string | undefined
                        )?.toLowerCase() ===
                        (
                          palette.theme[key as keyof typeof palette.theme] as string
                        )?.toLowerCase(),
                    );
                    return (
                      <button
                        key={palette.id}
                        type="button"
                        onClick={() => applyPalette(palette)}
                        aria-pressed={isActive}
                        className={cn(
                          "flex min-h-11 items-center gap-2.5 rounded-[var(--radius-sm)] border p-2 text-start transition-colors",
                          isActive
                            ? "border-brand-500 bg-brand-50"
                            : "border-ink-200 hover:border-ink-300 hover:bg-ink-50",
                        )}
                      >
                        <span
                          className="flex size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10"
                          aria-hidden
                        >
                          <span
                            className="w-1/3"
                            style={{ background: palette.theme.primary }}
                          />
                          <span
                            className="w-1/3"
                            style={{ background: palette.theme.secondary }}
                          />
                          <span
                            className="w-1/3"
                            style={{ background: palette.theme.background }}
                          />
                        </span>
                        <span className="min-w-0 truncate text-xs font-bold">
                          {locale === "en" ? palette.nameEn : palette.nameFa}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {colorFields.map(({ key, label }) => {
                  const value =
                    (resolved[key as keyof typeof resolved] as string) ?? "#000000";
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-ink-200 p-2.5"
                    >
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => setToken(key, e.target.value as never)}
                        className="size-9 shrink-0 cursor-pointer rounded-md border border-ink-200 bg-transparent p-0.5"
                        aria-label={label}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-ink-800">
                          {label}
                        </span>
                        <span
                          className="block font-mono text-[11px] text-ink-500"
                          dir="ltr"
                        >
                          {value}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.design.font} htmlFor="theme-font">
                  <Select
                    id="theme-font"
                    value={resolved.font}
                    onChange={(e) => setToken("font", e.target.value as Theme["font"])}
                  >
                    {FONT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {locale === "en" ? option.labelEn : option.labelFa}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label={t.design.style} htmlFor="theme-style">
                  <Select
                    id="theme-style"
                    value={resolved.surfaceStyle}
                    onChange={(e) =>
                      setToken("surfaceStyle", e.target.value as Theme["surfaceStyle"])
                    }
                  >
                    <option value="flat">{t.design.styleFlat}</option>
                    <option value="glass">{t.design.styleGlass}</option>
                    <option value="elevated">{t.design.styleElevated}</option>
                  </Select>
                </Field>
              </div>

              <Field
                label={`${t.design.radius} — ${resolved.radius}px`}
                htmlFor="theme-radius"
              >
                <input
                  id="theme-radius"
                  type="range"
                  min={0}
                  max={32}
                  step={2}
                  value={resolved.radius}
                  onChange={(e) => setToken("radius", Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
              </Field>
            </CardBody>
          </Card>

          {/* ----------------------------------------------------- background */}
          <Card>
            <CardHeader>
              <CardTitle>{t.design.backgroundImage}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <ImageUploader
                label={t.design.backgroundImage}
                aspect="wide"
                value={theme.backgroundImage ?? ""}
                onChange={(url) => setToken("backgroundImage", url || null)}
              />

              {theme.backgroundImage && (
                <Field
                  label={`${t.design.backgroundOverlay} — ${Math.round(
                    (resolved.backgroundOverlay ?? 0) * 100,
                  )}%`}
                  htmlFor="theme-overlay"
                >
                  <input
                    id="theme-overlay"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((resolved.backgroundOverlay ?? 0.7) * 100)}
                    onChange={(e) =>
                      setToken("backgroundOverlay", Number(e.target.value) / 100)
                    }
                    className="w-full accent-brand-600"
                  />
                </Field>
              )}
            </CardBody>
          </Card>
        </div>

        {/* ---------------------------------------------------- live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="size-4" />
                {t.design.livePreview}
              </CardTitle>
            </CardHeader>

            <div className="bg-ink-100 p-2 sm:p-4">
              {previewData ? (
                /*
                  The bezel is part of the box, so the device size is the
                  *content* box and the 6px border is added on top of it —
                  `box-sizing: border-box` otherwise takes the bezel out of the
                  phone's own width. That was a real defect: the inner surface
                  was hard-coded to the full device width inside a frame 12px
                  narrower, overhung it, and `overflow-hidden` clipped the
                  difference. In RTL the overflow lands on the left, which is
                  where it cut the corner off the cart button.

                  `maxWidth` still collapses the frame on a narrow column, and
                  now that costs nothing: the iframe is a viewport, so the menu
                  simply lays out at the narrower width the way a smaller phone
                  would, instead of being rendered wide and cropped.
                */
                <div
                  className="mx-auto overflow-hidden rounded-[28px] border-[6px] border-ink-900 bg-surface shadow-[var(--shadow-lift)]"
                  style={{
                    width: device.width + 12,
                    height: device.height + 12,
                    maxWidth: "100%",
                  }}
                >
                  {/*
                    No `--m-vh`, no contained backdrop, no fixed width on the
                    scrolling surface: the frame has a viewport of its own, so
                    `dvh`, `position: fixed` and `100%` all mean the phone
                    without anything being published to them.

                    `key` is deliberately absent. Letting the `src` change drive
                    the navigation keeps the element — and so the scroll
                    position — while only the document is replaced; keying it
                    would tear the iframe down and rebuild it on every template
                    switch.
                  */}
                  <iframe
                    ref={frameRef}
                    src={previewSrc}
                    title={t.design.livePreview}
                    // The theme is written in as soon as the document exists.
                    // Without this the frame would paint the *saved* colours
                    // for a frame after each reload before the effect caught up.
                    onLoad={applyTheme}
                    /*
                      The corner radius is on the iframe itself, not only on the
                      bezel around it.

                      A rounded, `overflow-hidden` ancestor clips ordinary
                      content, but it stops clipping an iframe whose document
                      has been promoted to its own compositing layer — and
                      opening a product sheet does exactly that, between the
                      backdrop's `backdrop-blur` and the sheet's slide-up
                      transform. The bezel kept its shape while the picture
                      inside it squared off, so tapping a dish turned the phone
                      into a rectangle. Giving the frame its own radius makes
                      the shape a property of the element being painted rather
                      than of an ancestor's clip.

                      22px, not 28: the bezel's 28px is its border-box radius
                      and the iframe sits inside 6px of border, so the curve it
                      has to follow is the padding box.
                    */
                    className="block h-full w-full rounded-[22px] border-0"
                    style={{
                      /*
                        `clip-path` as well as the radius, because the radius
                        alone stops holding at the moment it matters.

                        Opening a product sheet gives the frame's document its
                        own compositing layer — the backdrop blurs and the sheet
                        slides — and a composited iframe is painted past a
                        `border-radius` clip, so the corners squared off and the
                        sheet appeared to sit on top of the phone. `clip-path`
                        is applied to the element's own rendering rather than
                        inherited from an ancestor's overflow, so it survives
                        that promotion.

                        Both are kept: the radius is what a browser without
                        `clip-path` still honours, and the two describe the same
                        shape.
                      */
                      clipPath: "inset(0 round 22px)",
                    }}
                  />
                </div>
              ) : (
                <p className="py-16 text-center text-sm font-semibold text-ink-500">
                  {t.menuBuilder.noCategoriesHint}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
