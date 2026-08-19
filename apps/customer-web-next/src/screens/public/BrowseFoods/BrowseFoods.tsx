import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { BrowseHeader } from "@/components/home/BrowseHeader";
import { CustomerSignOutDialog } from "@/components/home/CustomerSignOutDialog";
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
  allDishes,
  discoverDishes,
  getDiscoveryRadiusMeters,
  type Dish,
} from "@/services/api/dishes";
import {
  allKitchens,
  discoverKitchens,
  getKitchenDiscoveryRadiusMeters,
} from "@/services/api/kitchens";
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
  type HomeDishSort,
  type HomeFoodPreference,
} from "@/lib/home-return-state";
import {
  clearSession,
  getAddress,
  getSession,
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

function forceInstantWindowScroll(top: number): void {
  const root = document.documentElement;
  const body = document.body;
  const previousRootBehavior = root.style.scrollBehavior;
  const previousBodyBehavior = body.style.scrollBehavior;

  root.style.scrollBehavior = "auto";
  body.style.scrollBehavior = "auto";
  window.scrollTo(0, top);

  window.requestAnimationFrame(() => {
    root.style.scrollBehavior = previousRootBehavior;
    body.style.scrollBehavior = previousBodyBehavior;
    window.history.scrollRestoration = "auto";
  });
}

function BrowseFoodsPage() {
  const navigate = useNavigate();
  const [initialCache] = useState(() => {
    const cachedUser = getSession();
    const cachedAddress = getAddress();
    const canRestoreCatalog = Boolean(cachedUser && cachedAddress);
    return {
      user: cachedUser,
      address: cachedAddress,
      dishes: canRestoreCatalog ? allDishes() : [],
      kitchens: canRestoreCatalog ? allKitchens() : [],
    };
  });
  const hasInitialCatalog = initialCache.dishes.length > 0 || initialCache.kitchens.length > 0;

  const [user, setUser] = useState<CravesUser | null>(initialCache.user);
  const [address, setAddress] = useState<CravesAddress | null>(initialCache.address);
  const [homeCategory, setHomeCategory] = useState<CravingCategory | null>(null);
  const [dishSort, setDishSort] = useState<HomeDishSort>("recommended");
  const [foodPreference, setFoodPreference] = useState<HomeFoodPreference>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(() => cartCount());
  const [cartSubtotal, setCartSubtotal] = useState(() => cartTotal());
  const [cartCurrencyCode, setCartCurrencyCode] = useState(() => cartCurrency());
  const [kitchens, setKitchens] = useState<NearbyKitchen[]>(initialCache.kitchens);
  const [nearbyDishes, setNearbyDishes] = useState<Dish[]>(initialCache.dishes);
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>(
    hasInitialCatalog ? "ready" : "loading",
  );
  const [catalogMessage, setCatalogMessage] = useState(
    hasInitialCatalog
      ? "Fresh homemade food available near your delivery location."
      : "Detecting your current delivery location…",
  );
  const [radiusLabel, setRadiusLabel] = useState<string | null>(() => {
    if (initialCache.kitchens.length > 0) {
      return formatDiscoveryRadius(getKitchenDiscoveryRadiusMeters());
    }
    if (initialCache.dishes.length > 0) {
      return formatDiscoveryRadius(getDiscoveryRadiusMeters());
    }
    return null;
  });
  const [locating, setLocating] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const refreshDiscovery = useCallback(async (
    activeAddress: CravesAddress | null,
    resetFilters = true,
  ) => {
    if (resetFilters) {
      setHomeCategory(null);
      setDishSort("recommended");
      setFoodPreference("all");
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

    const preserveExisting =
      !resetFilters && (allDishes().length > 0 || allKitchens().length > 0);
    if (!preserveExisting) {
      setDiscoveryState("loading");
      setCatalogMessage("Loading nearby home kitchens and fresh dishes…");
    }

    const [kitchenResult, dishResult] = await Promise.allSettled([
      discoverKitchens(activeAddress.lat, activeAddress.lng, 5_000),
      discoverDishes(activeAddress.lat, activeAddress.lng),
    ]);

    const loadedKitchens = kitchenResult.status === "fulfilled" ? kitchenResult.value.kitchens : [];
    const loadedDishes = dishResult.status === "fulfilled" ? dishResult.value : [];

    if (kitchenResult.status === "fulfilled") {
      setKitchens(loadedKitchens);
    } else if (!preserveExisting) {
      setKitchens([]);
    }
    if (dishResult.status === "fulfilled") {
      setNearbyDishes(loadedDishes);
    } else if (!preserveExisting) {
      setNearbyDishes([]);
    }

    if (kitchenResult.status === "fulfilled") {
      setRadiusLabel(formatDiscoveryRadius(kitchenResult.value.radiusMeters));
    } else if (dishResult.status === "fulfilled") {
      setRadiusLabel(formatDiscoveryRadius(getDiscoveryRadiusMeters()));
    } else if (!preserveExisting) {
      setRadiusLabel(null);
    }

    if (kitchenResult.status === "rejected" && dishResult.status === "rejected") {
      if (preserveExisting) {
        setDiscoveryState("ready");
        setCatalogMessage("Showing your recent nearby results while Craves refreshes in the background.");
        return;
      }
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
    setDishSort(restored.dishSort);
    setFoodPreference(restored.foodPreference);
    setSearchTerm(restored.searchTerm);
    setSearchOpen(restored.searchOpen);

    if (!restored.searchOpen) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          forceInstantWindowScroll(restored.scrollY);
        });
      });
    } else {
      window.history.scrollRestoration = "auto";
    }
    clearHomeReturnState();
  }, []);

  const rememberHomeView = useCallback(() => {
    window.history.scrollRestoration = "manual";
    saveHomeReturnState({
      scrollY: window.scrollY,
      searchTerm,
      searchOpen,
      homeCategory,
      dishSort,
      foodPreference,
    });
  }, [dishSort, foodPreference, homeCategory, searchOpen, searchTerm]);

  const scrollToDishes = useCallback(() => {
    const heading = document.getElementById("available-dishes-heading");
    const section = heading?.closest("section");
    if (!section) return;

    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    section.scrollIntoView({ behavior: "auto", block: "start" });
    window.requestAnimationFrame(() => {
      root.style.scrollBehavior = previousBehavior;
    });
  }, []);

  const handleDetailNavigationCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    const href = anchor?.getAttribute("href");
    if (
      href?.startsWith("/dish/") ||
      href?.startsWith("/kitchen/") ||
      href?.startsWith("/chef/")
    ) {
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
    restoreHomeView();
  }, [restoreHomeView]);

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
        if (!hasInitialCatalog) {
          setCatalogMessage(
            savedFallback
              ? "Checking whether you are still near your saved address…"
              : "Detecting your current delivery location…",
          );
        }
        const activeLocation = await resolveLiveBrowsingLocation(savedFallback);
        if (!active) return;
        setAddress(activeLocation);
        await refreshDiscovery(activeLocation, false);
      } catch (error) {
        if (!active) return;
        const cachedAddress = getAddress();
        const cachedKitchens = allKitchens();
        const cachedDishes = allDishes();
        if (cachedAddress && (cachedKitchens.length > 0 || cachedDishes.length > 0)) {
          setAddress(cachedAddress);
          setKitchens(cachedKitchens);
          setNearbyDishes(cachedDishes);
          setDiscoveryState("ready");
          setCatalogMessage("Showing your recent nearby results while location refresh is unavailable.");
        } else {
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
  }, [hasInitialCatalog, navigate, refreshDiscovery]);

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

    const matchingDishes = nearbyDishes.filter((dish) => {
      const searchable = `${dish.name} ${dish.category} ${dish.desc}`.toLocaleLowerCase("en-IN");
      const categoryMatches =
        !homeKeywords || homeKeywords.some((keyword) => searchable.includes(keyword));
      const searchMatches =
        !term ||
        dish.name.toLocaleLowerCase("en-IN").includes(term) ||
        dish.chef.toLocaleLowerCase("en-IN").includes(term) ||
        dish.category.toLocaleLowerCase("en-IN").includes(term) ||
        dish.desc.toLocaleLowerCase("en-IN").includes(term);
      const foodTypeMatches =
        foodPreference === "all" ||
        (foodPreference === "veg" && dish.veg) ||
        (foodPreference === "non-veg" && !dish.veg);
      return categoryMatches && searchMatches && foodTypeMatches;
    });

    if (dishSort === "rating") {
      return [...matchingDishes].sort((left, right) => right.rating - left.rating);
    }
    if (dishSort === "price-low-high") {
      return [...matchingDishes].sort((left, right) => left.price - right.price);
    }
    if (dishSort === "price-high-low") {
      return [...matchingDishes].sort((left, right) => right.price - left.price);
    }
    return matchingDishes;
  }, [dishSort, foodPreference, homeCategory, nearbyDishes, searchTerm]);

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await clearSession();
      setSignOutOpen(false);
      navigate({ to: "/" });
    } finally {
      setSigningOut(false);
    }
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
        onLogout={() => setSignOutOpen(true)}
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
            window.requestAnimationFrame(scrollToDishes);
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
            navigate({ to: "/kitchen/$id", params: { id: kitchen.id } });
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
          sort={dishSort}
          foodPreference={foodPreference}
          onSortChange={setDishSort}
          onFoodPreferenceChange={setFoodPreference}
          onRemoveFilters={() => {
            setHomeCategory(null);
            setDishSort("recommended");
            setFoodPreference("all");
          }}
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

      <CustomerSignOutDialog
        open={signOutOpen}
        busy={signingOut}
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => void handleLogout()}
      />
    </div>
  );
}

export default BrowseFoodsPage;
