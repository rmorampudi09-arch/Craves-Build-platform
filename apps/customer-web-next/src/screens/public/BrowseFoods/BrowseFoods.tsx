import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { BrowseHeader } from "@/components/home/BrowseHeader";
import { CartAddressAvailabilityDialog } from "@/components/home/CartAddressAvailabilityDialog";
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
import { WelcomeBanner } from "@/components/home/WelcomeBanner";
import { ALL_DISHES_CATEGORY } from "@/constants/dishCategories";
import { formatDiscoveryRadius } from "@/lib/catalog-discovery-policy";
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
  cartCurrency,
  cartTotal,
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
  loadKitchenMenu,
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

function isSameBrowsingAddress(
  left: CravesAddress | null,
  right: CravesAddress | null,
): boolean {
  if (!left || !right) return left === right;
  if (left.id && right.id) return left.id === right.id;
  return left.lat === right.lat && left.lng === right.lng;
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
  const [cartItems, setCartItems] = useState<CartItem[]>(() => getCart());
  const [unavailableCartItems, setUnavailableCartItems] = useState<CartItem[]>([]);
  const [dismissedCartAvailabilityKey, setDismissedCartAvailabilityKey] = useState<string | null>(null);
  const [cartRepairBusy, setCartRepairBusy] = useState(false);
  const [cartRepairError, setCartRepairError] = useState<string | null>(null);
  const [kitchens, setKitchens] = useState<NearbyKitchen[]>(initialCache.kitchens);
  const [defaultAddressResolved, setDefaultAddressResolved] = useState(false);
  const [kitchenDiscoveryVerified, setKitchenDiscoveryVerified] = useState(hasInitialCatalog);
  const [nearbyDishes, setNearbyDishes] = useState<Dish[]>(initialCache.dishes);
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

  const refreshDiscovery = useCallback(async (
    activeAddress: CravesAddress | null,
    resetFilters = true,
    preserveExistingCatalog = false,
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
      discoverKitchens(activeAddress.lat, activeAddress.lng, 5_000),
      discoverDishes(activeAddress.lat, activeAddress.lng),
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
      setCatalogMessage("No active home kitchens or dishes were returned for your default address yet.");
    } else if (kitchenResult.status === "rejected" || dishResult.status === "rejected") {
      setCatalogMessage("Some nearby results are temporarily unavailable. Showing the live results we could load.");
    } else {
      setCatalogMessage("Fresh homemade food available near your default delivery address.");
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

  useEffect(() => {
    restoreHomeView();
  }, [restoreHomeView]);

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
      setCartSubtotal(cartTotal());
      setCartCurrencyCode(cartCurrency());
      setCartItems(getCart());
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
        const defaultAddress = await loadSelectedAddress();
        if (!active) return;
        const canPreserveInitialCatalog = isSameBrowsingAddress(
          initialCache.address,
          defaultAddress,
        );
        setAddress(defaultAddress);
        setCatalogMessage(
          defaultAddress
            ? "Loading food near your default delivery address…"
            : "Choose a default delivery address to see nearby food.",
        );
        await refreshDiscovery(defaultAddress, false, canPreserveInitialCatalog);
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
          setCartSubtotal(0);
          setCartCurrencyCode("INR");
          setCartItems([]);
        }
      }
    })();

    const unsubscribeCart = subscribeCart(syncCartSummary);
    return () => {
      active = false;
      unsubscribeCart();
    };
  }, [initialCache.address, navigate, refreshDiscovery]);

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
      const foodType = dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG");
      const foodTypeMatches =
        foodPreference === "all" ||
        (foodPreference === "veg" && foodType === "VEG") ||
        (foodPreference === "non-veg" && foodType === "NON_VEG") ||
        (foodPreference === "egg" && foodType === "EGG");
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

  const locationLabel = address
    ? [address.mandal, address.city].filter(Boolean).join(", ")
    : "Choose default address";

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
        onOpenLocation={openAddressManager}
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
          searchTerm={searchTerm}
          state={discoveryState}
          message={catalogMessage}
          onSelectKitchen={(kitchen) => {
            rememberHomeView();
            navigate({ to: "/kitchen/$id", params: { id: kitchen.id } });
          }}
          onRetry={() => void refreshDiscovery(address, false, true)}
          onManageAddress={openAddressManager}
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
          onRetry={() => void refreshDiscovery(address, false, true)}
          onManageAddress={openAddressManager}
        />

        <HomeBottomSections />
      </main>

      <FloatingCartBar
        itemCount={cartItemCount}
        total={cartSubtotal}
        currency={cartCurrencyCode}
        onViewCart={() => navigate({ to: "/cart" })}
      />

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
