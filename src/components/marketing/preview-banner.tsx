import { Eye } from "lucide-react";
import { isPreviewing } from "@/lib/cms/content-server";

/**
 * Shown across the top of a public page while the platform admin is
 * previewing drafts, so a draft is never mistaken for what visitors see.
 * Renders nothing for everyone else.
 */
export async function PreviewBanner() {
  if (!(await isPreviewing())) return null;
  return (
    <div className="sticky top-0 z-[60] bg-amber-400 text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 py-2 text-sm font-bold">
        <span className="inline-flex items-center gap-1.5">
          <Eye className="size-4" />
          پیش‌نمایش پیش‌نویس — بازدیدکنندگان هنوز این نسخه را نمی‌بینند.
        </span>
        {/* A plain link: the route sets a cookie and redirects. */}
        <a href="/api/admin/preview?exit=1" className="underline underline-offset-4">
          خروج از پیش‌نمایش
        </a>
      </div>
    </div>
  );
}
