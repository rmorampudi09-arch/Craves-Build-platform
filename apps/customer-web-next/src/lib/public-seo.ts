import type { Metadata } from "next";

export const SITE_URL = "https://craves.in";
export const SITE_DESCRIPTION =
  "Discover homemade food from home chefs in Hyderabad with Craves. Explore meals and check kitchen availability and delivery for your address.";
export const SOCIAL_PROFILES = [
  "https://www.linkedin.com/company/craves-technologies-private-limited/",
  "https://www.facebook.com/profile.php?id=61594485405454",
  "https://www.instagram.com/craves.in_/",
];
export const PUBLIC_PAGES = [
  "/", "/homemade-food-hyderabad", "/home-chefs-hyderabad",
  "/products-pricing", "/contact", "/privacy", "/terms",
  "/refunds-cancellations", "/security",
] as const;

export function publicMetadata(title: string, description: string, path: string): Metadata {
  const url = new URL(path, SITE_URL).href;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true, "max-image-preview": "large" },
    openGraph: {
      type: "website", locale: "en_IN", siteName: "Craves", url,
      title: `${title} | Craves`, description,
      images: [{ url: `${SITE_URL}/landing-v20/images/craves-logo.png`, alt: "Craves" }],
    },
    twitter: {
      card: "summary", title: `${title} | Craves`, description,
      images: [`${SITE_URL}/landing-v20/images/craves-logo.png`],
    },
  };
}

export function breadcrumbData(name: string, path: string) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Craves", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
}
