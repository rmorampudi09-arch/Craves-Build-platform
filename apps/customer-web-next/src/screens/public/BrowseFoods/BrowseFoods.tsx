import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { BrowseHeader } from "@/components/home/BrowseHeader";
import { DishesGrid } from "@/components/home/DishesGrid";
import { FloatingCartBar } from "@/components/home/FloatingCartBar";
import { HomeBottomSections } from "@/components/home/HomeBottomSections";
import {
  HomeCategoryRail,
  type CravingCategory,
} from "@/components/home/HomeCategoryRail";
import { HomeSearchOverlay } from "@/components/home/HomeSearchOverlay";
import { KitchensGrid } from "@/components/home/KitchensGrid";
import { TodaysSpecial } from "@/components/home/TodaysSpecial";
import { WelcomeBanner } from "@/components/home/WelcomeBanner";
import { ALL_DISHES_CATEGORY } from "@/constants/dishCategories";
import {
  discoverDishes,
  getDiscoveryRadiusMeters,
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
  clearHomeReturnState,
  readHomeReturnState,
  saveHomeReturnState,
} from "@/lib/home-return-state";
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
  Snacks: ["snack", "pakoda", "pakora", "samosa", "chaat", "vada"],
  Sweets: ["sweet", "dessert", "halwa", "kheer", "laddu", "ladoo"],
  Cake: ["cake", "pastry", "cupcake"],
  "Ice Cream": ["ice cream", "kulfi", "gelato"],
};

const CRAVING_CATEGORIES = new Set<CravingCategory>(
  Object.keys(HOME_CATEGORY_KEYWORDS) as CravingCategory[],
);

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

function isCravingCategory(value: string | null): value is CravingCategory {
  return value !== null && CRAVING_CATEGORIES.has(value as CravingCategory);
}

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
  const [homeCategory, setHomeCategory] = useState<CravingCategory | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [cartSubtotal, setCartSubtotal] = useState(0);
  const [cartCurrencyCode, setCartCurrencyCode] = useState("INR");
  const [kitchens, setKitchens] = useState<NearbyKitchen[]>([]);
  const [nearbyDishes, setNearbyDishes] = useState<Dish[]>([]);
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>("loading");
  const [catalogMessage, setCatalogMessage] = useState("Detecting your current delivery location…");
  const [radiusLabel, setRadiusLabel] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const refreshDiscovery = useCallback(async (
    activeAddress: CravesAddress | null,
    resetFilters = true,
  ) => {
    if (resetFilters) {
      setHomeCategory(null);
      setSearchTerm("");
      setSearchOpen(false);
    }

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
      discoverDishes(activeAddress.lat, activeAddress.lng),
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

  const restoreHomeView = useCallback(() => {
    const restored = readHomeReturnState();
    if (!restored) return;

    setHomeCategory(
      isCravingCategory(restored.homeCategory) ? restored.homeCategory : null,
    );
    setSearchTerm(restored.searchTerm);
    setSearchOpen(restored.searchOpen);

    if (!restored.searchOpen) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: restored.scrollY, behavior: "auto" });
        });
      });
    }
    clearHomeReturnState();
  }, []);

  const rememberHomeView = useCallback(() => {
    saveHomeReturnState({
      scrollY: window.scrollY,
      searchTerm,
      searchOpen,
      homeCategory,
    });
  }, [homeCategory, searchOpen, searchTerm]);

  const handleDetailNavigationCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    const href = anchor?.getAttribute("href");
    if (href?.startsWith("/dish/") || href?.startsWith("/chef/")) {
      rememberHomeView();
    }
  }, [rememberHomeView]);

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
        await refreshDiscovery(activeLocation, false);
        if (active) restoreHomeView();
      } catch (error) {
        if (!active) return;
        setAddress(null);
        setKitchens([]);
        setNearbyDishes([]);
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
  }, [navigate, refreshDiscovery, restoreHomeView]);

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

    return nearbyDishes.filter((dish) => {
      const searchable = `${dish.name} ${dish.category} ${dish.desc}`.toLocaleLowerCase("en-IN");
      const categoryMatches =
        !homeKeywords || homeKeywords.some((keyword) => searchable.includes(keyword));
      const searchMatches =
        !term ||
        dish.name.toLocaleLowerCase("en-IN").includes(term) ||
        dish.chef.toLocaleLowerCase("en-IN").includes(term) ||
        dish.category.toLocaleLowerCase("en-IN").includes(term) ||
        dish.desc.toLocaleLowerCase("en-IN").includes(term);
      return categoryMatches && searchMatches;
    });
  }, [homeCategory, nearbyDishes, searchTerm]);

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
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#F1F3F5] border-t-[#F62E18]" />
          <p className="mt-4 text-sm font-bold text-[#6B6B6B]">Opening your Craves home…</p>
        </div>
      </main>
    );
  }

  return (
    <div
      className={`${styles.paperSurface} min-h-screen pb-24 text-[#1A1A1A]`}
      onClickCapture={handleDetailNavigationCapture}
    >
      <BrowseHeader
        user={user}
        locationLabel={locationLabel}
        onOpenLocation={() => navigate({ to: "/addresses" })}
        cartCount={cartItemCount}
        onOpenCart={() => navigate({ to: "/cart" })}
        onLogout={handleLogout}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onSearchFocus={() => setSearchOpen(true)}
      />

      <main>
        <WelcomeBanner
          firstName={user.firstName || user.username.split(" ")[0] || "there"}
          dishCount={nearbyDishes.length}
          radiusLabel={radiusLabel}
          hasAddress={Boolean(address?.lat != null && address?.lng != null)}
          locating={locating}
          onUseCurrentLocation={useCurrentLocation}
        />

        <HomeCategoryRail
          selected={homeCategory}
          images={categoryImages}
          onSelect={(nextCategory) => {
            setHomeCategory(nextCategory);
            setSearchTerm("");
          }}
        />

        <TodaysSpecial dishes={nearbyDishes} />

        <KitchensGrid
          kitchens={filteredKitchens}
          searchTerm={searchTerm}
          state={discoveryState}
          message={catalogMessage}
          onSelectKitchen={(kitchen) => {
            rememberHomeView();
            navigate({ to: "/chef/$id", params: { id: kitchen.id } });
          }}
          onRetry={() => void refreshDiscovery(address, false)}
          onManageAddress={() => navigate({ to: "/addresses" })}
        />

        <DishesGrid
          dishes={filteredDishes}
          selectedCategory={homeCategory ?? ALL_DISHES_CATEGORY}
          searchTerm={searchTerm}
          state={discoveryState}
          message={catalogMessage}
          onRetry={() => void refreshDiscovery(address, false)}
          onManageAddress={() => navigate({ to: "/addresses" })}
        />

        <HomeBottomSections />
      </main>

      <FloatingCartBar
        itemCount={cartItemCount}
        total={cartSubtotal}
        currency={cartCurrencyCode}
        onViewCart={() => navigate({ to: "/cart" })}
      />

      {searchOpen ? (
        <HomeSearchOverlay
          dishes={nearbyDishes}
          kitchens={kitchens}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default BrowseFoodsPage;
