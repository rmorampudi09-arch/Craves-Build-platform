import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { BrowseHeader } from "@/components/home/BrowseHeader";
import { WelcomeBanner } from "@/components/home/WelcomeBanner";
import { CategoryFilterChips } from "@/components/home/CategoryFilterChips";
import { DishesGrid } from "@/components/home/DishesGrid";
import { FloatingCartBar } from "@/components/home/FloatingCartBar";
import { DISH_CATEGORIES, type DishCategory } from "@/constants/dishCategories";
import { DISHES, discoverDishes, type Dish } from "@/services/api/dishes";
import {
  clearSession,
  loadSelectedAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";
import { cartCount, loadCart, subscribeCart } from "@/services/api/cravesCart";
import { wishlistCount, subscribeWishlist } from "@/services/api/cravesWishlist";

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

function BrowseFoodsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CravesUser | null>(null);
  const [address, setAddress] = useState<CravesAddress | null>(null);
  const [category, setCategory] = useState<DishCategory>(DISH_CATEGORIES[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItemCount, setCartItemCount] = useState(0);
  const [wishlistItemCount, setWishlistItemCount] = useState(0);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [catalogMessage, setCatalogMessage] = useState("Loading your saved delivery location…");

  const refreshDiscovery = async (activeAddress: CravesAddress | null) => {
    if (
      typeof activeAddress?.lat !== "number"
      || typeof activeAddress.lng !== "number"
    ) {
      setDishes([]);
      setCatalogMessage("Add a delivery address with map coordinates to see real kitchens near you.");
      return;
    }
    try {
      const nearby = await discoverDishes(activeAddress.lat, activeAddress.lng, 5_000);
      setDishes(nearby);
      setCatalogMessage(
        nearby.length === 0
          ? "No active kitchens with sellable dishes were found within 5 km of your saved address."
          : "",
      );
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
    void loadSession().then(async (current) => {
      if (!active) return;
      if (!current) {
        navigate({ to: "/", replace: true });
        return;
      }
      setUser(current);
      setWishlistItemCount(wishlistCount());

      try {
        const activeAddress = await loadSelectedAddress();
        if (!active) return;
        setAddress(activeAddress);
        await refreshDiscovery(activeAddress);
      } catch {
        if (!active) return;
        setAddress(null);
        setDishes([]);
        setCatalogMessage("Your saved delivery address could not be loaded. Open addresses and try again.");
      }

      await loadCart();
      if (active) setCartItemCount(cartCount());
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
      (dish) =>
        (category === "All" || dish.category === category)
        && (!term || dish.name.toLowerCase().includes(term) || dish.chef.toLowerCase().includes(term)),
    );
  }, [category, searchTerm, dishes]);

  const handleLogout = async () => {
    await clearSession();
    navigate({ to: "/" });
  };

  const locationLabel = address
    ? `${address.hno ? `${address.hno}, ` : ""}${address.city}${address.mandal ? `, ${address.mandal}` : ""}`
    : "Set delivery address";

  if (!user) return null;

  return (
    <div className="min-h-screen bg-cream pb-24">
      <BrowseHeader
        user={user}
        locationLabel={locationLabel}
        onOpenLocation={() => navigate({ to: "/addresses" })}
        cartCount={cartItemCount}
        onOpenCart={() => navigate({ to: "/cart" })}
        wishlistCount={wishlistItemCount}
        onLogout={handleLogout}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      />
      <WelcomeBanner firstName={user.username.split(" ")[0]} />
      <CategoryFilterChips selected={category} onSelect={setCategory} />
      {catalogMessage && (
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 pt-3 text-sm text-muted-foreground md:px-6">
          <p>{catalogMessage}</p>
          {!address && (
            <button
              type="button"
              onClick={() => navigate({ to: "/addresses" })}
              className="font-semibold text-primary hover:underline"
            >
              Manage delivery addresses
            </button>
          )}
        </div>
      )}
      <DishesGrid dishes={filteredDishes} selectedCategory={category} searchTerm={searchTerm} />
      <FloatingCartBar itemCount={cartItemCount} onViewCart={() => navigate({ to: "/cart" })} />
    </div>
  );
}

export default BrowseFoodsPage;
