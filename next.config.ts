import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Security headers applied to every response.
 *
 * Deliberately stops short of a `script-src` policy. Locking scripts down is
 * the single most valuable header here, but Next's inline bootstrap and the
 * streaming payload need either a nonce threaded through every response or
 * `unsafe-inline`, and the second buys nothing. Doing it properly is a change
 * with real breakage risk, so it is left out rather than added blind — the
 * directives below are the ones that are safe to state unconditionally.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  /**
   * `frame-ancestors` is the modern half of X-Frame-Options and the half that
   * still applies in browsers that dropped the older header. `object-src` and
   * `base-uri` close two injection paths that cost nothing to shut: this app
   * embeds no plugins and never rewrites its own base URL.
   */
  {
    key: "Content-Security-Policy",
    value: ["frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'"].join("; "),
  },
  /**
   * No feature here is used by the product. A menu does not need a camera, a
   * microphone or the customer's location, and saying so means a future
   * dependency cannot quietly start asking for one.
   */
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

/**
 * HSTS is production-only and deliberately so: sent over plain HTTP it is
 * ignored, but a developer who once loads http://localhost with it cached would
 * find every localhost port on their machine forced to HTTPS. Two years with
 * subdomains included, which is what a domain serving printed QR codes wants.
 */
const productionHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    /**
     * No remote patterns.
     *
     * This was `hostname: "**"`, which turns Next's image optimizer into an
     * open proxy: `/_next/image?url=https://anything` makes the server fetch
     * that URL and return the bytes. On a VPS that reaches whatever the box can
     * reach — a metadata endpoint, a database admin page, another service on
     * localhost — and does it from an unauthenticated public route.
     *
     * Every image this product stores is a same-origin `/uploads/...` path, so
     * nothing is lost by removing it. Checked against the live data before
     * changing: zero remote URLs across logos, covers, product images, category
     * icons and theme backgrounds. A venue that genuinely needs a remote host
     * later should get that one host listed here, not a wildcard.
     */
    remotePatterns: [],
    /** Uploads are already size-capped; these are the widths templates ask for. */
    deviceSizes: [375, 640, 768, 1024, 1280, 1920],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: isProd ? [...securityHeaders, ...productionHeaders] : securityHeaders,
      },
    ];
  },
};

export default nextConfig;
