"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { ImageUploader } from "@/components/image-uploader";
import { SocialIcon } from "@/components/social-icon";
import { PhoneChangeCard } from "@/components/auth/phone-change-card";
import { api } from "@/lib/client-api";
import {
  MAX_SOCIAL_LINKS,
  SOCIAL_PLATFORMS,
  type SocialLink,
  type SocialPlatform,
} from "@/lib/socials";

export interface SettingsValues {
  name: string;
  nameEn: string;
  tagline: string;
  description: string;
  logoUrl: string;
  coverUrl: string;
  phone: string;
  phoneSecondary: string;
  address: string;
  instagram: string;
  socialLinks: SocialLink[];
  slug: string;
  onlineOrderingEnabled: boolean;
  onlinePaymentEnabled: boolean;
  showPrices: boolean;
  featuredSectionEnabled: boolean;
  isPublished: boolean;
  defaultLocale: "fa" | "en";
}

export function SettingsForm({
  baseUrl,
  initial,
  allowsOnlinePay,
  paymentsEnabled,
  accountPhone,
}: {
  baseUrl: string;
  /** The signed-in owner's own sign-in number, for the phone-change card. */
  accountPhone: string | null;
  initial: SettingsValues;
  allowsOnlinePay: boolean;
  /** Platform-wide switch. False while no payment gateway is connected. */
  paymentsEnabled: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [form, setForm] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  function setField<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    // `slug` is intentionally not submitted — changing a live menu address
    // would break every printed QR code on every table.
    const { slug: _slug, ...payload } = form;
    const result = await api.patch("/api/settings", payload);

    setSaving(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }

    toast.success(t.common.saved);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-black text-ink-900">{t.settings.title}</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.restaurantInfo}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.settings.restaurantName} htmlFor="s-name">
                <Input
                  id="s-name"
                  required
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </Field>
              <Field
                label={t.settings.restaurantNameEn}
                hint={t.common.optional}
                htmlFor="s-name-en"
              >
                <Input
                  id="s-name-en"
                  dir="ltr"
                  value={form.nameEn}
                  onChange={(e) => setField("nameEn", e.target.value)}
                />
              </Field>
            </div>

            <Field
              label={t.settings.tagline}
              hint={t.common.optional}
              htmlFor="s-tagline"
            >
              <Input
                id="s-tagline"
                value={form.tagline}
                onChange={(e) => setField("tagline", e.target.value)}
                placeholder="قهوه دست‌ساز و صبحانه"
              />
            </Field>

            <Field
              label={t.settings.description}
              hint={t.common.optional}
              htmlFor="s-description"
            >
              <Textarea
                id="s-description"
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <ImageUploader
                label={t.settings.logo}
                value={form.logoUrl}
                onChange={(url) => setField("logoUrl", url)}
              />
              <ImageUploader
                label={t.settings.cover}
                aspect="wide"
                value={form.coverUrl}
                onChange={(url) => setField("coverUrl", url)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.settings.phone} htmlFor="s-phone">
                <Input
                  id="s-phone"
                  dir="ltr"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </Field>
              <Field label={t.settings.phoneSecondary} htmlFor="s-phone-2">
                <Input
                  id="s-phone-2"
                  dir="ltr"
                  type="tel"
                  value={form.phoneSecondary}
                  onChange={(e) => setField("phoneSecondary", e.target.value)}
                />
              </Field>
            </div>

            <SocialLinksEditor
              value={form.socialLinks}
              onChange={(links) => setField("socialLinks", links)}
            />

            <Field label={t.settings.address} htmlFor="s-address">
              <Input
                id="s-address"
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
              />
            </Field>

            <Field label={t.settings.slug} htmlFor="s-slug" error={undefined}>
              <div className="relative">
                <Input
                  id="s-slug"
                  dir="ltr"
                  value={form.slug}
                  disabled
                  className="pe-10"
                />
                <Lock className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              </div>
              <p className="mt-1.5 text-xs text-ink-500" dir="ltr">
                {baseUrl}/menu/{form.slug}
              </p>
              <p className="mt-1 text-xs text-ink-500">{t.settings.slugLocked}</p>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.settings.ordering}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <Toggle
              checked={form.isPublished}
              onChange={(v) => setField("isPublished", v)}
              label={t.settings.published}
            />
            <Toggle
              checked={form.onlineOrderingEnabled}
              onChange={(v) => setField("onlineOrderingEnabled", v)}
              label={t.settings.enableOrdering}
            />
            {/*
              Two separate reasons this can be unavailable, and they are not
              interchangeable: the venue's plan may not include online payment,
              or the platform has payments switched off entirely while there is
              no gateway connected. The second is not the owner's problem to
              solve and no plan upgrade fixes it, so it says so plainly rather
              than showing a toggle that silently does nothing.
            */}
            <Toggle
              checked={paymentsEnabled && form.onlinePaymentEnabled}
              onChange={(v) => setField("onlinePaymentEnabled", v)}
              label={
                paymentsEnabled
                  ? t.settings.enableOnlinePayment
                  : t.settings.onlinePaymentOff
              }
              disabled={!paymentsEnabled || !allowsOnlinePay}
              description={
                !paymentsEnabled
                  ? t.settings.onlinePaymentOffHint
                  : !allowsOnlinePay
                    ? t.errors.limitReachedHint
                    : undefined
              }
            />
            <Toggle
              checked={form.showPrices}
              onChange={(v) => setField("showPrices", v)}
              label={t.settings.showPrices}
            />
            {/* Off by default, so no venue gains a promotional strip it never
                asked for. Which dishes appear in it is set per product. */}
            <Toggle
              checked={form.featuredSectionEnabled}
              onChange={(v) => setField("featuredSectionEnabled", v)}
              label={t.featured.sectionEnabled}
              description={t.featured.sectionEnabledHint}
            />

            <Field label={t.settings.defaultLocale} htmlFor="s-locale" className="!mt-4">
              <Select
                id="s-locale"
                value={form.defaultLocale}
                onChange={(e) => setField("defaultLocale", e.target.value as "fa" | "en")}
              >
                <option value="fa">فارسی</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={saving}>
            {t.common.save}
          </Button>
        </div>
      </form>

      <PhoneChangeCard currentPhone={accountPhone} />
    </div>
  );
}

