import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalDiscoveryPage } from "@/features/seo/components/LocalDiscoveryPage";
import { cityBySlug, cityUrl, launchCities, seoKeywords, shareImage } from "@/features/seo/lib/seo-craves";

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
    title: `Best Homemade Food in ${city.name} – Order from Home Chefs | Craves`,
    description: `Order homemade food anywhere in ${city.searchName}: biryani, tiffin, breakfast, lunch and dinner from trusted home chefs near you, delivered by Craves.`,
    keywords: seoKeywords(city),
    alternates: { canonical: cityUrl(city) },
    openGraph: {
      images: [shareImage],
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
