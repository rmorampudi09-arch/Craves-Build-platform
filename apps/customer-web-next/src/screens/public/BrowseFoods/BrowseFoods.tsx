import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";

import { BrowseHeader } from "@/components/home/BrowseHeader";
import { WelcomeBanner } from "@/components/home/WelcomeBanner";
import { CategoryFilterChips } from "@/components/home/CategoryFilterChips";
import { DishesGrid } from "@/components/home/DishesGrid";
import { FloatingCartBar } from "@/components/home/FloatingCartBar";
import { LocationModal } from "@/components/layout/LocationModal";
import { DISH_CATEGORIES, type DishCategory } from "@/constants/dishCategories";
import { DISHES, discoverDishes, type Dish } from "@/services/api/dishes";
import {
  clearSession,
  getAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";
import { cartCount, subscribeCart } from "@/services/api/cravesCart";
import { wishlistCount, subscribeWishlist } from "@/services/api/cravesWishlist";

// Route metadata (head tags, etc.) consumed by src/routes/home.tsx
export const routeMeta = {
  head: () => ({
    meta: [
      { title: "Home Kitchen – Craves" },
      {
        name: "description",
        content:
          "Freshly cooked homemade meals, biryanis and curries by trusted home chefs near you.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
};

/**
 * Post-login "browse dishes" screen. All dish data comes from
 * src/services/api/dishes.ts (single source of truth — also used by
 * src/pages/public/FoodDetails/FoodDetails.tsx), and the screen itself is
 * composed of named pieces from src/components/home/.
 */
function BrowseFoodsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CravesUser | null>(null);
  const [address, setAddress] = useState<CravesAddress | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const [category, setCategory] = useState<DishCategory>(DISH_CATEGORIES[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItemCount, setCartItemCount] = useState(0);
  const [wishlistItemCount, setWishlistItemCount] = useState(0);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [catalogMessage, setCatalogMessage] = useState("Loading nearby homemade food…");

  const refreshDiscovery = async (activeAddress: CravesAddress | null) => {
    const latitude = activeAddress?.lat ?? 17.4483;
    const longitude = activeAddress?.lng ?? 78.3915;
    try {
      const nearby = await discoverDishes(latitude, longitude, 5_000);
      setDishes(nearby);
      setCatalogMessage(nearby.length === 0 ? "No active kitchens with available dishes were found within 5 km." : "");
    } catch {
      if (process.env.NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK === "true") {
        setDishes(DISHES);
        setCatalogMessage("Showing the development visual catalogue while Catalog/APIM is unavailable.");
      } else {
        setDishes([]);
        setCatalogMessage("Nearby dishes are temporarily unavailable. Please try again.");
      }
    }
  };

  useEffect(() => {
    let active = true;
    void loadSession().then((current) => {
      if (!active) return;
      if (!current) {
        navigate({ to: "/", replace: true });
        return;
      }
      setUser(current);
      const activeAddress = getAddress();
      setAddress(activeAddress);
      void refreshDiscovery(activeAddress);
      setCartItemCount(cartCount());
      setWishlistItemCount(wishlistCount());
    });
    const unsubCart = subscribeCart(() => setCartItemCount(cartCount()));
    const unsubWishlist = subscribeWishlist(() => setWishlistItemCount(wishlistCount()));
    return () => {
      active = false;
      unsubCart();
      unsubWishlist();
    };
  }, [navigate]);

  const filteredDishes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return dishes.filter(
      (d) =>
        (category === "All" || d.category === category) &&
        (!term || d.name.toLowerCase().includes(term) || d.chef.toLowerCase().includes(term)),
    );
  }, [category, searchTerm, dishes]);

  const handleLogout = async () => {
    await clearSession();
    navigate({ to: "/" });
  };

  const locationLabel = address
    ? `${address.hno ? address.hno + ", " : ""}${address.city}${address.mandal ? ", " + address.mandal : ""}`
    : "Set delivery address";

  if (!user) return null;

  return (
    <div className="min-h-screen bg-cream pb-24">
      <BrowseHeader
        user={user}
        locationLabel={locationLabel}
        onOpenLocation={() => setLocOpen(true)}
        cartCount={cartItemCount}
        onOpenCart={() => navigate({ to: "/cart" })}
        wishlistCount={wishlistItemCount}
        onLogout={handleLogout}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      />
      <WelcomeBanner firstName={user.username.split(" ")[0]} />
      <CategoryFilterChips selected={category} onSelect={setCategory} />
      {catalogMessage && <p className="mx-auto max-w-7xl px-4 pt-3 text-sm text-muted-foreground md:px-6">{catalogMessage}</p>}
      <DishesGrid dishes={filteredDishes} selectedCategory={category} searchTerm={searchTerm} />
      <FloatingCartBar itemCount={cartItemCount} onViewCart={() => navigate({ to: "/cart" })} />
      <LocationModal
        open={locOpen}
        onClose={() => setLocOpen(false)}
        onSaved={(a) => {
          setAddress(a);
          void refreshDiscovery(a);
        }}
      />
    </div>
  );
}

export default BrowseFoodsPage;
