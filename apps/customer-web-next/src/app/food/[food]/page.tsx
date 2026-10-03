import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalDiscoveryPage } from "@/components/seo/LocalDiscoveryPage";
import { foodBySlug, foodIntents, foodUrl, launchCities, seoKeywords } from "@/lib/seo-craves";

type FoodPageProps = {
  params: Promise<{ food: string }>;
};

export function generateStaticParams() {
  return foodIntents.map((food) => ({ food: food.slug }));
}

export async function generateMetadata({ params }: FoodPageProps): Promise<Metadata> {
  const { food: foodSlug } = await params;
  const food = foodBySlug(foodSlug);
  if (!food) return {};

  return {
    title: `${food.name} from home chefs | Craves`,
    description: `${food.description} Browse Craves across ${launchCities.map((city) => city.searchName).join(" and ")}.`,
    keywords: seoKeywords(undefined, food),
    alternates: { canonical: foodUrl(food) },
    openGraph: {
      title: `${food.name} from Craves home chefs`,
      description: food.description,
      url: foodUrl(food),
      siteName: "Craves",
      type: "website",
    },
  };
}

export default async function FoodPage({ params }: FoodPageProps) {
  const { food: foodSlug } = await params;
  const food = foodBySlug(foodSlug);
  if (!food) notFound();

  return <LocalDiscoveryPage food={food} mode="food" />;
}
