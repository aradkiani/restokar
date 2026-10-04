import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * The marketing pages and public menus may be crawled; the panels, the API and
 * the payment return pages may not. Robots rules are advice, not access
 * control — those areas are protected by sign-in regardless.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/api/",
        "/payment",
        "/design-preview",
        "/print",
      ],
    },
    sitemap: new URL("/sitemap.xml", env.NEXT_PUBLIC_APP_URL).toString(),
  };
}
