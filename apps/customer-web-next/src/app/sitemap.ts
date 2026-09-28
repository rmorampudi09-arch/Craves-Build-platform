import type { MetadataRoute } from "next";

const siteUrl = "https://craves.in";

const publicRoutes = [
  "",
  "/home",
  "/discover",
  "/subscriptions/plans",
  "/products-pricing",
  "/contact",
  "/privacy",
  "/terms",
  "/refunds-cancellations",
  "/security",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.7,
  }));
}
