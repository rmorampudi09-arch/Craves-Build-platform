import { DISHES, allDishes, type Dish } from "@/services/api/dishes";

export type Chef = {
  id: string;
  name: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  distanceKm: number;
  location: string;
  experienceYears: number;
  ordersDelivered: number;
  bio: string;
  specialties: string[];
  reviews: { name: string; rating: number; daysAgo: number; text: string }[];
};

const LOCATIONS = ["Jubilee Hills", "Banjara Hills", "Kondapur", "Madhapur", "Gachibowli"];

/** Turns "Aunty Fatima" into "aunty-fatima" — used as the chef's route id. */
export function slugifyChefName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function reviewPool(chefName: string) {
  const pool = [
    { name: "Ananya Rao", text: "Consistently delicious, my family's favourite home chef." },
    { name: "Rohit Verma", text: "Every dish tastes fresh and homemade. Highly recommend." },
    { name: "Kiran Kumar", text: "Great flavours and always on time. Will keep ordering." },
    { name: "Sneha Reddy", text: "Feels just like a home-cooked meal. Very hygienic too." },
  ];
  const seed = chefName.length;
  return [
    { ...pool[seed % pool.length], rating: 5, daysAgo: 3 },
    { ...pool[(seed + 1) % pool.length], rating: 4, daysAgo: 9 },
    { ...pool[(seed + 2) % pool.length], rating: 5, daysAgo: 15 },
  ];
}

function buildChef(name: string, dishes: Dish[]): Chef {
  const avgRating = dishes.reduce((sum, d) => sum + d.rating, 0) / dishes.length;
  const totalReviews = dishes.reduce((sum, d) => sum + (d.reviewCount ?? 0), 0);
  const specialties = Array.from(new Set(dishes.map((d) => d.category)));
  const seed = name.length;

  return {
    id: slugifyChefName(name),
    name,
    verified: true,
    rating: Math.round(avgRating * 10) / 10,
    reviewCount: totalReviews || 40 + seed * 5,
    distanceKm: Math.round((1.2 + (seed % 5) * 0.6) * 10) / 10,
    location: LOCATIONS[seed % LOCATIONS.length],
    experienceYears: 2 + (seed % 8),
    ordersDelivered: 300 + seed * 47,
    bio: `${name} has been cooking homemade ${specialties.join(", ").toLowerCase()} for the Craves community, using recipes passed down through the family and fresh ingredients sourced daily.`,
    specialties,
    reviews: reviewPool(name),
  };
}

/** One chef profile per unique dish.chef name, built from that chef's dishes. */
export const CHEFS: Chef[] = process.env.NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK === "true"
  ? Array.from(new Set(DISHES.map((dish) => dish.chef))).map((name) =>
      buildChef(
        name,
        DISHES.filter((dish) => dish.chef === name),
      ),
    )
  : [];

export function getChef(id: string): Chef | undefined {
  if (process.env.NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK !== "true") return undefined;
  const existing = CHEFS.find((chef) => chef.id === id);
  if (existing) return existing;
  const dishes = allDishes().filter((dish) => slugifyChefName(dish.chef) === id);
  return dishes.length > 0 ? buildChef(dishes[0].chef, dishes) : undefined;
}

export function getChefByName(name: string): Chef | undefined {
  return getChef(slugifyChefName(name));
}

export function getDishesByChef(chefName: string): Dish[] {
  return allDishes().filter((d) => d.chef === chefName);
}
