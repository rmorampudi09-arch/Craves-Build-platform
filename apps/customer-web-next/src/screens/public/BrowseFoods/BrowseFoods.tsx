import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin, Utensils } from "lucide-react";

import { BrowseHeader } from "@/components/home/BrowseHeader";
import { CategoryFilterChips } from "@/components/home/CategoryFilterChips";
import { DishesGrid } from "@/components/home/DishesGrid";
import { FloatingCartBar } from "@/components/home/FloatingCartBar";
import { HomeBottomSections } from "@/components/home/HomeBottomSections";
import {
  HomeCategoryRail,
  type CravingCategory,
} from "@/components/home/HomeCategoryRail";
import { KitchensGrid } from "@/components/home/KitchensGrid";
import { TodaysSpecial } from "@/components/home/TodaysSpecial";
import { WelcomeBanner } from "@/components/home/WelcomeBanner";
import {
  ALL_DISHES_CATEGORY,
  type DishCategory,
} from "@/constants/dishCategories";
import {
  discoverDishes,
  getDiscoveryRadiusMeters,
  loadKitchenMenu,
  type Dish,
} from "@/services/api/dishes";
import { discoverKitchens } from "@/services/api/kitchens";
import { formatDiscoveryRadius } from "@/lib/catalog-discovery-policy";
import { type NearbyKitchen } from "@/lib/discovery-contract";
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
import {
  cartCount,
  cartCurrency,
  cartTotal,
  loadCart,
  subscribeCart,
} from "@/services/api/cravesCart";
import styles from "./HomeReference.module.css";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";
const SAVED_ADDRESS_MATCH_RADIUS_METERS = 100;

const HOME_CATEGORY_KEYWORDS: Record<CravingCategory, readonly string[]> = {
  Biryani: ["biryani"],
  Tiffins: ["tiffin", "dosa", "idli", "pongal", "upma", "breakfast"],
  Pickles: ["pickle", "pachadi", "chutney"],
  Meals: ["meal", "thali", "lunch", "dinner"],
  Sweets: ["sweet", "dessert", "halwa", "kheer", "laddu", "ladoo"],
};

