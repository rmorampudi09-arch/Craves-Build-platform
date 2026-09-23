import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { BrowseHeader } from "@/components/home/BrowseHeader";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";
import { CartAddressAvailabilityDialog } from "@/components/home/CartAddressAvailabilityDialog";
import { CustomerSignOutDialog } from "@/components/home/CustomerSignOutDialog";
import { DishesGrid } from "@/components/home/DishesGrid";
import { CustomerFloatingCart } from "@/components/cart/CustomerFloatingCart";
import { HomeBottomSections } from "@/components/home/HomeBottomSections";
import {
  HomeCategoryRail,
  type CravingCategory,
} from "@/components/home/HomeCategoryRail";
import { HomeSearchOverlay } from "@/components/home/HomeSearchOverlay";
import { KitchensGrid } from "@/components/home/KitchensGrid";
import { WelcomeBanner } from "@/components/home/WelcomeBanner";
import { ALL_DISHES_CATEGORY } from "@/constants/dishCategories";
import {
  DEFAULT_DISCOVERY_RADIUS_METERS,
  formatDiscoveryRadius,
} from "@/lib/catalog-discovery-policy";
import { type NearbyKitchen } from "@/lib/discovery-contract";
import {
  clearHomeReturnState,
  readHomeReturnState,
  saveHomeReturnState,
  type HomeDishSort,
  type HomeFoodPreference,
} from "@/lib/home-return-state";
import { rememberReturnRoute } from "@/lib/return-navigation";
import {
  cartCount,
  clearCart,
  getCart,
  loadCart,
  removeFromCart,
  subscribeCart,
  type CartItem,
} from "@/services/api/cravesCart";
import {
  allDishes,
  discoverDishes,
  getDiscoveryRadiusMeters,
  hasMoreDiscoveredDishes,
  loadKitchenMenu,
  loadMoreDiscoveredDishes,
  type Dish,
} from "@/services/api/dishes";
import {
  allKitchens,
  discoverKitchens,
  getKitchenDiscoveryRadiusMeters,
} from "@/services/api/kitchens";
import {
  clearSession,
  getAddress,
  getSession,
  loadSelectedAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";
import styles from "./HomeReference.module.css";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

const HOME_CATEGORY_KEYWORDS: Record<CravingCategory, readonly string[]> = {
  Biryani: ["biryani"],
  Tiffins: ["tiffin", "dosa", "idli", "pongal", "upma", "breakfast"],
  Curry: ["curry", "kura", "gravy"],
  Pickles: ["pickle", "pachadi", "chutney"],
  Meals: ["meal", "thali", "lunch", "dinner"],
  Snacks: ["snack", "pakoda", "pakora", "samosa", "chaat", "vada"],
  Sweets: ["sweet", "dessert", "halwa", "kheer", "laddu", "ladoo"],
  Desserts: ["dessert", "pudding", "custard", "mousse"],
  Cake: ["cake", "pastry", "cupcake"],
  "Fast Food": ["fast food", "burger", "pizza", "sandwich", "noodles", "fries"],
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

function forceInstantWindowScroll(top: number): void {
  const root = document.documentElement;
  const body = document.body;
  const previousRootBehavior = root.style.scrollBehavior;
  const previousBodyBehavior = body.style.scrollBehavior;

  root.style.scrollBehavior = "auto";
  body.style.scrollBehavior = "auto";
  window.scrollTo({ top, left: 0, behavior: "auto" });
  root.style.scrollBehavior = previousRootBehavior;
  body.style.scrollBehavior = previousBodyBehavior;
}

function BrowseFoodsPage() {
  const navigate = useNavigate();
  const [initialCache] = useState(() => ({
    user: getSession(),
    address: getAddress(),
    dishes: [] as Dish[],
    kitchens: [] as NearbyKitchen[],
  }));
  const hasInitialCatalog = false;

  const [user, setUser] = useState<CravesUser | null>(initialCache.user);
  const [address, setAddress] = useState<CravesAddress | null>(initialCache.address);
  const [homeCategory, setHomeCategory] = useState<CravingCategory | null>(null);
  const [dishSort, setDishSort] = useState<HomeDishSort>("recommended");
  const [foodPreference, setFoodPreference] = useState<HomeFoodPreference>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(() => cartCount());
  const [cartItems, setCartItems] = useState<CartItem[]>(() => getCart());
  const [unavailableCartItems, setUnavailableCartItems] = useState<CartItem[]>([]);
  const [dismissedCartAvailabilityKey, setDismissedCartAvailabilityKey] = useState<string | null>(null);
  const [cartRepairBusy, setCartRepairBusy] = useState(false);
  const [cartRepairError, setCartRepairError] = useState<string | null>(null);
  const [kitchens, setKitchens] = useState<NearbyKitchen[]>(initialCache.kitchens);
  const [defaultAddressResolved, setDefaultAddressResolved] = useState(false);
  const [kitchenDiscoveryVerified, setKitchenDiscoveryVerified] = useState(hasInitialCatalog);
  const [nearbyDishes, setNearbyDishes] = useState<Dish[]>(initialCache.dishes);
  const [dishLoadMoreBusy, setDishLoadMoreBusy] = useState(false);
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>(
    hasInitialCatalog ? "ready" : "loading",
  );
  const [catalogMessage, setCatalogMessage] = useState(
    hasInitialCatalog
      ? "Fresh homemade food available near your default delivery address."
      : "Loading your default delivery address…",
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
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const pendingHomeScrollYRef = useRef<number | null>(null);

  const refreshDiscovery = useCallback(async (
    activeAddress: CravesAddress | null,
    resetFilters = true,
    preserveExistingCatalog = false,
  ) => {
    setDishLoadMoreBusy(false);
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
      setKitchenDiscoveryVerified(false);
      setNearbyDishes([]);
      setRadiusLabel(null);
      setDiscoveryState("address-required");
      setCatalogMessage(
        "Choose a default delivery address so Craves can show nearby home kitchens.",
      );
      return;
    }

    const preserveExisting =
      preserveExistingCatalog && (allDishes().length > 0 || allKitchens().length > 0);
    if (!preserveExisting) {
      setKitchens([]);
      setKitchenDiscoveryVerified(false);
      setNearbyDishes([]);
      setRadiusLabel(null);
      setDiscoveryState("loading");
      setCatalogMessage("Loading food near your default delivery address…");
    }

    const [kitchenResult, dishResult] = await Promise.allSettled([
      discoverKitchens(
        activeAddress.lat,
        activeAddress.lng,
        DEFAULT_DISCOVERY_RADIUS_METERS,
      ),
      discoverDishes(
        activeAddress.lat,
        activeAddress.lng,
        DEFAULT_DISCOVERY_RADIUS_METERS,
      ),
    ]);

    const loadedKitchens = kitchenResult.status === "fulfilled" ? kitchenResult.value.kitchens : [];
    const loadedDishes = dishResult.status === "fulfilled" ? dishResult.value : [];

    if (kitchenResult.status === "fulfilled") {
      setKitchens(loadedKitchens);
      setKitchenDiscoveryVerified(true);
    } else {
      setKitchenDiscoveryVerified(false);
      if (!preserveExisting) setKitchens([]);
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
        setCatalogMessage("Showing your recent default-address results while Craves refreshes in the background.");
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
      setCatalogMessage("No active home kitchens or dishes are available within 10 km of your default address.");
    } else if (kitchenResult.status === "rejected" || dishResult.status === "rejected") {
      setCatalogMessage("Some nearby results are temporarily unavailable. Showing the live results we could load.");
    } else {
      setCatalogMessage("Fresh homemade food available near your default delivery address.");
    }
  }, []);

  const loadMoreNearbyDishes = useCallback(async () => {
    if (dishLoadMoreBusy || !hasMoreDiscoveredDishes()) return;

    setDishLoadMoreBusy(true);
    try {
      const next = await loadMoreDiscoveredDishes();
      setNearbyDishes(next);
    } catch {
      // Keep the already-rendered catalog stable. The next scroll can retry.
    } finally {
      setDishLoadMoreBusy(false);
    }
  }, [dishLoadMoreBusy]);

  const restoreHomeView = useCallback(() => {
    const restored = readHomeReturnState();
    if (!restored) return;

    window.history.scrollRestoration = "manual";
    pendingHomeScrollYRef.current = Math.max(0, restored.scrollY);

    setHomeCategory(
      isCravingCategory(restored.homeCategory) ? restored.homeCategory : null,
    );
    setDishSort(restored.dishSort);
    setFoodPreference(restored.foodPreference === "veg" ? "veg" : "all");
    setSearchTerm("");
    setSearchOpen(false);
  }, []);

  const rememberHomeView = useCallback(() => {
    window.history.scrollRestoration = "manual";
    saveHomeReturnState({
      scrollY: window.scrollY,
      searchTerm: "",
      searchOpen: false,
      homeCategory,
      dishSort,
      foodPreference,
    });
  }, [dishSort, foodPreference, homeCategory]);

  const scrollToDishes = useCallback(() => {
    const heading = document.getElementById("available-dishes-heading");
    const section = heading?.closest("section");
    if (!section) return;

    section.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
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

  useEffect(() => {
    restoreHomeView();
  }, [restoreHomeView]);

  useEffect(() => {
    const targetScrollY = pendingHomeScrollYRef.current;
    if (
      targetScrollY === null ||
      !defaultAddressResolved ||
      discoveryState === "loading"
    ) {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        forceInstantWindowScroll(targetScrollY);
        pendingHomeScrollYRef.current = null;
        clearHomeReturnState();
        window.history.scrollRestoration = "auto";
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [
    defaultAddressResolved,
    discoveryState,
    kitchens.length,
    nearbyDishes.length,
  ]);

  useEffect(() => {
    if (window.sessionStorage.getItem("craves-home-open-search") !== "1") return;
    window.sessionStorage.removeItem("craves-home-open-search");
    setSearchOpen(true);
  }, []);

  useEffect(() => {
    let active = true;

    const syncCartSummary = () => {
      if (!active) return;
      setCartItemCount(cartCount());
      setCartItems(getCart());
    };

    void (async () => {
      let current = await loadSession();
      if (!active) return;

      // A refresh race or brief BFF interruption must not throw an already
      // signed-in customer back to the landing page. Confirm once more before
      // treating the session as genuinely gone.
      if (!current) {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        current = await loadSession();
        if (!active) return;
      }

      if (!current) {
        navigate({ to: "/", replace: true });
        return;
      }
      setUser(current);

      try {
        const defaultAddress = await loadSelectedAddress();
        if (!active) return;
        setAddress(defaultAddress);
        setCatalogMessage(
          defaultAddress
            ? "Loading food near your default delivery address…"
            : "Choose a default delivery address to see nearby food.",
        );
        await refreshDiscovery(defaultAddress, false, false);
        if (active) setDefaultAddressResolved(true);
      } catch (error) {
        if (!active) return;
        setAddress(null);
        setKitchens([]);
        setKitchenDiscoveryVerified(false);
        setNearbyDishes([]);
        setRadiusLabel(null);
        setDiscoveryState("error");
        setDefaultAddressResolved(true);
        setCatalogMessage(
          error instanceof Error
            ? error.message
            : "Your default delivery address could not be loaded.",
        );
      }

      try {
        await loadCart();
        syncCartSummary();
      } catch {
        if (active) {
          setCartItemCount(0);
          setCartItems([]);
        }
      }
    })();

    const unsubscribeCart = subscribeCart(syncCartSummary);
    return () => {
      active = false;
      unsubscribeCart();
    };
  }, [navigate, refreshDiscovery]);

  useEffect(() => {
    let active = true;

    void (async () => {
      setCartRepairError(null);
      if (
        !defaultAddressResolved ||
        discoveryState !== "ready" ||
        !kitchenDiscoveryVerified ||
        cartItems.length === 0 ||
        typeof address?.lat !== "number" ||
        typeof address.lng !== "number"
      ) {
        setUnavailableCartItems([]);
        return;
      }

      const nearbyKitchenIds = new Set(kitchens.map((kitchen) => kitchen.id));
      const outOfRangeItems = cartItems.filter(
        (item) => !nearbyKitchenIds.has(item.kitchenId),
      );
      if (outOfRangeItems.length > 0) {
        setUnavailableCartItems(outOfRangeItems);
        return;
      }

      const nearbyDishIds = new Set(nearbyDishes.map((dish) => dish.id));
      const unresolvedItems = cartItems.filter(
        (item) => !nearbyDishIds.has(item.menuItemId),
      );
      if (unresolvedItems.length === 0) {
        setUnavailableCartItems([]);
        return;
      }

      const kitchenIds = Array.from(new Set(unresolvedItems.map((item) => item.kitchenId)));
      const menuResults = await Promise.all(
        kitchenIds.map(async (kitchenId) => {
          try {
            const menu = await loadKitchenMenu(kitchenId);
            return [kitchenId, new Set(menu.map((dish) => dish.id))] as const;
          } catch {
            return [kitchenId, null] as const;
          }
        }),
      );
      if (!active) return;

      const menuIdsByKitchen = new Map(menuResults);
      setUnavailableCartItems(
        unresolvedItems.filter((item) => {
          const menuIds = menuIdsByKitchen.get(item.kitchenId);
          return menuIds instanceof Set && !menuIds.has(item.menuItemId);
        }),
      );
    })();

    return () => {
      active = false;
    };
  }, [
    address?.lat,
    address?.lng,
    cartItems,
    defaultAddressResolved,
    discoveryState,
    kitchenDiscoveryVerified,
    kitchens,
    nearbyDishes,
  ]);

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

  const kitchenDishImages = useMemo<Record<string, string[]>>(() => {
    const grouped: Record<string, string[]> = {};
    for (const dish of nearbyDishes) {
      if (!dish.kitchenId || dish.imageIsPlaceholder || !dish.img) continue;
      const current = grouped[dish.kitchenId] ?? [];
      if (!current.includes(dish.img) && current.length < 5) {
        grouped[dish.kitchenId] = [...current, dish.img];
      }
    }
    return grouped;
  }, [nearbyDishes]);

  const filteredKitchens = kitchens;

  const filteredDishes = useMemo(() => {
    const homeKeywords = homeCategory ? HOME_CATEGORY_KEYWORDS[homeCategory] : null;

    const matchingDishes = nearbyDishes.filter((dish) => {
      const searchable = `${dish.name} ${dish.category} ${dish.desc}`.toLocaleLowerCase("en-IN");
      const categoryMatches =
        !homeKeywords || homeKeywords.some((keyword) => searchable.includes(keyword));
      const foodType = dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG");
      const foodTypeMatches = foodPreference !== "veg" || foodType === "VEG";
      return categoryMatches && foodTypeMatches;
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
  }, [dishSort, foodPreference, homeCategory, nearbyDishes]);

  const locationLabel = address
    ? Array.from(
        new Set(
          [address.hno, address.street, address.mandal, address.city]
            .map((part) => part?.trim())
            .filter((part): part is string => Boolean(part)),
        ),
      ).join(", ")
    : "Choose delivery location";
  const rawLocationType = address?.label?.trim();
  const normalizedLocationType = rawLocationType?.toUpperCase();
  const locationTypeLabel =
    normalizedLocationType === "HOME"
      ? "Home"
      : normalizedLocationType === "WORK"
        ? "Work"
        : normalizedLocationType === "OTHER"
          ? "Other"
          : rawLocationType || "Location";

  const searchDishes = useMemo(
    () =>
      foodPreference === "veg"
        ? nearbyDishes.filter((dish) => {
            const foodType = dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG");
            return foodType === "VEG";
          })
        : nearbyDishes,
    [foodPreference, nearbyDishes],
  );

  const cartAvailabilityKey = unavailableCartItems.length > 0
    ? `${address?.id ?? `${address?.lat ?? ""}:${address?.lng ?? ""}`}|${unavailableCartItems
        .map((item) => item.id)
        .sort()
        .join(",")}`
    : null;

  const cartAvailabilityOpen = Boolean(
    cartAvailabilityKey && cartAvailabilityKey !== dismissedCartAvailabilityKey,
  );

  const resolveUnavailableCartItems = useCallback(async () => {
    if (unavailableCartItems.length === 0 || cartRepairBusy) return;
    setCartRepairBusy(true);
    setCartRepairError(null);
    try {
      if (unavailableCartItems.length === cartItems.length) {
        await clearCart();
      } else {
        for (const item of unavailableCartItems) {
          await removeFromCart(item.id);
        }
      }
      setUnavailableCartItems([]);
      setDismissedCartAvailabilityKey(null);
    } catch (error) {
      setCartRepairError(
        error instanceof Error
          ? error.message
          : "Your cart could not be updated. Please try again.",
      );
    } finally {
      setCartRepairBusy(false);
    }
  }, [cartItems.length, cartRepairBusy, unavailableCartItems]);

  const openAddressManager = useCallback(() => {
    rememberReturnRoute("/addresses", "/home");
    navigate({ to: "/addresses" });
  }, [navigate]);

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

  if (!user || !defaultAddressResolved) {
    return <CustomerPageSkeleton label="Loading your Craves home" />;
  }

  return (
    <div
      className={`${styles.paperSurface} min-h-screen pb-24 text-[#1A1A1A]`}
      onClickCapture={handleDetailNavigationCapture}
    >
      <BrowseHeader
        user={user}
        locationLabel={locationLabel}
        locationTypeLabel={locationTypeLabel}
        onOpenLocation={openAddressManager}
        cartCount={cartItemCount}
        onOpenCart={() => navigate({ to: "/cart" })}
        onLogout={() => setSignOutOpen(true)}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onSearchFocus={() => setSearchOpen(true)}
        foodPreference={foodPreference}
        onFoodPreferenceChange={setFoodPreference}
      />

      <main>
        <WelcomeBanner
          firstName={user.firstName || user.username.split(" ")[0] || "there"}
          dishCount={nearbyDishes.length}
          radiusLabel={radiusLabel}
          defaultAddressLabel={locationLabel}
          hasDefaultAddress={Boolean(address?.lat != null && address?.lng != null)}
          onManageDefaultAddress={openAddressManager}
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

        <KitchensGrid
          kitchens={filteredKitchens}
          searchTerm=""
          state={discoveryState}
          message={catalogMessage}
          onSelectKitchen={(kitchen) => {
            rememberHomeView();
            navigate({ to: "/kitchen/$id", params: { id: kitchen.id } });
          }}
          onRetry={() => void refreshDiscovery(address, false, false)}
          onManageAddress={openAddressManager}
          dishImagesByKitchen={kitchenDishImages}
        />

        <DishesGrid
          dishes={filteredDishes}
          selectedCategory={homeCategory ?? ALL_DISHES_CATEGORY}
          searchTerm=""
          state={discoveryState}
          message={catalogMessage}
          sort={dishSort}
          foodPreference={foodPreference}
          onSortChange={setDishSort}
          onFoodPreferenceChange={setFoodPreference}
          onRemoveFilters={() => {
            setHomeCategory(null);
            setDishSort("recommended");
          }}
          onRetry={() => void refreshDiscovery(address, false, false)}
          onManageAddress={openAddressManager}
          hasMoreRemote={hasMoreDiscoveredDishes()}
          loadingMoreRemote={dishLoadMoreBusy}
          onLoadMore={loadMoreNearbyDishes}
        />

        <HomeBottomSections />
      </main>

      <CustomerFloatingCart />

      <CartAddressAvailabilityDialog
        open={cartAvailabilityOpen}
        addressLabel={locationLabel}
        unavailableItems={unavailableCartItems}
        totalCartItems={cartItems.length}
        busy={cartRepairBusy}
        error={cartRepairError}
        onResolve={() => void resolveUnavailableCartItems()}
        onChooseAddress={openAddressManager}
        onClose={() => {
          if (cartAvailabilityKey) {
            setDismissedCartAvailabilityKey(cartAvailabilityKey);
          }
        }}
      />

      {searchOpen ? (
        <HomeSearchOverlay
          dishes={searchDishes}
          kitchens={kitchens}
          searchTerm={searchTerm}
          vegOnly={foodPreference === "veg"}
          onSearchTermChange={setSearchTerm}
          onDisableVeg={() => setFoodPreference("all")}
          onClose={() => {
            setSearchTerm("");
            setSearchOpen(false);
          }}
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
