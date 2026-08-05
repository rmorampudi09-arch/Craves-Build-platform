import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BrowseHeader } from "@/components/home/BrowseHeader";
import { WelcomeBanner } from "@/components/home/WelcomeBanner";
import { CategoryFilterChips } from "@/components/home/CategoryFilterChips";
import { DishesGrid } from "@/components/home/DishesGrid";
import { FloatingCartBar } from "@/components/home/FloatingCartBar";
import {
  ALL_DISHES_CATEGORY,
  type DishCategory,
} from "@/constants/dishCategories";
import {
  discoverDishes,
  getDiscoveryRadiusMeters,
  type Dish,
} from "@/services/api/dishes";
import { formatDiscoveryRadius } from "@/lib/catalog-discovery-policy";
import {
  clearSession,
  loadSelectedAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";
import { cartCount, loadCart, subscribeCart } from "@/services/api/cravesCart";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

export const routeMeta = {
  head: () => ({
    meta: [
      { title: "Discover Homemade Food – Craves" },
      {
        name: "description",
        content: "Discover live dishes from active Craves home kitchens near your delivery address.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
};

function BrowseFoodsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CravesUser | null>(null);
  const [address, setAddress] = useState<CravesAddress | null>(null);
  const [category, setCategory] = useState<DishCategory>(ALL_DISHES_CATEGORY);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItemCount, setCartItemCount] = useState(0);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>("loading");
  const [catalogMessage, setCatalogMessage] = useState("Loading your saved delivery location…");
  const [radiusLabel, setRadiusLabel] = useState<string | null>(null);

  const refreshDiscovery = useCallback(async (activeAddress: CravesAddress | null) => {
    if (
      typeof activeAddress?.lat !== "number" ||
      typeof activeAddress.lng !== "number"
    ) {
      setDishes([]);
      setRadiusLabel(null);
      setDiscoveryState("address-required");
      setCatalogMessage(
        "Save a delivery address with map coordinates. Craves uses those coordinates to request nearby active kitchens and menu items.",
      );
      return;
    }

    setDiscoveryState("loading");
    setCatalogMessage("Loading nearby active kitchens and dishes…");
    try {
      const nearby = await discoverDishes(activeAddress.lat, activeAddress.lng, 5_000);
      const usedRadius = getDiscoveryRadiusMeters();
      setDishes(nearby);
      setRadiusLabel(formatDiscoveryRadius(usedRadius));
      setDiscoveryState("ready");
      setCatalogMessage(
        nearby.length === 0
          ? `No active kitchens with sellable dishes were returned within ${formatDiscoveryRadius(usedRadius)} of this address.`
          : `Showing the live catalog within ${formatDiscoveryRadius(usedRadius)}.`,
      );
    } catch (error) {
      setDishes([]);
      setRadiusLabel(null);
      setDiscoveryState("error");
      setCatalogMessage(
        error instanceof Error
          ? error.message
          : "Nearby dishes are temporarily unavailable. No development catalog has been substituted.",
      );
    }
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const current = await loadSession();
      if (!active) return;
      if (!current) {
        navigate({ to: "/", replace: true });
        return;
      }
      setUser(current);

      try {
        const activeAddress = await loadSelectedAddress();
        if (!active) return;
        setAddress(activeAddress);
        await refreshDiscovery(activeAddress);
      } catch (error) {
        if (!active) return;
        setAddress(null);
        setDishes([]);
        setDiscoveryState("error");
        setCatalogMessage(
          error instanceof Error
            ? error.message
            : "Your saved delivery addresses could not be loaded.",
        );
      }

      try {
        await loadCart();
        if (active) setCartItemCount(cartCount());
      } catch {
        if (active) setCartItemCount(0);
      }
    })();

    const unsubscribeCart = subscribeCart(() => setCartItemCount(cartCount()));
    return () => {
      active = false;
      unsubscribeCart();
    };
  }, [navigate, refreshDiscovery]);

  const categories = useMemo<readonly DishCategory[]>(() => {
    const live = Array.from(
      new Set(dishes.map((dish) => dish.category.trim()).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));
    return [ALL_DISHES_CATEGORY, ...live];
  }, [dishes]);

  useEffect(() => {
    if (!categories.includes(category)) setCategory(ALL_DISHES_CATEGORY);
  }, [categories, category]);

  const filteredDishes = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("en-IN");
    return dishes.filter((dish) => {
      const categoryMatches =
        category === ALL_DISHES_CATEGORY || dish.category === category;
      const searchMatches =
        !term ||
        dish.name.toLocaleLowerCase("en-IN").includes(term) ||
        dish.chef.toLocaleLowerCase("en-IN").includes(term) ||
        dish.category.toLocaleLowerCase("en-IN").includes(term) ||
        dish.desc.toLocaleLowerCase("en-IN").includes(term);
      return categoryMatches && searchMatches;
    });
  }, [category, searchTerm, dishes]);

  const handleLogout = async () => {
    await clearSession();
    navigate({ to: "/" });
  };

  const locationLabel = address
    ? [address.hno, address.mandal, address.city].filter(Boolean).join(", ")
    : "Set delivery address";

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-sm font-medium text-muted-foreground" role="status">
          Loading your Craves session…
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-24 text-ink">
      <BrowseHeader
        user={user}
        locationLabel={locationLabel}
        onOpenLocation={() => navigate({ to: "/addresses" })}
        cartCount={cartItemCount}
        onOpenCart={() => navigate({ to: "/cart" })}
        onLogout={handleLogout}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      />
      <main>
        <WelcomeBanner
          firstName={user.firstName || user.username.split(" ")[0] || "there"}
          dishCount={dishes.length}
          radiusLabel={radiusLabel}
          hasAddress={Boolean(address?.lat != null && address?.lng != null)}
        />
        <CategoryFilterChips
          categories={categories}
          selected={category}
          onSelect={setCategory}
        />
        <DishesGrid
          dishes={filteredDishes}
          selectedCategory={category}
          searchTerm={searchTerm}
          state={discoveryState}
          message={catalogMessage}
          onRetry={() => void refreshDiscovery(address)}
          onManageAddress={() => navigate({ to: "/addresses" })}
        />
      </main>
      <FloatingCartBar
        itemCount={cartItemCount}
        onViewCart={() => navigate({ to: "/cart" })}
      />
    </div>
  );
}

export default BrowseFoodsPage;
