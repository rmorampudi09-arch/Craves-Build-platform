import chickenBiryani from "@/assets/images/food-chicken-biryani.jpg";
import vegBiryani from "@/assets/images/food-veg-biryani.jpg";
import thali from "@/assets/images/food-thali.jpg";
import chickenCurry from "@/assets/images/food-chicken-curry.jpg";
import paneer from "@/assets/images/food-paneer.jpg";
import dosa from "@/assets/images/food-dosa.jpg";
import mutton from "@/assets/images/food-mutton.jpg";
import curdrice from "@/assets/images/food-curdrice.jpg";
import rajma from "@/assets/images/food-rajma.jpg";
import idli from "@/assets/images/food-idli.jpg";
import fish from "@/assets/images/food-fish.jpg";
import chole from "@/assets/images/food-chole.jpg";
import eggBiryani from "@/assets/images/food-eggbiryani.jpg";
import pongal from "@/assets/images/food-pongal.jpg";
import paratha from "@/assets/images/food-paratha.jpg";
import prawn from "@/assets/images/food-prawn.jpg";
import type {
  NearbyMenuDiscovery,
  NearbyMenuItem,
} from "@/lib/discovery-contract";
import { assetUrl } from "@/lib/asset-url";
import { candidateDiscoveryRadii } from "@/lib/catalog-discovery-policy";
export type Dish = {
  id: string;
  name: string;
  chef: string;
  category: string;
  img: string;
  price: number;
  rating: number;
  time: string;
  veg: boolean;
  tag?: string;
  desc: string;
  ingredients?: string[];
  serves?: string;
  originalPrice?: number;
  spiceLevel?: "Mild" | "Medium" | "Hot";
  reviewCount?: number;
  reviews?: { name: string; rating: number; daysAgo: number; text: string }[];
  kitchenId?: string;
  currency?: string;
  distanceMeters?: number;
  areaName?: string;
  city?: string;
  state?: string;
};
export const DISHES: Dish[] = [
  {
    id: "1",
    name: "Hyderabadi Chicken Biryani",
    chef: "Aunty Fatima",
    category: "Biryani",
    img: assetUrl(chickenBiryani),
    price: 240,
    rating: 4.8,
    time: "35 min",
    veg: false,
    tag: "Bestseller",
    desc: "Slow-dum cooked with fragrant basmati, saffron and marinated chicken.",
    ingredients: [
      "Basmati rice",
      "Chicken",
      "Saffron",
      "Ghee",
      "Whole spices",
      "Fried onions",
      "Mint & coriander",
    ],
    serves: "1–2 people",
    originalPrice: 300,
    spiceLevel: "Medium",
    reviewCount: 219,
    reviews: [
      {
        name: "Ananya Rao",
        rating: 5,
        daysAgo: 2,
        text: "Tastes just like homemade food. Loved it.",
      },
      {
        name: "Kiran Kumar",
        rating: 4,
        daysAgo: 6,
        text: "Generous portion and great flavour, will order again.",
      },
    ],
  },
  {
    id: "2",
    name: "Veg Dum Biryani",
    chef: "Priya's Kitchen",
    category: "Veg Biryani",
    img: assetUrl(vegBiryani),
    price: 180,
    rating: 4.7,
    time: "30 min",
    veg: true,
    tag: "Chef Special",
    desc: "Colourful veggies, whole spices and cashews slow-cooked in a clay pot.",
    ingredients: [
      "Basmati rice",
      "Mixed vegetables",
      "Cashews",
      "Ghee",
      "Biryani masala",
      "Mint",
    ],
    serves: "1–2 people",
    originalPrice: 225,
    spiceLevel: "Medium",
    reviewCount: 217,
    reviews: [
      {
        name: "Kiran Kumar",
        rating: 5,
        daysAgo: 2,
        text: "Generous portion and great flavour, will order again.",
      },
      {
        name: "Rohit Verma",
        rating: 4,
        daysAgo: 6,
        text: "Super tasty and aromatic! Perfectly cooked.",
      },
    ],
  },
  {
    id: "3",
    name: "Andhra Meals (Thali)",
    chef: "Lakshmi Amma",
    category: "Meals",
    img: assetUrl(thali),
    price: 160,
    rating: 4.9,
    time: "25 min",
    veg: true,
    tag: "Home Fav",
    desc: "Rice, sambar, rasam, 2 curries, curd, papad & sweet on banana leaf.",
    ingredients: [
      "Rice",
      "Sambar",
      "Rasam",
      "2 curries",
      "Curd",
      "Papad",
      "Sweet",
    ],
    serves: "1 person",
    originalPrice: 200,
    spiceLevel: "Mild",
    reviewCount: 229,
    reviews: [
      {
        name: "Rohit Verma",
        rating: 5,
        daysAgo: 2,
        text: "Super tasty and aromatic! Perfectly cooked.",
      },
      {
        name: "Ananya Rao",
        rating: 4,
        daysAgo: 6,
        text: "Tastes just like homemade food. Loved it.",
      },
    ],
  },
  {
    id: "4",
    name: "Home-style Chicken Curry",
    chef: "Shanti Aunty",
    category: "Curry",
    img: assetUrl(chickenCurry),
    price: 220,
    rating: 4.6,
    time: "40 min",
    veg: false,
    desc: "Rich onion-tomato masala the way mom makes it. Pairs with rice or roti.",
    ingredients: ["Chicken", "Onion", "Tomato", "Ginger-garlic", "Home masala"],
    serves: "1–2 people",
    originalPrice: 275,
    spiceLevel: "Hot",
    reviewCount: 218,
    reviews: [
      {
        name: "Ananya Rao",
        rating: 5,
        daysAgo: 2,
        text: "Tastes just like homemade food. Loved it.",
      },
      {
        name: "Kiran Kumar",
        rating: 4,
        daysAgo: 6,
        text: "Generous portion and great flavour, will order again.",
      },
    ],
  },
  {
    id: "5",
    name: "Paneer Butter Masala",
    chef: "Rekha's Rasoi",
    category: "Curry",
    img: assetUrl(paneer),
    price: 200,
    rating: 4.7,
    time: "30 min",
    veg: true,
    desc: "Creamy tomato gravy, soft paneer cubes and hot butter naan.",
    ingredients: ["Paneer", "Tomato", "Butter", "Cream", "Cashew paste"],
    serves: "1–2 people",
    originalPrice: 250,
    spiceLevel: "Medium",
    reviewCount: 226,
    reviews: [
      {
        name: "Kiran Kumar",
        rating: 5,
        daysAgo: 2,
        text: "Generous portion and great flavour, will order again.",
      },
      {
        name: "Rohit Verma",
        rating: 4,
        daysAgo: 6,
        text: "Super tasty and aromatic! Perfectly cooked.",
      },
    ],
  },
  {
    id: "6",
    name: "Ghee Roast Dosa & Sambar",
    chef: "Kamala Ammi",
    category: "Tiffin",
    img: assetUrl(dosa),
    price: 90,
    rating: 4.8,
    time: "20 min",
    veg: true,
    tag: "Breakfast",
    desc: "Crispy dosa served with hot sambar and fresh coconut chutney.",
    ingredients: ["Dosa batter", "Ghee", "Sambar", "Coconut chutney"],
    serves: "1 person",
    originalPrice: 110,
    spiceLevel: "Mild",
    reviewCount: 234,
    reviews: [
      {
        name: "Rohit Verma",
        rating: 5,
        daysAgo: 2,
        text: "Super tasty and aromatic! Perfectly cooked.",
      },
      {
        name: "Ananya Rao",
        rating: 4,
        daysAgo: 6,
        text: "Tastes just like homemade food. Loved it.",
      },
    ],
  },
  {
    id: "7",
    name: "Mutton Curry with Roti",
    chef: "Nani's Kitchen",
    category: "Curry",
    img: assetUrl(mutton),
    price: 280,
    rating: 4.9,
    time: "45 min",
    veg: false,
    tag: "Spicy",
    desc: "Slow-simmered mutton in a deep, spice-forward home masala.",
    ingredients: ["Mutton", "Onion", "Home garam masala", "2 rotis"],
    serves: "1–2 people",
    originalPrice: 350,
    spiceLevel: "Hot",
    reviewCount: 241,
    reviews: [
      {
        name: "Ananya Rao",
        rating: 5,
        daysAgo: 2,
        text: "Tastes just like homemade food. Loved it.",
      },
      {
        name: "Kiran Kumar",
        rating: 4,
        daysAgo: 6,
        text: "Generous portion and great flavour, will order again.",
      },
    ],
  },
  {
    id: "8",
    name: "Curd Rice with Tadka",
    chef: "Meena Amma",
    category: "Meals",
    img: assetUrl(curdrice),
    price: 110,
    rating: 4.6,
    time: "15 min",
    veg: true,
    desc: "Cooling curd rice tempered with curry leaves, pomegranate on top.",
    ingredients: ["Rice", "Curd", "Curry leaves", "Mustard", "Pomegranate"],
    serves: "1 person",
    originalPrice: 140,
    spiceLevel: "Mild",
    reviewCount: 230,
    reviews: [
      {
        name: "Kiran Kumar",
        rating: 5,
        daysAgo: 2,
        text: "Generous portion and great flavour, will order again.",
      },
      {
        name: "Rohit Verma",
        rating: 4,
        daysAgo: 6,
        text: "Super tasty and aromatic! Perfectly cooked.",
      },
    ],
  },
  {
    id: "9",
    name: "Rajma Chawal",
    chef: "Sunita Ji",
    category: "Meals",
    img: assetUrl(rajma),
    price: 150,
    rating: 4.7,
    time: "25 min",
    veg: true,
    desc: "Punjabi-style kidney bean curry, slow-cooked & served with steamed rice.",
    ingredients: ["Rajma", "Rice", "Onion", "Tomato", "Punjabi masala"],
    serves: "1 person",
    originalPrice: 190,
    spiceLevel: "Mild",
    reviewCount: 238,
    reviews: [
      {
        name: "Rohit Verma",
        rating: 5,
        daysAgo: 2,
        text: "Super tasty and aromatic! Perfectly cooked.",
      },
      {
        name: "Ananya Rao",
        rating: 4,
        daysAgo: 6,
        text: "Tastes just like homemade food. Loved it.",
      },
    ],
  },
  {
    id: "10",
    name: "Idli Sambar Combo",
    chef: "Kamala Ammi",
    category: "Tiffin",
    img: assetUrl(idli),
    price: 80,
    rating: 4.8,
    time: "15 min",
    veg: true,
    tag: "Breakfast",
    desc: "Fluffy steamed idlis with hot sambar and coconut chutney.",
    ingredients: ["Idli (4)", "Sambar", "Coconut chutney"],
    serves: "1 person",
    originalPrice: 100,
    spiceLevel: "Mild",
    reviewCount: 246,
    reviews: [
      {
        name: "Ananya Rao",
        rating: 5,
        daysAgo: 2,
        text: "Tastes just like homemade food. Loved it.",
      },
      {
        name: "Kiran Kumar",
        rating: 4,
        daysAgo: 6,
        text: "Generous portion and great flavour, will order again.",
      },
    ],
  },
  {
    id: "11",
    name: "Andhra Fish Curry",
    chef: "Padma Aunty",
    category: "Curry",
    img: assetUrl(fish),
    price: 260,
    rating: 4.7,
    time: "35 min",
    veg: false,
    tag: "Coastal",
    desc: "Tangy tamarind fish curry, mustard tempered, served with rice.",
    ingredients: ["Fish", "Tamarind", "Mustard", "Curry leaves", "Rice"],
    serves: "1–2 people",
    originalPrice: 325,
    spiceLevel: "Hot",
    reviewCount: 244,
    reviews: [
      {
        name: "Kiran Kumar",
        rating: 5,
        daysAgo: 2,
        text: "Generous portion and great flavour, will order again.",
      },
      {
        name: "Rohit Verma",
        rating: 4,
        daysAgo: 6,
        text: "Super tasty and aromatic! Perfectly cooked.",
      },
    ],
  },
  {
    id: "12",
    name: "Chole Bhature",
    chef: "Simran Kaur",
    category: "Meals",
    img: assetUrl(chole),
    price: 140,
    rating: 4.6,
    time: "25 min",
    veg: true,
    desc: "Spicy chickpea curry with fluffy fried bhature and pickled onions.",
    ingredients: ["Chole", "Bhature (2)", "Pickled onions"],
    serves: "1 person",
    originalPrice: 175,
    spiceLevel: "Mild",
    reviewCount: 242,
    reviews: [
      {
        name: "Rohit Verma",
        rating: 5,
        daysAgo: 2,
        text: "Super tasty and aromatic! Perfectly cooked.",
      },
      {
        name: "Ananya Rao",
        rating: 4,
        daysAgo: 6,
        text: "Tastes just like homemade food. Loved it.",
      },
    ],
  },
  {
    id: "13",
    name: "Egg Biryani",
    chef: "Aunty Fatima",
    category: "Biryani",
    img: assetUrl(eggBiryani),
    price: 190,
    rating: 4.7,
    time: "30 min",
    veg: false,
    desc: "Fragrant biryani rice topped with masala-boiled eggs.",
    ingredients: ["Basmati rice", "Eggs (2)", "Biryani masala", "Ghee"],
    serves: "1 person",
    originalPrice: 240,
    spiceLevel: "Medium",
    reviewCount: 250,
    reviews: [
      {
        name: "Ananya Rao",
        rating: 5,
        daysAgo: 2,
        text: "Tastes just like homemade food. Loved it.",
      },
      {
        name: "Kiran Kumar",
        rating: 4,
        daysAgo: 6,
        text: "Generous portion and great flavour, will order again.",
      },
    ],
  },
  {
    id: "14",
    name: "Ghee Pongal",
    chef: "Meena Amma",
    category: "Tiffin",
    img: assetUrl(pongal),
    price: 100,
    rating: 4.7,
    time: "20 min",
    veg: true,
    tag: "Comfort",
    desc: "Creamy rice-moong porridge tempered with ghee, cashews and pepper.",
    ingredients: ["Rice", "Moong dal", "Ghee", "Cashews", "Pepper"],
    serves: "1 person",
    originalPrice: 125,
    spiceLevel: "Mild",
    reviewCount: 253,
    reviews: [
      {
        name: "Kiran Kumar",
        rating: 5,
        daysAgo: 2,
        text: "Generous portion and great flavour, will order again.",
      },
      {
        name: "Rohit Verma",
        rating: 4,
        daysAgo: 6,
        text: "Super tasty and aromatic! Perfectly cooked.",
      },
    ],
  },
  {
    id: "15",
    name: "Aloo Paratha & Curd",
    chef: "Sunita Ji",
    category: "Tiffin",
    img: assetUrl(paratha),
    price: 95,
    rating: 4.8,
    time: "20 min",
    veg: true,
    tag: "Breakfast",
    desc: "Stuffed potato paratha with a dollop of butter, curd & pickle.",
    ingredients: ["Aloo paratha (2)", "Butter", "Curd", "Pickle"],
    serves: "1 person",
    originalPrice: 120,
    spiceLevel: "Mild",
    reviewCount: 261,
    reviews: [
      {
        name: "Rohit Verma",
        rating: 5,
        daysAgo: 2,
        text: "Super tasty and aromatic! Perfectly cooked.",
      },
      {
        name: "Ananya Rao",
        rating: 4,
        daysAgo: 6,
        text: "Tastes just like homemade food. Loved it.",
      },
    ],
  },
  {
    id: "16",
    name: "Prawn Masala with Rice",
    chef: "Padma Aunty",
    category: "Curry",
    img: assetUrl(prawn),
    price: 290,
    rating: 4.8,
    time: "40 min",
    veg: false,
    tag: "Premium",
    desc: "Juicy prawns simmered in a rich coastal masala with steamed rice.",
    ingredients: ["Prawns", "Coastal masala", "Coconut", "Rice"],
    serves: "1 person",
    originalPrice: 360,
    spiceLevel: "Hot",
    reviewCount: 264,
    reviews: [
      {
        name: "Ananya Rao",
        rating: 5,
        daysAgo: 2,
        text: "Tastes just like homemade food. Loved it.",
      },
      {
        name: "Kiran Kumar",
        rating: 4,
        daysAgo: 6,
        text: "Generous portion and great flavour, will order again.",
      },
    ],
  },
];

