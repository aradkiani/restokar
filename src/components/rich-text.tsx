import * as React from "react";
import Link from "next/link";
import { parseMarkup, type Inline } from "@/lib/cms/markup";
import { cn } from "@/lib/utils";

/**
 * Renders the admin editor's rich-text markup as React elements.
 *
 * No `dangerouslySetInnerHTML` anywhere: every node becomes an element React
 * escapes, so whatever was typed is shown, never run. Site paths use Next's
 * Link; outside links open in a new tab without handing it our window.
 */
function renderInline(nodes: Inline[]): React.ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        // Keep the line breaks someone typed inside a paragraph (an address).
        return node.value.split("\n").map((part, i) => (
          <React.Fragment key={`${index}-${i}`}>
            {i > 0 && <br />}
            {part}
          </React.Fragment>
        ));
      case "strong":
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case "em":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "link":
        return node.href.startsWith("/") ? (
          <Link
            key={index}
            href={node.href}
            className="font-bold text-brand-700 underline"
          >
            {renderInline(node.children)}
          </Link>
        ) : (
          <a
            key={index}
            href={node.href}
            className="font-bold text-brand-700 underline"
            {...(node.href.startsWith("http")
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

export function RichText({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("space-y-4 text-base leading-9 text-ink-700", className)}>
      {parseMarkup(source).map((block, index) => {
        if (block.type === "heading") {
          return block.level === 2 ? (
            <h2 key={index} className="pt-3 text-xl font-black text-ink-900">
              {renderInline(block.children)}
            </h2>
          ) : (
            <h3 key={index} className="pt-1 text-base font-extrabold text-ink-900">
              {renderInline(block.children)}
            </h3>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-1.5 ps-6">
              {block.items.map((item, i) => (
                <li key={i}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{renderInline(block.children)}</p>;
      })}
    </div>
  );
}
