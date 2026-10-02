import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * The platform's own pages only. Restaurant menus are left out on purpose:
 * whether a venue's menu is advertised to search engines is that venue's
 * decision, not something the platform volunteers on its behalf.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/pricing", priority: 0.9 },
    { path: "/about", priority: 0.6 },
    { path: "/contact", priority: 0.6 },
    { path: "/terms", priority: 0.3 },
    { path: "/privacy", priority: 0.3 },
    { path: "/refund-policy", priority: 0.3 },
  ];
  return pages.map(({ path, priority }) => ({
    url: new URL(path, env.NEXT_PUBLIC_APP_URL).toString(),
    changeFrequency: "weekly",
    priority,
  }));
}
