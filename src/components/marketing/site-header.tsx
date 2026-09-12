"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChefHat, Languages, Menu, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

/**
 * `signupOpen` arrives as a prop rather than being read from the feature flag
 * directly: this is a client component, and the flag lives in a server-only
 * environment variable. Importing it here would evaluate to `undefined` in the
 * browser — which happens to look right today, because the default is off, and
 * would silently stay wrong on the day someone re-enables signup.
 */
export function SiteHeader({
  isAuthed,
  signupOpen,
}: {
  isAuthed: boolean;
  signupOpen: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#features", label: t.nav.features },
    { href: "#how", label: t.nav.howItWorks },
    { href: "#demo", label: t.nav.demo },
    { href: "#pricing", label: t.nav.pricing },
    { href: "#faq", label: t.nav.faq },
  ];

  async function toggleLocale() {
    await api.post("/api/locale", { locale: locale === "fa" ? "en" : "fa" });
    router.refresh();
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled ? "glass shadow-[var(--shadow-soft)]" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3.5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-500 text-ink-950">
            <ChefHat className="size-5" />
          </span>
          <span className="text-lg font-black text-ink-900">{t.common.appName}</span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-sm font-semibold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2 lg:ms-0">
          <button
            type="button"
            onClick={toggleLocale}
            aria-label={t.common.language}
            className="tap-safe grid size-10 place-items-center rounded-full text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <Languages className="size-5" />
          </button>

          {isAuthed ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-ink-800"
            >
              {t.nav.dashboard}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-full px-4 py-2.5 text-sm font-bold text-ink-700 transition-colors hover:bg-ink-100 sm:block"
              >
                {t.nav.login}
              </Link>
              {/* Still points at /register while signup is closed — that page
                  now explains how to get an account rather than 404ing. Only
                  the promise in the label changes. */}
              <Link
                href="/register"
                className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-[var(--shadow-soft)] transition-colors hover:bg-brand-700"
              >
                {signupOpen ? t.nav.register : t.landing.ctaContactSupport}
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={t.nav.features}
            aria-expanded={open}
            className="tap-safe grid size-10 place-items-center rounded-full text-ink-700 hover:bg-ink-100 lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-ink-200 bg-surface px-5 py-3 lg:hidden">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-100"
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
