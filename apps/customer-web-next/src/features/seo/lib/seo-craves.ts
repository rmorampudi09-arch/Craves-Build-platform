export const siteUrl = "https://craves.in";
export const cravesLogoUrl = `${siteUrl}/brand/craves-logo-20260805.png`;
export const socialProfiles = [
  "https://www.instagram.com/craves.in_/",
  "https://www.youtube.com/@Craves_in",
  "https://www.facebook.com/profile.php?id=61594485405454",
  "https://www.linkedin.com/company/145186832/",
];
// Bump when SEO page copy changes; a lastmod that changes on every request is ignored by search engines.
export const seoContentUpdated = new Date("2026-11-14");
// Served by app/opengraph-image.tsx; child pages that set openGraph must list it or they lose the preview image.
export const shareImage = {
  url: `${siteUrl}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: "Craves – Homemade food from trusted home chefs",
};

export type LaunchCity = {
  slug: string;
  name: string;
  searchName: string;
  state: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  postalCode?: string;
  neighborhoods: string[];
};

export type FoodIntent = {
  slug: string;
  name: string;
  category: string;
  phrases: string[];
  description: string;
};

export const launchCities: LaunchCity[] = [
  {
    slug: "hyderabad",
    name: "Hyderabad",
    searchName: "Hyderabad",
    state: "Telangana",
    region: "IN-TG",
    country: "IN",
    latitude: 17.385,
    longitude: 78.4867,
    neighborhoods: [
      "HITEC City",
      "Gachibowli",
      "Madhapur",
      "Kondapur",
      "Kukatpally",
      "KPHB Colony",
      "Miyapur",
      "Nizampet",
      "Bachupally",
      "Manikonda",
      "Narsingi",
      "Financial District",
      "Nanakramguda",
      "Tolichowki",
      "Mehdipatnam",
      "Jubilee Hills",
      "Banjara Hills",
      "Ameerpet",
      "Begumpet",
      "SR Nagar",
      "Somajiguda",
      "Panjagutta",
      "Khairatabad",
      "Himayatnagar",
      "Abids",
      "Koti",
      "Charminar",
      "Old City",
      "Secunderabad",
      "Tarnaka",
      "Habsiguda",
      "Uppal",
      "Nacharam",
      "Malkajgiri",
      "ECIL",
      "Kompally",
      "Alwal",
      "Dilsukhnagar",
      "LB Nagar",
      "Kothapet",
      "Vanasthalipuram",
      "Attapur",
      "Rajendranagar",
      "Shamshabad",
      "Chandanagar",
      "Lingampally",
      "Kokapet",
      "Pragathi Nagar",
      "Moosapet",
      "Sainikpuri",
      "AS Rao Nagar",
      "Boduppal",
      "Pocharam",
    ],
  },
  {
    slug: "bangalore",
    name: "Bangalore",
    searchName: "Bangalore and Bengaluru",
    state: "Karnataka",
    region: "IN-KA",
    country: "IN",
    latitude: 12.9716,
    longitude: 77.5946,
    neighborhoods: [
      "Indiranagar",
      "Koramangala",
      "Whitefield",
      "HSR Layout",
      "Marathahalli",
      "Electronic City",
      "Jayanagar",
      "BTM Layout",
      "JP Nagar",
      "Bellandur",
      "Sarjapur Road",
      "Hebbal",
      "Yelahanka",
      "Malleshwaram",
      "Rajajinagar",
      "Banashankari",
      "Bannerghatta Road",
    ],
  },
];

export const foodIntents: FoodIntent[] = [
  {
    slug: "homemade-food",
    name: "Homemade food",
    category: "Marketplace",
    phrases: ["homemade food near me", "home cooked food", "home chef meals"],
    description: "Fresh meals from trusted home chefs, with ordering and payment handled through Craves.",
  },
  {
    slug: "biryani",
    name: "Biryani",
    category: "Rice dishes",
    phrases: ["homemade biryani", "chicken biryani", "veg biryani"],
    description: "Home-style biryani options from approved kitchens and chefs on Craves.",
  },
  {
    slug: "breakfast",
    name: "Breakfast",
    category: "Meal time",
    phrases: ["homemade breakfast", "breakfast near me", "tiffin breakfast"],
    description: "Morning food options, breakfast plates, and tiffin-style meals from home chefs.",
  },
  {
    slug: "lunch",
    name: "Lunch",
    category: "Meal time",
    phrases: ["homemade lunch", "lunch meals", "office lunch"],
    description: "Lunch meals and prepared plates for customers looking for home-cooked food.",
  },
  {
    slug: "dinner",
    name: "Dinner",
    category: "Meal time",
    phrases: ["homemade dinner", "dinner meals", "home cooked dinner"],
    description: "Dinner options from home kitchens, with checkout through the Craves marketplace.",
  },
  {
    slug: "tiffin",
    name: "Tiffin",
    category: "Indian meals",
    phrases: ["tiffin service", "homemade tiffin", "daily tiffin"],
    description: "Tiffin-style food and daily meal options prepared by home chefs.",
  },
  {
    slug: "andhra-meals",
    name: "Andhra meals",
    category: "South Indian",
    phrases: ["andhra meals", "andhra home food", "telugu home style meals"],
    description: "Andhra and Telugu home-style meals, pappu, curries and rice plates from home kitchens.",
  },
  {
    slug: "north-indian-meals",
    name: "North Indian meals",
    category: "Indian meals",
    phrases: ["north indian home food", "dal roti sabzi", "punjabi home food"],
    description: "Dal, roti, sabzi and North Indian home-style thalis from home chefs.",
  },
  {
    slug: "veg-meals",
    name: "Veg meals",
    category: "Dietary",
    phrases: ["veg meals", "vegetarian food", "home cooked veg food"],
    description: "Vegetarian home-chef meals and dishes discoverable through Craves.",
  },
  {
    slug: "non-veg-meals",
    name: "Non-veg meals",
    category: "Dietary",
    phrases: ["non veg meals", "home cooked chicken", "homemade non veg food"],
    description: "Non-vegetarian home-chef dishes and meal options from approved kitchens.",
  },
  {
    slug: "healthy-meals",
    name: "Healthy meals",
    category: "Dietary",
    phrases: ["healthy meals", "healthy homemade food", "home chef healthy food"],
    description: "Cleaner everyday meal options and home-cooked plates for regular eating.",
  },
  {
    slug: "dosa-idli",
    name: "Dosa and idli",
    category: "South Indian",
    phrases: ["dosa near me", "idli near me", "south indian breakfast"],
    description: "South Indian breakfast and snack options from home kitchens.",
  },
  {
    slug: "chapati-curry",
    name: "Chapati and curry",
    category: "Indian meals",
    phrases: ["chapati curry", "roti curry", "homemade curry"],
    description: "Everyday chapati, roti, curry, and home-style Indian meal options.",
  },
  {
    slug: "snacks",
    name: "Snacks",
    category: "Snacks",
    phrases: ["homemade snacks", "evening snacks", "snacks near me"],
    description: "Snacks and light bites prepared by home chefs and listed through Craves.",
  },
  {
    slug: "sweets",
    name: "Sweets",
    category: "Desserts",
    phrases: ["homemade sweets", "Indian sweets", "festival sweets"],
    description: "Homemade sweets and dessert options from approved Craves kitchens.",
  },
  {
    slug: "meal-subscriptions",
    name: "Meal subscriptions",
    category: "Subscriptions",
    phrases: ["meal subscription", "daily meals", "weekly meal plan"],
    description: "Recurring meal plans and subscription-style home-chef food discovery.",
  },
];

export function cityBySlug(slug: string): LaunchCity | undefined {
  return launchCities.find((city) => city.slug === slug);
}

export function foodBySlug(slug: string): FoodIntent | undefined {
  return foodIntents.find((food) => food.slug === slug);
}

export function cityUrl(city: LaunchCity): string {
  return `${siteUrl}/${city.slug}`;
}

export function areaSlug(area: string): string {
  return area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function areaBySlug(city: LaunchCity, slug: string): string | undefined {
  return city.neighborhoods.find((area) => areaSlug(area) === slug);
}

// Area pages share the /[city]/[slug] route with food pages; slugs never overlap (see seo-geo-contract.test.ts).
export function cityAreaUrl(city: LaunchCity, area: string): string {
  return `${siteUrl}/${city.slug}/${areaSlug(area)}`;
}

export function cityFoodUrl(city: LaunchCity, food: FoodIntent): string {
  return `${siteUrl}/${city.slug}/${food.slug}`;
}

export function foodUrl(food: FoodIntent): string {
  return `${siteUrl}/food/${food.slug}`;
}

// Bing flagged the old one-line text as too short; this stays between 120 and 160 characters (tested).
export function cityFoodDescription(city: LaunchCity, food: FoodIntent): string {
  return `${food.name} in ${city.name} from verified home chefs cooking in their own kitchens. Pay securely, track every order and get help from Craves.`;
}

export function seoKeywords(city?: LaunchCity, food?: FoodIntent, area?: string): string[] {
  const base = [
    "Craves",
    "homemade food",
    "home chefs",
    "home cooked meals",
    "food delivery",
    "meal subscriptions",
  ];
  return [
    ...base,
    ...(city ? [city.name, city.searchName, ...city.neighborhoods] : []),
    ...(food ? [food.name, food.category, ...food.phrases] : []),
    ...(area
      ? [
          `homemade food in ${area}`,
          `home cooked food ${area}`,
          `food delivery ${area}`,
          `best food in ${area}`,
          `tiffin service ${area}`,
          `biryani in ${area}`,
        ]
      : city
        ? [
            `best homemade food in ${city.name}`,
            `food near me ${city.name}`,
            `home food delivery ${city.name}`,
            `tiffin service ${city.name}`,
          ]
        : []),
  ];
}

export function cravesSiteGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "Craves",
        url: siteUrl,
        logo: cravesLogoUrl,
        areaServed: launchCities.map((city) => ({
          "@type": "City",
          name: city.searchName,
          address: {
            "@type": "PostalAddress",
            addressRegion: city.state,
            addressCountry: city.country,
          },
        })),
        sameAs: socialProfiles,
        email: "support@craves.in",
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "support@craves.in",
          telephone: "+91-8367366787",
          areaServed: "IN",
        },
        description:
          "Craves is a homemade food marketplace in Hyderabad and Bangalore. Every dish is cooked by a verified home chef in their own kitchen, and Craves checks each chef's documents and FSSAI registration before their food goes live. Customers order biryani, tiffin, everyday meals and meal plans, pay through secure checkout and track every order. Home chefs set their own menus and prices and are paid to their bank accounts.",
        knowsAbout: ["Homemade food", "Home chefs", "Home-cooked meals", "Hyderabadi biryani", "Tiffin service", "Meal subscriptions", "FSSAI-registered home kitchens", "Home-based food business"],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: "Craves",
        url: siteUrl,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: "en-IN",
        potentialAction: {
          "@type": "SearchAction",
          target: `${siteUrl}/home?query={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

// Neighbors in the (roughly geographic) list order, so every area page links to a different set.
export function nearbyAreas(city: LaunchCity, area: string, count = 6): string[] {
  const index = city.neighborhoods.indexOf(area);
  if (index < 0) return [];
  const half = Math.floor(count / 2);
  const start = Math.max(0, Math.min(index - half, city.neighborhoods.length - count - 1));
  return city.neighborhoods.slice(start, start + count + 1).filter((item) => item !== area);
}

// Rendered on the page and in FAQPage schema; Google requires the two to match.
export function localFaq(city: LaunchCity, food?: FoodIntent, area?: string) {
  const place = area ? `${area}, ${city.name}` : city.searchName;
  const dish = food ? food.name.toLowerCase() : "homemade food";
  return [
    {
      question: `Where can I order ${dish} in ${place}?`,
      answer: `On Craves (craves.in), a homemade food marketplace for ${place}. Browse trusted home chefs near you, order fresh home-cooked ${dish}, pay securely and track your delivery.`,
    },
    {
      question: `Does Craves deliver in ${place}?`,
      answer: area
        ? `Yes. Craves serves ${area} and nearby localities as part of ${city.name}, one of its primary cities. Open craves.in/home and set your address to see the kitchens cooking near you right now.`
        : `Yes. ${city.searchName} is one of the primary Craves cities. Open craves.in/home and set your address to see the kitchens cooking near you right now.`,
    },
    {
      question: food ? `What kind of ${dish} can I find on Craves?` : "What food can I order on Craves?",
      answer: food
        ? `${food.description} What you see depends on which approved home kitchens near you are cooking today.`
        : "Home-style biryani, breakfast and tiffin, lunch and dinner meals, veg and non-veg curries, healthy meals, snacks, sweets and weekly meal subscriptions, all cooked by approved home chefs.",
    },
    {
      question: "Are Craves home chefs verified?",
      answer: "Yes. Every Craves home chef goes through an application and document review, and Craves verifies their FSSAI registration before any of their dishes go live. You can also see each chef's ratings and reviews before you order.",
    },
    {
      question: "Is it safe to pay on Craves?",
      answer: "Yes. You enter card and UPI details on Razorpay's secure checkout, not on Craves, and an order is confirmed only after the payment is verified on Craves' servers. Craves runs on Microsoft Azure in India with enterprise-grade security.",
    },
    {
      question: "How do I get help with an order?",
      answer: "Ask the Craves assistant on craves.in. It can check your order, open a support ticket or ask our team to call you back. You can also call +91 83673 66787 or email support@craves.in.",
    },
  ];
}

export function cityStructuredData(city: LaunchCity, food?: FoodIntent, area?: string) {
  const url = area ? cityAreaUrl(city, area) : food ? cityFoodUrl(city, food) : cityUrl(city);
  const place = area ? `${area}, ${city.name}` : city.searchName;
  const name = food
    ? `Craves ${food.name} in ${place}`
    : `Craves homemade food in ${place}`;
  const cityPlace = {
    "@type": "City",
    name: city.searchName,
    address: {
      "@type": "PostalAddress",
      addressLocality: city.name,
      addressRegion: city.state,
      addressCountry: city.country,
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        // A delivery service in the area, not a restaurant there: Craves has no premises in each locality.
        "@type": "Service",
        "@id": `${url}#service`,
        name,
        serviceType: food ? `Homemade ${food.name.toLowerCase()} delivery` : "Homemade food delivery",
        url,
        provider: { "@id": `${siteUrl}/#organization` },
        areaServed: area
          ? { "@type": "Place", name: place, containedInPlace: cityPlace }
          : cityPlace,
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: localFaq(city, food, area).map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Craves", item: siteUrl },
          { "@type": "ListItem", position: 2, name: city.name, item: cityUrl(city) },
          ...(area || food
            ? [{ "@type": "ListItem", position: 3, name: area ?? food?.name, item: url }]
            : []),
        ],
      },
    ],
  };
}
