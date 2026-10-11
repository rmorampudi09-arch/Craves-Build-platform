import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalDiscoveryPage } from "@/features/seo/components/LocalDiscoveryPage";
import {
  cityBySlug,
  cityFoodUrl,
  foodBySlug,
  foodIntents,
  launchCities,
  seoKeywords,
} from "@/features/seo/lib/seo-craves";

type CityFoodPageProps = {
  params: Promise<{ city: string; food: string }>;
};

export function generateStaticParams() {
  return launchCities.flatMap((city) =>
    foodIntents.map((food) => ({ city: city.slug, food: food.slug })),
  );
}

export async function generateMetadata({ params }: CityFoodPageProps): Promise<Metadata> {
  const { city: citySlug, food: foodSlug } = await params;
  const city = cityBySlug(citySlug);
  const food = foodBySlug(foodSlug);
  if (!city || !food) return {};

  return {
    title: `${food.name} in ${city.searchName} | Craves`,
    description: `Find ${food.name.toLowerCase()} and related homemade food options from Craves home chefs in ${city.searchName}.`,
    keywords: seoKeywords(city, food),
    alternates: { canonical: cityFoodUrl(city, food) },
    openGraph: {
      title: `${food.name} in ${city.searchName} from Craves`,
      description: food.description,
      url: cityFoodUrl(city, food),
      siteName: "Craves",
      type: "website",
    },
  };
}

export default async function CityFoodPage({ params }: CityFoodPageProps) {
  const { city: citySlug, food: foodSlug } = await params;
  const city = cityBySlug(citySlug);
  const food = foodBySlug(foodSlug);
  if (!city || !food) notFound();

  return <LocalDiscoveryPage city={city} food={food} mode="city-food" />;
}
