import type { MetadataRoute } from "next";

import { cityUrl, launchCities, seoContentUpdated, siteUrl } from "@/features/seo/lib/seo-craves";

const publicRoutes = [
  "",
  "/chefs",
  "/subscriptions/plans",
  "/products-pricing",
  "/contact",
  "/privacy",
  "/terms",
  "/refunds-cancellations",
  "/security",
  "/account-deletion",
];

// Area and food pages are left out while they are unindexed (templatePageRobots in seo-craves.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = seoContentUpdated;
  const cityRoutes = launchCities.map((city) => ({
    url: cityUrl(city),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));

  return [
    ...publicRoutes.map((route) => ({
      url: `${siteUrl}${route}`,
      lastModified: now,
      changeFrequency: route === "" ? "daily" as const : "weekly" as const,
      priority: route === "" ? 1 : 0.7,
    })),
    ...cityRoutes,
  ];
}
