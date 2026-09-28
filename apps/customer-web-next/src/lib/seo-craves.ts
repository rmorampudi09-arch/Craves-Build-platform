export const siteUrl = "https://craves.in";
export const cravesLogoUrl = `${siteUrl}/brand/craves-logo-20260805.png`;

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
      "Jubilee Hills",
      "Banjara Hills",
      "Kondapur",
      "Secunderabad",
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

export function cityFoodUrl(city: LaunchCity, food: FoodIntent): string {
  return `${siteUrl}/${city.slug}/${food.slug}`;
}

export function foodUrl(food: FoodIntent): string {
  return `${siteUrl}/food/${food.slug}`;
}

export function seoKeywords(city?: LaunchCity, food?: FoodIntent): string[] {
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
        sameAs: [siteUrl],
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

export function cityStructuredData(city: LaunchCity, food?: FoodIntent) {
  const url = food ? cityFoodUrl(city, food) : cityUrl(city);
  const name = food
    ? `Craves ${food.name} in ${city.searchName}`
    : `Craves homemade food in ${city.searchName}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Restaurant",
        "@id": `${url}#restaurant`,
        name,
        url,
        image: cravesLogoUrl,
        servesCuisine: food
          ? [food.name, food.category, "Homemade food", "Indian food"]
          : ["Homemade food", "Indian food", "Home-cooked meals"],
        priceRange: "₹₹",
        menu: `${siteUrl}/products-pricing`,
        areaServed: {
          "@type": "City",
          name: city.searchName,
          address: {
            "@type": "PostalAddress",
            addressRegion: city.state,
            addressCountry: city.country,
          },
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: city.latitude,
          longitude: city.longitude,
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: `Does Craves cover ${city.searchName}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `${city.searchName} is one of the primary Craves launch cities for homemade food discovery and home-chef ordering.`,
            },
          },
          {
            "@type": "Question",
            name: food ? `Can I find ${food.name} on Craves?` : "What can I find on Craves?",
            acceptedAnswer: {
              "@type": "Answer",
              text: food
                ? `Craves helps customers discover ${food.name.toLowerCase()} and related home-chef food options where approved kitchens are available.`
                : "Craves helps customers discover homemade meals, chef kitchens, live pricing, ordering, payment, and delivery-supported workflows.",
            },
          },
        ],
      },
    ],
  };
}
