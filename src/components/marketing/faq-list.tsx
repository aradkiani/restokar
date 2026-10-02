import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Native <details> accordion — keyboard support, find-in-page and the
 * open/closed state all come from the platform rather than from JS.
 *
 * The questions come from the admin-editable "faq" document (built-in
 * defaults in src/lib/cms/defaults.ts), already in the visitor's language.
 */
export function FaqList({
  items,
  className,
}: {
  items: { q: string; a: string }[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item) => (
        <details
          key={item.q}
          className="group rounded-[var(--radius-md)] border border-ink-200 bg-ink-50/60 transition-colors open:bg-surface open:shadow-[var(--shadow-soft)]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-sm font-bold text-ink-900 marker:content-none">
            {item.q}
            <ChevronDown className="size-4.5 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
          </summary>
          <p className="px-4 pb-4 text-sm leading-8 whitespace-pre-line text-ink-600">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
