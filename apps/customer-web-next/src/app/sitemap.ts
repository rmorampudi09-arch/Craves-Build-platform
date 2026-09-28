import type { MetadataRoute } from "next";

const baseUrl = "https://craves.in";
const updatedAt = new Date("2026-09-28T00:00:00.000Z");

const publicRoutes = [
  "",
  "/home",
  "/discover",
  "/products-pricing",
  "/subscriptions/plans",
  "/chef/application",
  "/terms",
  "/privacy",
  "/refunds-cancellations",
  "/security",
  "/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: updatedAt,
    changeFrequency: route === "" || route === "/home" ? "daily" : "weekly",
    priority: route === "" || route === "/home" ? 1 : 0.7,
  }));
}