export const routeMeta = {
  head: () => ({
    meta: [
      { title: "Discover Homemade Food – Craves" },
      {
        name: "description",
        content: "Discover nearby Craves home kitchens and live homemade dishes.",
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
    // Saved-address matching is an optimization. GPS discovery can continue.
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
  const [homeCategory, setHomeCategory] = useState<CravingCategory | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItemCount, setCartItemCount] = useState(0);
  const [cartSubtotal, setCartSubtotal] = useState(0);
  const [cartCurrencyCode, setCartCurrencyCode] = useState("INR");
  const [kitchens, setKitchens] = useState<NearbyKitchen[]>([]);
  const [nearbyDishes, setNearbyDishes] = useState<Dish[]>([]);
  const [selectedKitchen, setSelectedKitchen] = useState<NearbyKitchen | null>(null);
  const [menuDishes, setMenuDishes] = useState<Dish[]>([]);
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>("loading");
  const [catalogMessage, setCatalogMessage] = useState("Detecting your current delivery location…");
  const [radiusLabel, setRadiusLabel] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const refreshDiscovery = useCallback(async (activeAddress: CravesAddress | null) => {
    setSelectedKitchen(null);
    setMenuDishes([]);
    setCategory(ALL_DISHES_CATEGORY);
    setHomeCategory(null);
    setSearchTerm("");

    if (
      typeof activeAddress?.lat !== "number" ||
      typeof activeAddress.lng !== "number"
    ) {
      setKitchens([]);
      setNearbyDishes([]);
      setRadiusLabel(null);
      setDiscoveryState("address-required");
      setCatalogMessage(
        "Choose or save a delivery location so Craves can show nearby home kitchens.",
      );
      return;
    }

    setDiscoveryState("loading");
    setCatalogMessage("Loading nearby home kitchens and fresh dishes…");

    const [kitchenResult, dishResult] = await Promise.allSettled([
      discoverKitchens(activeAddress.lat, activeAddress.lng, 5_000),
      discoverDishes(activeAddress.lat, activeAddress.lng, 5_000),
    ]);

    const loadedKitchens = kitchenResult.status === "fulfilled" ? kitchenResult.value.kitchens : [];
    const loadedDishes = dishResult.status === "fulfilled" ? dishResult.value : [];

    setKitchens(loadedKitchens);
    setNearbyDishes(loadedDishes);

    if (kitchenResult.status === "fulfilled") {
      setRadiusLabel(formatDiscoveryRadius(kitchenResult.value.radiusMeters));
    } else if (dishResult.status === "fulfilled") {
      setRadiusLabel(formatDiscoveryRadius(getDiscoveryRadiusMeters()));
    } else {
      setRadiusLabel(null);
    }

    if (kitchenResult.status === "rejected" && dishResult.status === "rejected") {
      setDiscoveryState("error");
      const reason = kitchenResult.reason ?? dishResult.reason;
      setCatalogMessage(
        reason instanceof Error ? reason.message : "Nearby food is temporarily unavailable.",
      );
      return;
    }

    setDiscoveryState("ready");
    if (loadedKitchens.length === 0 && loadedDishes.length === 0) {
      setCatalogMessage("No active home kitchens or dishes were returned for this location yet.");
    } else if (kitchenResult.status === "rejected" || dishResult.status === "rejected") {
      setCatalogMessage("Some nearby results are temporarily unavailable. Showing the live results we could load.");
    } else {
      setCatalogMessage("Fresh homemade food available near your delivery location.");
    }
  }, []);

  const useCurrentLocation = useCallback(async () => {
    setLocating(true);
    setCatalogMessage("Detecting your current delivery location…");

    try {
      const activeLocation = await resolveLiveBrowsingLocation(address);
      setAddress(activeLocation);
      await refreshDiscovery(activeLocation);
    } catch (error) {
      setDiscoveryState("error");
      setCatalogMessage(
        error instanceof Error
          ? error.message
          : "Your current delivery location could not be detected.",
      );
    } finally {
      setLocating(false);
    }
  }, [address, refreshDiscovery]);

  const openKitchen = useCallback(async (kitchen: NearbyKitchen) => {
    const kitchenName = kitchen.kitchenName;
    setSelectedKitchen(kitchen);
    setMenuDishes([]);
    setCategory(ALL_DISHES_CATEGORY);
    setHomeCategory(null);
    setSearchTerm("");
    setDiscoveryState("loading");
    setCatalogMessage(`Loading ${kitchenName}'s live menu…`);

    try {
      const menu = await loadKitchenMenu(kitchen.id);
      const locatedMenu = menu.map((dish) => ({
        ...dish,
        distanceMeters: kitchen.distanceMeters,
        areaName: dish.areaName ?? kitchen.areaName ?? undefined,
        city: dish.city ?? kitchen.city,
        state: dish.state ?? kitchen.state,
      }));
      setMenuDishes(locatedMenu);
      setDiscoveryState("ready");
      setCatalogMessage(
        locatedMenu.length === 0
          ? `${kitchenName} does not have any active dishes right now.`
          : `Showing ${kitchenName}'s live menu.`,
      );
    } catch (error) {
      setMenuDishes([]);
      setDiscoveryState("error");
      setCatalogMessage(
        error instanceof Error
          ? error.message
          : "This kitchen's menu is temporarily unavailable.",
      );
    }
  }, []);

  useEffect(() => {
    let active = true;

    const syncCartSummary = () => {
      if (!active) return;
      setCartItemCount(cartCount());
      setCartSubtotal(cartTotal());
      setCartCurrencyCode(cartCurrency());
    };

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
        setKitchens([]);
        setNearbyDishes([]);
        setMenuDishes([]);
        setSelectedKitchen(null);
        setDiscoveryState("error");
        setCatalogMessage(
          error instanceof Error
            ? error.message
            : "Your delivery location could not be loaded.",
        );
      }

      try {
        await loadCart();
        syncCartSummary();
      } catch {
        if (active) {
          setCartItemCount(0);
          setCartSubtotal(0);
          setCartCurrencyCode("INR");
        }
      }
    })();

    const unsubscribeCart = subscribeCart(syncCartSummary);
    return () => {
      active = false;
      unsubscribeCart();
    };
  }, [navigate, refreshDiscovery]);

  const activeDishes = selectedKitchen ? menuDishes : nearbyDishes;

  const categories = useMemo<readonly DishCategory[]>(() => {
    const live = Array.from(
      new Set(activeDishes.map((dish) => dish.category.trim()).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));
    return [ALL_DISHES_CATEGORY, ...live];
  }, [activeDishes]);

  useEffect(() => {
    if (!categories.includes(category)) setCategory(ALL_DISHES_CATEGORY);
  }, [categories, category]);

  const categoryImages = useMemo<Partial<Record<CravingCategory, string>>>(() => {
    const result: Partial<Record<CravingCategory, string>> = {};
    for (const nextCategory of Object.keys(HOME_CATEGORY_KEYWORDS) as CravingCategory[]) {
      const keywords = HOME_CATEGORY_KEYWORDS[nextCategory];
      const matchingDish = nearbyDishes.find((dish) => {
        if (dish.imageIsPlaceholder) return false;
        const searchable = `${dish.name} ${dish.category} ${dish.desc}`.toLocaleLowerCase("en-IN");
        return keywords.some((keyword) => searchable.includes(keyword));
      });
      if (matchingDish) result[nextCategory] = matchingDish.img;
    }
    return result;
  }, [nearbyDishes]);

  const filteredKitchens = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("en-IN");
    if (!term) return kitchens;
    return kitchens.filter((kitchen) =>
      [
        kitchen.kitchenName,
        kitchen.description,
        kitchen.areaName,
        kitchen.city,
        kitchen.state,
      ].some((value) => value?.toLocaleLowerCase("en-IN").includes(term)),
    );
  }, [searchTerm, kitchens]);

  const filteredDishes = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("en-IN");
    const homeKeywords = homeCategory ? HOME_CATEGORY_KEYWORDS[homeCategory] : null;

    return activeDishes.filter((dish) => {
      const searchable = `${dish.name} ${dish.category} ${dish.desc}`.toLocaleLowerCase("en-IN");
      const categoryMatches = selectedKitchen
        ? category === ALL_DISHES_CATEGORY || dish.category === category
        : !homeKeywords || homeKeywords.some((keyword) => searchable.includes(keyword));
      const searchMatches =
        !term ||
        dish.name.toLocaleLowerCase("en-IN").includes(term) ||
        dish.chef.toLocaleLowerCase("en-IN").includes(term) ||
        dish.category.toLocaleLowerCase("en-IN").includes(term) ||
        dish.desc.toLocaleLowerCase("en-IN").includes(term);
      return categoryMatches && searchMatches;
    });
  }, [activeDishes, category, homeCategory, searchTerm, selectedKitchen]);

  const handleLogout = async () => {
    await clearSession();
    navigate({ to: "/" });
  };

  const locationLabel = address
    ? [address.mandal, address.city].filter(Boolean).join(", ")
    : "Set delivery location";

  if (!user) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${styles.paperSurface}`}>
        <div className="text-center" role="status">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#E9D9CF] border-t-[#F62E18]" />
          <p className="mt-4 text-sm font-bold text-[#806B62]">Opening your Craves home…</p>
        </div>
      </main>
    );
  }

  return (
    <div className={`${styles.paperSurface} min-h-screen pb-24 text-[#261A15]`}>
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
          dishCount={selectedKitchen ? menuDishes.length : nearbyDishes.length}
          radiusLabel={radiusLabel}
          hasAddress={Boolean(address?.lat != null && address?.lng != null)}
          locating={locating}
          onUseCurrentLocation={() => void useCurrentLocation()}
        />

        {selectedKitchen ? (
          <>
            <section className="mx-auto max-w-[88rem] px-4 pt-9 md:px-7 lg:px-10" aria-label="Selected kitchen">
              <button
                type="button"
                onClick={() => {
                  setSelectedKitchen(null);
                  setMenuDishes([]);
                  setCategory(ALL_DISHES_CATEGORY);
                  setSearchTerm("");
                  setDiscoveryState("ready");
                  setCatalogMessage("Fresh homemade food available near your delivery location.");
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#E0C8BA] bg-white/70 px-4 text-xs font-black text-[#C92716] transition hover:-translate-y-0.5 hover:border-[#F62E18]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to home
              </button>

              <div className="mt-4 rounded-[2rem] border border-[#E8D8CE] bg-[#FFF8F1] p-6 shadow-[0_14px_40px_rgba(61,40,31,0.06)] md:flex md:items-center md:justify-between md:gap-6 md:p-7">
                <div>
                  <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[#F62E18]">Selected home kitchen</p>
                  <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-[#261A15]">
                    {selectedKitchen.kitchenName}
                  </h2>
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#806B62]">
                    <MapPin className="h-4 w-4 fill-[#F62E18] text-[#F62E18]" strokeWidth={1.5} aria-hidden="true" />
                    {[selectedKitchen.areaName, selectedKitchen.city].filter(Boolean).join(", ")}
                  </p>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm font-black text-[#5F4B43] shadow-sm md:mt-0">
                  <Utensils className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                  {selectedKitchen.activeMenuItemCount} active {selectedKitchen.activeMenuItemCount === 1 ? "dish" : "dishes"}
                </div>
              </div>
            </section>

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
              onRetry={() => void openKitchen(selectedKitchen)}
              onManageAddress={() => navigate({ to: "/addresses" })}
            />
          </>
        ) : (
          <>
            <HomeCategoryRail
              selected={homeCategory}
              images={categoryImages}
              onSelect={(nextCategory) =>
                setHomeCategory((current) => (current === nextCategory ? null : nextCategory))
              }
            />
            <TodaysSpecial dishes={nearbyDishes} />
            <DishesGrid
              dishes={filteredDishes}
              selectedCategory={homeCategory ?? ALL_DISHES_CATEGORY}
              searchTerm={searchTerm}
              state={discoveryState}
              message={catalogMessage}
              onRetry={() => void refreshDiscovery(address)}
              onManageAddress={() => navigate({ to: "/addresses" })}
            />
            <KitchensGrid
              kitchens={filteredKitchens}
              searchTerm={searchTerm}
              state={discoveryState}
              message={catalogMessage}
              onSelectKitchen={(kitchen) => void openKitchen(kitchen)}
              onRetry={() => void refreshDiscovery(address)}
              onManageAddress={() => navigate({ to: "/addresses" })}
            />
            <HomeBottomSections />
          </>
        )}
      </main>

      <FloatingCartBar
        itemCount={cartItemCount}
        total={cartSubtotal}
        currency={cartCurrencyCode}
        onViewCart={() => navigate({ to: "/cart" })}
      />
    </div>
  );
}

export default BrowseFoodsPage;