let discoveredDishes: Dish[] = [];
let discoveryRadiusMeters = 5_000;

function fallbackImage(item: NearbyMenuItem): string {
  const name = `${item.category} ${item.itemName}`.toLowerCase();
  if (name.includes("biryani"))
    return item.foodType === "VEG"
      ? assetUrl(vegBiryani)
      : assetUrl(chickenBiryani);
  if (name.includes("dosa")) return assetUrl(dosa);
  if (name.includes("idli")) return assetUrl(idli);
  if (name.includes("paneer")) return assetUrl(paneer);
  if (name.includes("fish")) return assetUrl(fish);
  if (name.includes("prawn")) return assetUrl(prawn);
  if (name.includes("mutton")) return assetUrl(mutton);
  if (name.includes("curry"))
    return item.foodType === "VEG" ? assetUrl(paneer) : assetUrl(chickenCurry);
  return assetUrl(thali);
}

function mapNearbyItem(item: NearbyMenuItem): Dish {
  return {
    id: item.id,
    kitchenId: item.kitchenId,
    name: item.itemName,
    chef: item.kitchenDisplayName || item.kitchenName,
    category: item.category,
    img: item.primaryImageUrl || fallbackImage(item),
    price: item.price,
    currency: item.currency,
    rating: 0,
    time: item.preparationTimeMinutes
      ? `${item.preparationTimeMinutes} min`
      : "Freshly prepared",
    veg: item.foodType === "VEG",
    desc:
      item.description ||
      "Fresh homemade food prepared by a verified Craves kitchen.",
    serves: item.servesCount
      ? `${item.servesCount} ${item.servesCount === 1 ? "person" : "people"}`
      : undefined,
    spiceLevel:
      item.spiceLevel === "SPICY"
        ? "Hot"
        : item.spiceLevel === "MILD"
          ? "Mild"
          : item.spiceLevel === "MEDIUM"
            ? "Medium"
            : undefined,
    distanceMeters: item.distanceMeters,
    areaName: item.areaName ?? undefined,
    city: item.city,
    state: item.state,
  };
}

