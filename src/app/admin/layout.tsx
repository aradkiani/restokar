import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requirePageAdmin } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { getThemePreference } from "@/lib/appearance-server";
import { themeAttribute } from "@/lib/appearance";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "./logout-button";
import { AdminNav } from "./nav";

/**
 * Admin shell.
 *
 * requirePageAdmin() runs here, so *every* page under /admin is gated by a
 * server-side SUPER_ADMIN check before it renders — a new page added to this
 * folder is protected by default rather than by remembering to add a guard.
 * The edge proxy also blocks the route, but this is the authoritative check:
 * the proxy only verifies a token signature, while this reads the live session
 * and can see a demoted or deactivated account immediately.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePageAdmin();
  const [{ t }, theme] = await Promise.all([getI18n(), getThemePreference()]);

  return (
    <div data-theme={themeAttribute(theme)} className="min-h-dvh bg-ink-50">
      <header className="border-b border-ink-200 bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-5 py-3">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-[var(--radius-sm)] bg-ink-900 text-ink-50">
              <ShieldCheck className="size-4.5" />
            </span>
            <span>
              <span className="block text-sm font-black text-ink-900">
                {t.admin.title}
              </span>
              <span className="block text-xs text-ink-500">{admin.email}</span>
            </span>
          </Link>

          <div className="ms-auto flex items-center gap-3">
            <ThemeToggle value={theme} />
            <LogoutButton label={t.nav.logout} />
          </div>
        </div>

        <AdminNav />
      </header>

      <main id="main" className="mx-auto max-w-7xl px-5 py-6">
        {children}
      </main>
    </div>
  );
}
