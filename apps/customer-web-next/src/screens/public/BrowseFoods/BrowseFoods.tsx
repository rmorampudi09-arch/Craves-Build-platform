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
  parseLocationRecommendation,
  type CustomerAddress,
} from "@/lib/address-contract";
import {
  clearSession,
  loadSelectedAddress,
  loadSession,
  saveAddress,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";
import { reverseGeocodeCurrentLocation } from "@/services/location/reverseGeocode";
import { cartCount, loadCart, subscribeCart } from "@/services/api/cravesCart";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";
const SAVED_ADDRESS_MATCH_RADIUS_METERS = 100;

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

function savedAddressToBrowsingLocation(address: CustomerAddress): CravesAddress | null {
  if (address.latitude == null || address.longitude == null || !address.areaName) return null;
  return {
    id: address.id,
    label: address.addressLabel,
    hno: address.addressLine1,
    street: address.addressLine2 ?? address.landmark ?? undefined,
    city: address.city,
    mandal: address.areaName,
    district: address.districtName ?? address.city,
    pincode: address.postalCode ?? undefined,
    lat: address.latitude,
    lng: address.longitude,
  };
}

function readCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location access is unavailable."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 30_000,
    });
  });
}

async function resolveLiveBrowsingLocation(
  fallback: CravesAddress | null,
): Promise<CravesAddress | null> {
  let position: GeolocationPosition;
  try {
    position = await readCurrentPosition();
  } catch {
    return fallback;
  }

  const latitude = Number(position.coords.latitude.toFixed(7));
  const longitude = Number(position.coords.longitude.toFixed(7));
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    matchRadiusMeters: String(SAVED_ADDRESS_MATCH_RADIUS_METERS),
  });

  try {
    const recommendationResponse = await fetch(
      `/api/customer/addresses/recommendation?${query}`,
      { cache: "no-store", credentials: "same-origin" },
    );
    if (recommendationResponse.ok) {
      const recommendation = parseLocationRecommendation(
        await recommendationResponse.json().catch(() => null),
      );
      if (recommendation?.selectedSavedAddress) {
        const matched = savedAddressToBrowsingLocation(recommendation.selectedSavedAddress);
        if (matched) {
          saveAddress(matched);
          return matched;
        }
      }
    }
  } catch {
    // A saved-address recommendation is an optimization. Once GPS succeeded,
    // discovery must continue from the live point even if this lookup fails.
  }

  try {
    const detected = await reverseGeocodeCurrentLocation(latitude, longitude);
    const live: CravesAddress = {
      label: "CURRENT LOCATION",
      hno: detected.houseNumber || detected.formattedAddress,
      street: detected.street ?? undefined,
      city: detected.city || "",
      mandal: detected.area || detected.city || "Current location",
      district: detected.district || detected.city || "",
      pincode: detected.postalCode ?? undefined,
      lat: latitude,
      lng: longitude,
    };
    saveAddress(live);
    return live;
  } catch {
    const liveWithoutAddress: CravesAddress = {
      label: "CURRENT LOCATION",
      hno: "Current location",
      city: "",
      mandal: "Current location",
      district: "",
      pincode: undefined,
      lat: latitude,
      lng: longitude,
    };
    saveAddress(liveWithoutAddress);
    return liveWithoutAddress;
  }
}

function BrowseFoodsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CravesUser | null>(null);
  const [address, setAddress] = useState<CravesAddress | null>(null);
  const [category, setCategory] = useState<DishCategory>(ALL_DISHES_CATEGORY);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItemCount, setCartItemCount] = useState(0);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>("loading");
  const [catalogMessage, setCatalogMessage] = useState("Detecting your current delivery location…");
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
        "Choose or save a delivery location so Craves can show nearby home food.",
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
          ? `No active kitchens with sellable dishes were returned within ${formatDiscoveryRadius(usedRadius)} of this location.`
          : `Showing the live catalog within ${formatDiscoveryRadius(usedRadius)} of your active location.`,
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
        const savedFallback = await loadSelectedAddress();
        if (!active) return;
        setAddress(savedFallback);
        setCatalogMessage(
          savedFallback
            ? "Checking whether you are still near your saved address…"
            : "Detecting your current delivery location…",
        );
        const activeLocation = await resolveLiveBrowsingLocation(savedFallback);
        if (!active) return;
        setAddress(activeLocation);
        await refreshDiscovery(activeLocation);
      } catch (error) {
        if (!active) return;
        setAddress(null);
        setDishes([]);
        setDiscoveryState("error");
        setCatalogMessage(
          error instanceof Error
            ? error.message
            : "Your delivery location could not be loaded.",
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
    ? [address.mandal, address.city].filter(Boolean).join(", ")
    : "Set delivery location";

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm font-medium text-muted-foreground" role="status">
          Loading your Craves session…
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24 text-ink">
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