/**
 * Picks up to three social links for the menu footer.
 *
 * Modelled as "add a row, choose a platform" rather than a fixed field per
 * platform, because the footer shows whichever ones exist as a row of icons —
 * a venue with only Telegram should not have to leave two empty boxes to get
 * there. Platforms already chosen are removed from the remaining dropdowns, so
 * the duplicate the server would reject cannot be built in the first place.
 */
function SocialLinksEditor({
  value,
  onChange,
}: {
  value: SocialLink[];
  onChange: (links: SocialLink[]) => void;
}) {
  const { t, locale } = useI18n();

  const used = new Set(value.map((link) => link.platform));
  const available = SOCIAL_PLATFORMS.filter((p) => !used.has(p.id));

  function update(index: number, patch: Partial<SocialLink>) {
    onChange(value.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  }

  return (
    <div>
      <p className="text-sm font-semibold text-ink-800">{t.settings.socialLinks}</p>
      <p className="mt-1 mb-3 text-xs leading-6 text-ink-500">
        {t.settings.socialLinksHint}
      </p>

      <ul className="space-y-2">
        {value.map((link, index) => {
          const platform = SOCIAL_PLATFORMS.find((p) => p.id === link.platform);
          return (
            <li key={link.platform} className="flex items-center gap-2">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-ink-200 text-ink-700"
                aria-hidden
              >
                <SocialIcon platform={link.platform} className="size-4" />
              </span>

              <Select
                aria-label={t.settings.socialLinks}
                className="w-36 shrink-0"
                value={link.platform}
                onChange={(e) =>
                  update(index, { platform: e.target.value as SocialPlatform })
                }
              >
                {/* The current one stays listed, or changing it would be a
                    dropdown that cannot show its own value. */}
                {[platform, ...available].filter(Boolean).map((option) => (
                  <option key={option!.id} value={option!.id}>
                    {locale === "en" ? option!.labelEn : option!.labelFa}
                  </option>
                ))}
              </Select>

              <Input
                dir="ltr"
                className="min-w-0 flex-1"
                aria-label={locale === "en" ? platform?.labelEn : platform?.labelFa}
                placeholder={platform?.placeholder}
                value={link.url}
                onChange={(e) => update(index, { url: e.target.value })}
              />

              <Button
                type="button"
                variant="outline"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                {t.common.delete}
              </Button>
            </li>
          );
        })}
      </ul>

      {value.length < MAX_SOCIAL_LINKS && available.length > 0 && (
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => onChange([...value, { platform: available[0]!.id, url: "" }])}
        >
          {t.settings.addSocialLink}
        </Button>
      )}
    </div>
  );
}
