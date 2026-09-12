import Link from "next/link";
import { ChefHat } from "lucide-react";
import { getI18n } from "@/lib/i18n";

export default async function NotFound() {
  const { t } = await getI18n();

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5 py-16 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-100 text-brand-700">
          <ChefHat className="size-8" />
        </span>
        <p className="mt-6 text-6xl font-black text-ink-300">۴۰۴</p>
        <h1 className="mt-2 text-2xl font-black text-ink-900">{t.errors.notFound}</h1>
        <p className="mt-2 text-sm leading-8 text-ink-600">{t.errors.notFoundHint}</p>
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
