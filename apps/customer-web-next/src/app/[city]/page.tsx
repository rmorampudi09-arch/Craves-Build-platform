import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalDiscoveryPage } from "@/components/seo/LocalDiscoveryPage";
import { cityBySlug, cityUrl, launchCities, seoKeywords } from "@/lib/seo-craves";

type CityPageProps = {
  params: Promise<{ city: string }>;
};

export function generateStaticParams() {
  return launchCities.map((city) => ({ city: city.slug }));
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { city: citySlug } = await params;
  const city = cityBySlug(citySlug);
  if (!city) return {};

  return {
    title: `Homemade food in ${city.searchName} | Craves`,
    description: `Find Craves homemade food, trusted home chefs, live dishes, secure checkout, and delivery-supported ordering in ${city.searchName}.`,
    keywords: seoKeywords(city),
    alternates: { canonical: cityUrl(city) },
    openGraph: {
      title: `Craves homemade food in ${city.searchName}`,
      description: `Discover home-chef meals and food options in ${city.searchName} with Craves.`,
      url: cityUrl(city),
      siteName: "Craves",
      type: "website",
    },
  };
}

export default async function CityPage({ params }: CityPageProps) {
  const { city: citySlug } = await params;
  const city = cityBySlug(citySlug);
  if (!city) notFound();

  return <LocalDiscoveryPage city={city} mode="city" />;
}
