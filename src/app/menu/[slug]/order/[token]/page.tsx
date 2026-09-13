import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getOrderByToken } from "@/lib/orders";
import { getPublicMenu } from "@/lib/menu";
import { getI18n } from "@/lib/i18n";
import { themeToCssVars } from "@/lib/theme";
import { formatMoney, formatTime } from "@/lib/format";
import { MenuBackdrop } from "@/components/menu-background";
import { OrderStatusTracker } from "./tracker";

export const metadata: Metadata = {
  title: "وضعیت سفارش",
  robots: { index: false, follow: false },
};

// Always fresh: this page exists to show a status that changes minute to minute.
export const dynamic = "force-dynamic";

/** The guest reached this from the menu; it must not zoom either. See page.tsx. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;

  const [order, menu, { t, locale, dir }] = await Promise.all([
    getOrderByToken(slug, token),
    getPublicMenu(slug),
    getI18n(),
  ]);

  if (!order) notFound();

  // Fall back to base tokens if the menu itself is offline, so a guest with a
  // live order still gets a styled page.
  const cssVars = menu ? themeToCssVars(menu.theme) : {};
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div
      className="menu-scope"
      style={cssVars as React.CSSProperties}
      dir={dir}
      lang={locale}
    >
      {/* This page already applied the venue's colours and wrapped its content
          in `relative z-10` — the slot the backdrop is designed to sit under —
          but never rendered the image, so a venue with a background lost it the
          moment a guest placed an order. */}
      <MenuBackdrop image={menu?.theme.backgroundImage} />

      <div className="relative z-10 mx-auto w-full max-w-md px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          <Link
            href={`/menu/${slug}`}
            className="grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-black/5"
            aria-label={t.orderStatus.backToMenu}
          >
            <Back className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black">{order.restaurant.name}</h1>
            <p className="text-xs opacity-60">
              {t.orderStatus.orderNumber} #
              {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
                useGrouping: false,
              }).format(order.orderNumber)}
            </p>
          </div>
          {order.restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={order.restaurant.logoUrl}
              alt=""
              className="size-10 shrink-0 rounded-full object-cover"
            />
          ) : null}
        </header>

        <OrderStatusTracker
          token={token}
          initialStatus={order.status}
          locale={locale}
          placedAt={order.placedAt.toISOString()}
        />

        <section className="menu-surface mt-5 p-4">
          <h2 className="mb-3 text-sm font-black">{t.orderStatus.items}</h2>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 text-sm">
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-black tabular-nums"
                  style={{
                    background: "var(--m-primary-soft)",
                    color: "var(--m-primary)",
                  }}
                >
                  {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(
                    item.quantity,
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{item.nameSnapshot}</span>
                  {item.note && (
                    <span className="block text-xs opacity-60">{item.note}</span>
                  )}
                </span>
                {order.restaurant.showPrices && (
                  <span className="shrink-0 font-bold tabular-nums">
                    {formatMoney(item.priceSnapshot * item.quantity, locale)}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {order.note && (
            <p
              className="mt-4 rounded-[var(--m-radius-sm)] p-3 text-xs leading-6"
              style={{ background: "var(--m-secondary-soft)" }}
            >
              {order.note}
            </p>
          )}

          {order.restaurant.showPrices && (
            <div
              className="mt-4 border-t pt-3"
              style={{ borderColor: "var(--m-border)" }}
            >
              {/*
                The saving, when there was one and the venue shows it.

                Read from the order's own snapshot rather than recomputed: this
                is what the guest was actually charged, months ago if they come
                back to the link, and a code edited since must not change what
                a placed order says it cost. Signed, so it reads as a
                subtraction against the total below it.
              */}
              {order.restaurant.showOrderDiscount && order.discount > 0 && (
                <div className="mb-2 flex items-center justify-between text-xs opacity-80">
                  <span>{t.publicMenu.discountSaving}</span>
                  <bdi className="tabular-nums">
                    {formatMoney(-order.discount, locale)}
                  </bdi>
                </div>
              )}

              <div className="flex items-center justify-between text-sm font-black">
                <span>{t.publicMenu.total}</span>
                <span className="tabular-nums">
                  {formatMoney(order.total, locale)}{" "}
                  <span className="text-xs font-normal opacity-70">{t.common.toman}</span>
                </span>
              </div>
            </div>
          )}
        </section>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-center text-xs">
          <div className="menu-surface p-3">
            <dt className="opacity-60">{t.kitchen.table}</dt>
            <dd className="mt-1 text-base font-black">{order.tableNumber ?? "—"}</dd>
          </div>
          <div className="menu-surface p-3">
            <dt className="opacity-60">{t.orderStatus.placedAt}</dt>
            <dd className="mt-1 text-base font-black tabular-nums">
              {formatTime(order.placedAt, locale)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
