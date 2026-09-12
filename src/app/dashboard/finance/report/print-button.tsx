"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Hands the document to the browser's print pipeline, where "Save as PDF" is a
 * standard destination on every desktop and mobile OS.
 *
 * This is the download step. It stays a client component purely because
 * `window.print()` needs the browser — the report itself is server-rendered.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer className="size-4" />
      {label}
    </Button>
  );
}
