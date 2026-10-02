import Link from "next/link";
import { Megaphone } from "lucide-react";
import type { SiteInfo } from "@/lib/cms/site-info";

/**
 * The strip above the public site's header. Shown only while the admin has it
 * switched on and the current time is inside its start/end window.
 */
export function AnnouncementBar({
  announcement,
}: {
  announcement: SiteInfo["announcement"];
}) {
  if (!announcement) return null;

  const body = (
    <>
      <Megaphone className="size-4 shrink-0" />
      <span>{announcement.text}</span>
    </>
  );
  const className =
    "mx-auto flex max-w-6xl items-center justify-center gap-2 px-5 py-2.5 text-center text-sm font-bold";

  return (
    <div className="bg-ink-900 text-white" role="region" aria-label={announcement.text}>
      {announcement.href === null ? (
        <p className={className}>{body}</p>
      ) : announcement.href.startsWith("/") ? (
        <Link href={announcement.href} className={`${className} hover:underline`}>
          {body}
        </Link>
      ) : (
        <a
          href={announcement.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`${className} hover:underline`}
        >
          {body}
        </a>
      )}
    </div>
  );
}
