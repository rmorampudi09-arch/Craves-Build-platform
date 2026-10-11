import type { MetadataRoute } from "next";

import {
  cityFoodUrl,
  cityUrl,
  foodIntents,
  foodUrl,
  launchCities,
  siteUrl,
} from "@/features/seo/lib/seo-craves";

const publicRoutes = [
  "",
  "/home",
  "/discover",
  "/chefs",
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
  const cityRoutes = launchCities.map((city) => ({
    url: cityUrl(city),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.9,
  }));
  const cityFoodRoutes = launchCities.flatMap((city) =>
    foodIntents.map((food) => ({
      url: cityFoodUrl(city, food),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: food.slug === "homemade-food" ? 0.85 : 0.75,
    })),
  );
  const foodRoutes = foodIntents.map((food) => ({
    url: foodUrl(food),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: food.slug === "homemade-food" ? 0.8 : 0.65,
  }));

  return [
    ...publicRoutes.map((route) => ({
      url: `${siteUrl}${route}`,
      lastModified: now,
      changeFrequency: route === "" ? "daily" as const : "weekly" as const,
      priority: route === "" ? 1 : 0.7,
    })),
    ...cityRoutes,
    ...cityFoodRoutes,
    ...foodRoutes,
  ];
}
