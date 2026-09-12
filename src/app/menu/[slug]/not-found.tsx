import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { getI18n } from "@/lib/i18n";

export default async function MenuNotFound() {
  const { t } = await getI18n();

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5 py-16 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-ink-100 text-ink-500">
          <UtensilsCrossed className="size-8" />
        </span>
        <h1 className="mt-6 text-2xl font-black text-ink-900">
          {t.errors.restaurantNotFound}
        </h1>
        <p className="mt-2 text-sm leading-8 text-ink-600">
          {t.errors.restaurantNotFoundHint}
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex h-12 items-center rounded-full bg-brand-600 px-7 text-sm font-bold text-white transition-colors hover:bg-brand-700"
        >
          {t.errors.goHome}
        </Link>
      </div>
    </main>
  );
}
