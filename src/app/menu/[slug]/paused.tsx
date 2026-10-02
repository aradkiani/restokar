import { Clock } from "lucide-react";
import { getI18n } from "@/lib/i18n";

/**
 * What a guest sees when the venue's subscription has lapsed past its grace
 * period: the venue's own name and a polite «temporarily unavailable», instead
 * of the 404 that told them the restaurant did not exist. Deliberately offers
 * no link to the platform — the guest is sitting in the restaurant, not
 * shopping for software.
 */
export async function MenuPaused({ name }: { name: string }) {
  const { t } = await getI18n();

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5 py-16 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-ink-100 text-ink-500">
          <Clock className="size-8" />
        </span>
        <h1 className="mt-6 text-2xl leading-10 font-black text-ink-900">
          {t.errors.menuPaused.replace("{name}", name)}
        </h1>
        <p className="mt-2 text-sm leading-8 text-ink-600">{t.errors.menuPausedHint}</p>
      </div>
    </main>
  );
}
