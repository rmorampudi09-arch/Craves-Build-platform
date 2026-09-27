import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/public-seo";

// Include only crawlable public pages. Account, checkout, and address-dependent
// catalog screens require a session and must never enter this sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({ url: new URL(path, SITE_URL).href }));
}
