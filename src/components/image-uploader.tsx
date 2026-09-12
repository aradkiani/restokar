"use client";

import * as React from "react";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import { shrinkImage } from "@/lib/images/resize";

/**
 * Uploads through /api/upload, which validates type by magic bytes and stores
 * the file under the tenant's own folder. The component only ever holds the
 * returned URL.
 */
export function ImageUploader({
  value,
  onChange,
  label,
  aspect = "square",
  className,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  aspect?: "square" | "wide";
  className?: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(original: File) {
    setUploading(true);
    try {
      /**
       * Shrunk before it leaves the device.
       *
       * A phone camera writes 3–5MB at 4000×3000; the card this ends up in is a
       * few hundred pixels wide. Uploading the original meant every guest
       * downloaded the difference — the single largest cost in the product, and
       * over Iranian mobile data the one users actually feel. `shrinkImage`
       * returns the original untouched when it cannot improve on it, so this is
       * never a downgrade.
       */
      const { file, changed, originalBytes, bytes } = await shrinkImage(original);

      if (changed && process.env.NODE_ENV !== "production") {
        console.warn(
          `[upload] ${(originalBytes / 1024).toFixed(0)}KB → ${(bytes / 1024).toFixed(0)}KB`,
        );
      }

      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/upload", { method: "POST", body });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        toast.error(payload?.error?.message ?? t.common.error);
        return;
      }
      onChange(payload.data.url);
    } catch {
      toast.error(t.common.error);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <p className="mb-1.5 text-sm font-semibold text-ink-800">{label}</p>

      <div
        className={cn(
          "relative overflow-hidden rounded-[var(--radius-md)] border border-dashed border-ink-300 bg-ink-50",
          aspect === "square" ? "aspect-square max-w-40" : "aspect-[3/1]",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-ink-400">
            <ImageIcon className="size-8" />
          </span>
        )}

        {uploading && (
          <span className="absolute inset-0 grid place-items-center bg-surface/70">
            <Loader2 className="size-6 animate-spin text-brand-600" />
          </span>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-ink-300 bg-surface px-3 text-xs font-bold text-ink-800 hover:border-ink-400 disabled:opacity-50"
        >
          <Upload className="size-3.5" />
          {value ? t.menuBuilder.changeImage : t.menuBuilder.uploadImage}
        </button>

        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-xs font-bold text-ink-500 hover:bg-ink-100 hover:text-red-600"
          >
            <Trash2 className="size-3.5" />
            {t.menuBuilder.removeImage}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
