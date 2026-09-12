import Link from "next/link";
import { ChefHat, ClipboardList, QrCode, TrendingUp } from "lucide-react";
import { getI18n } from "@/lib/i18n";

/**
 * Split layout: form on one side, value proposition on the other. The panel is
 * hidden below `lg` so the form is the only thing on a phone screen.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();

  const points = [
    { icon: QrCode, title: t.features.qrTitle, text: t.features.qrText },
    { icon: ClipboardList, title: t.features.orderTitle, text: t.features.orderText },
    { icon: ChefHat, title: t.features.kitchenTitle, text: t.features.kitchenText },
    { icon: TrendingUp, title: t.features.financeTitle, text: t.features.financeText },
  ];

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <main id="main" className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <aside className="relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col lg:justify-center">
        {/* Decorative warmth — a flat dark panel reads as unfinished. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -end-32 -top-32 size-[28rem] rounded-full opacity-25 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, var(--color-brand-500), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -start-24 -bottom-40 size-[26rem] rounded-full opacity-20 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, var(--color-accent-500), transparent 70%)",
          }}
        />

        <div className="relative max-w-lg">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-500 text-ink-950">
              <ChefHat className="size-5" />
            </span>
            <span className="text-xl font-black">{t.common.appName}</span>
          </Link>

          <h2 className="mt-10 text-3xl leading-tight font-black">
            {t.landing.heroTitle}{" "}
            <span className="text-brand-400">{t.landing.heroTitleAccent}</span>
          </h2>
          <p className="mt-4 text-sm leading-8 text-ink-300">{t.landing.heroSubtitle}</p>

          <ul className="mt-10 space-y-5">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/8 text-brand-400 ring-1 ring-white/10">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="mt-0.5 block text-xs leading-6 text-ink-400">
                    {text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
