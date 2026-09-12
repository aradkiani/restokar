"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { THEMES, type ThemePreference } from "@/lib/appearance";

const ICONS: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/**
 * Three states, not a two-way switch.
 *
 * "System" has to be reachable and has to be distinct from light: once someone
 * picks a side, following the OS again is otherwise impossible without clearing
 * cookies. It is also the default, so the dashboard already matches the rest of
 * the operator's machine before they touch anything.
 *
 * The choice is written server-side and the route re-rendered, so the theme
 * arrives with the HTML. A client-side class swap would repaint the whole
 * dashboard a frame late — the flash of the wrong theme this design exists to
 * avoid.
 */
export function ThemeToggle({
  value,
  tone = "default",
  className,
}: {
  value: ThemePreference;
  /**
   * The dashboard sidebar is dark in *both* themes, so a control tinted from
   * the ink scale would invert underneath it and disappear. `onDark` pins it to
   * translucent white instead.
   */
  tone?: "default" | "onDark";
  className?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = React.useState<ThemePreference | null>(null);

  const labels: Record<ThemePreference, string> = {
    system: t.appearance.system,
    light: t.appearance.light,
    dark: t.appearance.dark,
  };

  async function choose(theme: ThemePreference) {
    if (theme === value) return;
    setPending(theme);
    await api.post("/api/theme", { theme });
    router.refresh();
    setPending(null);
  }

  return (
    <div
      role="radiogroup"
      aria-label={t.appearance.title}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border p-0.5",
        tone === "onDark" ? "border-white/10 bg-white/5" : "border-ink-200 bg-ink-100",
        className,
      )}
    >
      {THEMES.map((theme) => {
        const Icon = ICONS[theme];
        const active = value === theme;

        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={labels[theme]}
            title={labels[theme]}
            disabled={pending !== null}
            onClick={() => choose(theme)}
            className={cn(
              // 28px visually, but tap-safe expands the hit area to 44px on
              // touch without widening the control in the header.
              "tap-safe grid size-7 place-items-center rounded-full transition-colors",
              tone === "onDark"
                ? active
                  ? "bg-white/15 text-white"
                  : "text-ink-400 hover:text-white"
                : active
                  ? "bg-surface text-ink-900 shadow-[var(--shadow-soft)]"
                  : "text-ink-500 hover:text-ink-800",
              pending !== null && "opacity-60",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
