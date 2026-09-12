"use client";

import * as React from "react";
import QRCode from "qrcode";

/**
 * Renders a QR code to a data URL.
 *
 * Error-correction level H (30% recovery) is deliberate: these codes get
 * printed, laminated, spilled on and scuffed by a year of table service, and
 * the extra redundancy is what keeps a scratched card scannable.
 */
export function useQrDataUrl(value: string, size = 512): string | null {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(value, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: size,
      color: { dark: "#141211", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return dataUrl;
}

export function QrImage({
  value,
  size = 512,
  alt,
  className,
}: {
  value: string;
  size?: number;
  alt: string;
  className?: string;
}) {
  const dataUrl = useQrDataUrl(value, size);

  if (!dataUrl) {
    return <div className={className} style={{ background: "#f2f0ec" }} aria-hidden />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt={alt} className={className} />;
}

/** Triggers a browser download of the code as a PNG. */
export async function downloadQr(
  value: string,
  filename: string,
  size = 1024,
): Promise<void> {
  const dataUrl = await QRCode.toDataURL(value, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: size,
    color: { dark: "#141211", light: "#ffffff" },
  });

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export async function downloadQrSvg(value: string, filename: string): Promise<void> {
  const svg = await QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    color: { dark: "#141211", light: "#ffffff" },
  });

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