export async function discoverDishes(
  latitude: number,
  longitude: number,
  radiusMeters = 5_000,
): Promise<Dish[]> {
  for (const candidateRadius of candidateDiscoveryRadii(radiusMeters)) {
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      radiusMeters: String(candidateRadius),
      page: "0",
      size: "50",
    });
    const response = await fetch(`/api/discovery/menu-items?${query}`, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Nearby dishes are temporarily unavailable.");
    const payload = (await response.json()) as NearbyMenuDiscovery;
    discoveredDishes = payload.menuItems.map(mapNearbyItem);
    discoveryRadiusMeters = candidateRadius;
    if (discoveredDishes.length > 0) return discoveredDishes;
  }
  return discoveredDishes;
}

export function getDiscoveryRadiusMeters(): number {
  return discoveryRadiusMeters;
}

export function allDishes(): Dish[] {
  if (discoveredDishes.length > 0) return discoveredDishes;
  return process.env.NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK === "true"
    ? DISHES
    : [];
}

export function getDish(id: string): Dish | undefined {
  return allDishes().find((d) => d.id === id);
}

/** Up to `limit` other dishes in the same category, for the "Similar Dishes" rail. */
export function getSimilarDishes(dish: Dish, limit = 4): Dish[] {
  return allDishes()
    .filter((d) => d.id !== dish.id && d.category === dish.category)
    .slice(0, limit);
}
