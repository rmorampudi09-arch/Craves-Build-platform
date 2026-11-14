import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalDiscoveryPage } from "@/features/seo/components/LocalDiscoveryPage";
import {
  areaBySlug,
  areaSlug,
  cityAreaUrl,
  cityBySlug,
  cityFoodUrl,
  foodBySlug,
  foodIntents,
  launchCities,
  seoKeywords,
  shareImage,
} from "@/features/seo/lib/seo-craves";

// The second segment is either a food intent (/hyderabad/biryani) or a neighborhood (/hyderabad/gachibowli).
type CityFoodPageProps = {
  params: Promise<{ city: string; food: string }>;
};

export function generateStaticParams() {
  return launchCities.flatMap((city) => [
    ...foodIntents.map((food) => ({ city: city.slug, food: food.slug })),
    ...city.neighborhoods.map((area) => ({ city: city.slug, food: areaSlug(area) })),
  ]);
}

export async function generateMetadata({ params }: CityFoodPageProps): Promise<Metadata> {
  const { city: citySlug, food: slug } = await params;
  const city = cityBySlug(citySlug);
  if (!city) return {};

  const area = areaBySlug(city, slug);
  if (area) {
    const url = cityAreaUrl(city, area);
    return {
      title: `Homemade Food in ${area}, ${city.name} | Craves`,
      description: `Order fresh homemade meals, biryani, tiffin, lunch and dinner from trusted home chefs near ${area}, ${city.name} on Craves.`,
      keywords: seoKeywords(city, undefined, area),
      alternates: { canonical: url },
      openGraph: {
        images: [shareImage],
        title: `Homemade food in ${area}, ${city.name} | Craves`,
        description: `Fresh home-cooked meals from trusted home chefs near ${area}, ${city.name}.`,
        url,
        siteName: "Craves",
        locale: "en_IN",
        type: "website",
      },
    };
  }

  const food = foodBySlug(slug);
  if (!food) return {};

  return {
    title: `${food.name} in ${city.searchName} | Craves`,
    description: `Find ${food.name.toLowerCase()} and related homemade food options from Craves home chefs in ${city.searchName}.`,
    keywords: seoKeywords(city, food),
    alternates: { canonical: cityFoodUrl(city, food) },
    openGraph: {
      images: [shareImage],
      title: `${food.name} in ${city.searchName} from Craves`,
      description: food.description,
      url: cityFoodUrl(city, food),
      siteName: "Craves",
      type: "website",
    },
  };
}

export default async function CityFoodPage({ params }: CityFoodPageProps) {
  const { city: citySlug, food: slug } = await params;
  const city = cityBySlug(citySlug);
  if (!city) notFound();

  const area = areaBySlug(city, slug);
  if (area) return <LocalDiscoveryPage city={city} area={area} mode="city-area" />;

  const food = foodBySlug(slug);
  if (!food) notFound();

  return <LocalDiscoveryPage city={city} food={food} mode="city-food" />;
}
