import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { preconnect } from "react-dom";

import { BrowseHeader } from "@/features/home/components/BrowseHeader";
import { CustomerPageSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { CartAddressAvailabilityBanner } from "@/features/home/components/CartAddressAvailabilityBanner";
import { CustomerSignOutDialog } from "@/features/home/components/CustomerSignOutDialog";
import { DishesGrid } from "@/features/home/components/DishesGrid";
import { CustomerFloatingCart } from "@/features/cart/components/CustomerFloatingCart";
import {
  HomeCategoryRail,
  type CravingCategory,
} from "@/features/home/components/HomeCategoryRail";
import { KitchensGrid } from "@/features/home/components/KitchensGrid";
import { WelcomeBanner } from "@/features/home/components/WelcomeBanner";
import { holdScrollChrome } from "@/shared/components/navigation/AutoHideCustomerHeader";
import { returnedToOverlayEntry } from "@/shared/ui/overlays/overlay";
import { ALL_DISHES_CATEGORY } from "@/features/home/lib/dishCategories";
import {
  DEFAULT_DISCOVERY_RADIUS_METERS,
} from "@/features/home/lib/catalog-discovery-policy";
import { type NearbyKitchen } from "@/features/home/lib/discovery-contract";
import {
  clearHomeReturnState,
  DEFAULT_DISH_FILTERS,
  readHomeReturnState,
  saveHomeReturnState,
  type HomeDishFilters,
  type HomeDishSort,
  type HomeFoodPreference,
} from "@/features/home/lib/home-return-state";
import {
  matchesDishFilters,
  matchesFoodPreference,
  sortDishes,
  type DishView,
} from "@/features/home/lib/dish-filters";
import {
  deliveryPlaceLabel,
  useCartAddressAvailability,
} from "@/features/home/lib/cart-address-availability";
import { rememberReturnRoute } from "@/shared/lib/return-navigation";
import {
  cartCount,
  getCart,
  loadCart,
  subscribeCart,
  type CartItem,
} from "@/features/cart/api/cravesCart";
import {
  allDishes,
  discoverDishes,
  hasMoreDiscoveredDishes,
  loadKitchenMenu,
  loadMoreDiscoveredDishes,
  type Dish,
} from "@/features/dish/api/dishes";
import {
  allKitchens,
  discoverKitchens,
} from "@/features/chefs/api/kitchens";
import {
  clearSession,
  getAddress,
  getSession,
  AuthenticationRequiredError,
  loadSelectedAddress,
  loadSession,
  recoverSessionSnapshotForNavigation,
  subscribeSession,
  type CravesAddress,
  type CravesUser,
} from "@/features/auth/api/cravesAuth";
import styles from "./HomeReference.module.css";

const HomeBottomSections = dynamic(
  () =>
    import("@/features/home/components/HomeBottomSections").then(
      (module) => module.HomeBottomSections,
    ),
  { ssr: false, loading: () => null },
);

type SearchOverlay = typeof import("@/features/home/components/HomeSearchOverlay").HomeSearchOverlay;

// The search overlay stays out of the first bundle. It is fetched when the page goes idle
// or a finger lands on search, and kept in state rather than behind next/dynamic: a lazy
// component suspends on its first mount, and React holds a revealed Suspense boundary back
// for up to 300 ms, which made search open late even when the code was already loaded.
let searchOverlayModule: Promise<SearchOverlay> | null = null;
function loadHomeSearchOverlay(): Promise<SearchOverlay> {
  searchOverlayModule ??= import("@/features/home/components/HomeSearchOverlay").then(
    (module) => module.HomeSearchOverlay,
  );
  return searchOverlayModule;
}

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

/** A dish belongs to a craving when its name, category or description mentions one of its words. */
function matchesCraving(dish: Dish, keywords: readonly string[] | null): boolean {
  if (!keywords) return true;
  const searchable = `${dish.name} ${dish.category} ${dish.desc}`.toLocaleLowerCase("en-IN");
  return keywords.some((keyword) => searchable.includes(keyword));
}

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

/** The cart check keeps the menus it reads in Home's dish cache, like any kitchen menu Home opens. */
const readKitchenMenu = (kitchenId: string) => loadKitchenMenu(kitchenId);
/** Where dish photos were served from last time, so the next visit can connect early. */
const MEDIA_ORIGIN_KEY = "craves.media-origin";

function isCravingCategory(value: string | null): value is CravingCategory {
  return value !== null && CRAVING_CATEGORIES.has(value as CravingCategory);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

const noSubscribe = () => () => {};

function BrowseFoodsPage() {
  const navigate = useNavigate();
  // Cached dishes, address and cart paint Home instantly when it opens inside the app. A full
  // page load must first match the server's empty Home (no browser storage there), so it starts
  // empty and the mount effect fills it in; otherwise React throws the page away (error #418).
  const hydrating = !useSyncExternalStore(noSubscribe, () => true, () => false);
  const [initialCache] = useState(() => hydrating
    ? { user: null, address: null, dishes: [] as Dish[], kitchens: [] as NearbyKitchen[] }
    : {
        user: getSession() ?? recoverSessionSnapshotForNavigation(),
        address: getAddress(),
        dishes: allDishes(),
        kitchens: allKitchens(),
      });
  const hasInitialCatalog =
    initialCache.dishes.length > 0 || initialCache.kitchens.length > 0;

  const [user, setUser] = useState<CravesUser | null>(initialCache.user);
  const [address, setAddress] = useState<CravesAddress | null>(initialCache.address);
  const [homeCategory, setHomeCategory] = useState<CravingCategory | null>(null);
  const [dishSort, setDishSort] = useState<HomeDishSort>("recommended");
  const [foodPreference, setFoodPreference] = useState<HomeFoodPreference>("all");
  const [dishFilters, setDishFilters] = useState<HomeDishFilters>(DEFAULT_DISH_FILTERS);
  // The rail, Veg switch and filter chips answer a tap in the next frame; the dish list
  // re-renders from these right after, so a slow phone never delays the pressed state.
  const listCategory = useDeferredValue(homeCategory);
  const listSort = useDeferredValue(dishSort);
  const listFoodPreference = useDeferredValue(foodPreference);
  const listDishFilters = useDeferredValue(dishFilters);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [HomeSearchOverlay, setHomeSearchOverlay] = useState<SearchOverlay | null>(null);
  const preloadHomeSearchOverlay = useCallback(() => {
    void loadHomeSearchOverlay()
      .then((overlay) => setHomeSearchOverlay(() => overlay))
      .catch(() => {
        // Offline or a stale deploy: the next tap on search tries again.
        searchOverlayModule = null;
      });
  }, []);
  // Search opens on a tap or click, or on typing; never because Tab landed on the field (WCAG 3.2.1).
  // The field a keyboard user typed into gets focus back when search closes.
  const searchOpenerRef = useRef<HTMLElement | null>(null);
  const openSearchOnTap = useCallback(() => {
    preloadHomeSearchOverlay();
    searchOpenerRef.current = null;
    setSearchOpen(true);
  }, [preloadHomeSearchOverlay]);
  const typeInSearch = useCallback((value: string) => {
    setSearchTerm(value);
    if (searchOpen) return;
    preloadHomeSearchOverlay();
    searchOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSearchOpen(true);
  }, [preloadHomeSearchOverlay, searchOpen]);
  const closeSearch = useCallback(() => {
    setSearchTerm("");
    setSearchOpen(false);
    const opener = searchOpenerRef.current;
    searchOpenerRef.current = null;
    if (opener?.isConnected) window.requestAnimationFrame(() => opener.focus({ preventScroll: true }));
  }, []);
  const [cartItemCount, setCartItemCount] = useState(() => (hydrating ? 0 : cartCount()));
  const [cartItems, setCartItems] = useState<CartItem[]>(() => (hydrating ? [] : getCart()));
  const [kitchens, setKitchens] = useState<NearbyKitchen[]>(initialCache.kitchens);
  const [defaultAddressResolved, setDefaultAddressResolved] = useState(() =>
    Boolean(initialCache.address),
  );
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
  // After a full page load has hydrated the empty Home, paint the cached Home before the first
  // frame, so a reload shows your address, cart and dishes at once (the network then refreshes).
  const startedEmpty = useRef(hydrating);
  useLayoutEffect(() => {
    if (!startedEmpty.current) return;
    startedEmpty.current = false;
    const cachedAddress = getAddress();
    const cachedDishes = allDishes();
    const cachedKitchens = allKitchens();
    setUser(getSession() ?? recoverSessionSnapshotForNavigation());
    setAddress(cachedAddress);
    setDefaultAddressResolved(Boolean(cachedAddress));
    setCartItemCount(cartCount());
    setCartItems(getCart());
    if (cachedDishes.length === 0 && cachedKitchens.length === 0) return;
    setNearbyDishes(cachedDishes);
    setKitchens(cachedKitchens);
    setKitchenDiscoveryVerified(true);
    setDiscoveryState("ready");
    setCatalogMessage("Fresh homemade food available near your default delivery address.");
  }, []);

  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [sessionRetryNonce, setSessionRetryNonce] = useState(0);
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
    setFoodPreference(restored.foodPreference);
    setDishFilters(restored.dishFilters);
    // Back from a dish or kitchen opened in search lands on search's history entry and shows the
    // same results; any other way back to Home (tab, logo) starts with search closed.
    const backToSearch = restored.searchOpen && returnedToOverlayEntry();
    setSearchTerm(backToSearch ? restored.searchTerm : "");
    setSearchOpen(backToSearch);
    if (backToSearch) preloadHomeSearchOverlay();
  }, [preloadHomeSearchOverlay]);

  const rememberHomeView = useCallback(() => {
    window.history.scrollRestoration = "manual";
    saveHomeReturnState({
      scrollY: window.scrollY,
      searchTerm: searchOpen ? searchTerm : "",
      searchOpen,
      homeCategory,
      dishSort,
      foodPreference,
      dishFilters,
    });
  }, [dishFilters, dishSort, foodPreference, homeCategory, searchOpen, searchTerm]);

  // The search overlay is its own chunk: fetch it once the page is idle, so the first tap
  // on search opens it at once instead of waiting for the download.
  useEffect(() => {
    if (typeof window.requestIdleCallback !== "function") {
      const timer = window.setTimeout(preloadHomeSearchOverlay, 1500);
      return () => window.clearTimeout(timer);
    }
    const handle = window.requestIdleCallback(preloadHomeSearchOverlay, { timeout: 3000 });
    return () => window.cancelIdleCallback(handle);
  }, [preloadHomeSearchOverlay]);

  // One way to bring the dish list into view after a category, Veg or sort
  // change: land the section just below the stuck rail, jump when it is more
  // than a screen away (a long smooth scroll would toggle all the chrome), and
  // keep the chrome still while the page moves. The move waits for the new list
  // (layout effect below), so the page and the list change in the same frame.
  const pendingRevealRef = useRef<{ onlyIfPast: boolean } | null>(null);
  const revealDishes = useCallback((onlyIfPast = false) => {
    pendingRevealRef.current = { onlyIfPast };
  }, []);

  useLayoutEffect(() => {
    const request = pendingRevealRef.current;
    pendingRevealRef.current = null;
    if (!request) return;
    const section = document
      .getElementById("available-dishes-heading")
      ?.closest("section");
    if (!section) return;
    const rail = document.querySelector<HTMLElement>("[data-craves-category-rail]");
    const chromeBottom = rail
      ? (parseFloat(getComputedStyle(rail).top) || 0) + rail.offsetHeight
      : 0;
    const target = Math.max(
      0,
      Math.round(section.getBoundingClientRect().top + window.scrollY - chromeBottom),
    );
    const distance = Math.abs(target - window.scrollY);
    if (distance < 2 || (request.onlyIfPast && window.scrollY <= target)) return;

    holdScrollChrome();
    if (distance > window.innerHeight || prefersReducedMotion()) {
      forceInstantWindowScroll(target);
    } else {
      window.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [listCategory, listSort, listFoodPreference, listDishFilters]);

  const changeFoodPreference = useCallback((next: HomeFoodPreference) => {
    setFoodPreference(next);
    // Veg lives in the header: only move the page when the list it changes is above.
    revealDishes(true);
  }, [revealDishes]);

  const handleDetailNavigationCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    const href = anchor?.getAttribute("href");
    if (
      href?.startsWith("/dish/") ||
      href?.startsWith("/kitchen/") ||
      href?.startsWith("/chef/") ||
      href === "/chefs"
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
        holdScrollChrome();
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
    // Words typed in a dish or kitchen page's search field (Enter) carry over.
    const term = window.sessionStorage.getItem("craves-home-search-term");
    window.sessionStorage.removeItem("craves-home-search-term");
    if (term) setSearchTerm(term);
    preloadHomeSearchOverlay();
    setSearchOpen(true);
  }, [preloadHomeSearchOverlay]);

  useEffect(() => {
    let active = true;

    const syncCartSummary = () => {
      if (!active) return;
      setCartItemCount(cartCount());
      setCartItems(getCart());
    };

    void (async () => {
      setSessionUnavailable(false);
      let current: CravesUser | null = null;

      try {
        current = await loadSession({
          failFastUnauthenticated: true,
          hydrateCustomerProfile: "background",
        });
      } catch (error) {
        if (error instanceof AuthenticationRequiredError) {
          navigate({ to: "/", replace: true });
          return;
        }
        // Keep the customer on the signed-in surface during a network/BFF
        // interruption. One retry handles short mobile hand-offs cleanly.
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        if (!active) return;
        try {
          current = await loadSession({
            failFastUnauthenticated: true,
            hydrateCustomerProfile: "background",
          });
        } catch (retryError) {
          if (retryError instanceof AuthenticationRequiredError) {
            navigate({ to: "/", replace: true });
            return;
          }
          current = getSession() ?? recoverSessionSnapshotForNavigation();
          if (!current && active) {
            setSessionUnavailable(true);
            setDefaultAddressResolved(true);
            return;
          }
        }
      }
      if (!active) return;

      // A confirmed missing session gets one final check before we show the
      // public landing page. Transient failures above never clear the screen.
      if (!current) {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        if (!active) return;
        try {
          current = await loadSession({
            failFastUnauthenticated: true,
            hydrateCustomerProfile: "background",
          });
        } catch (error) {
          if (error instanceof AuthenticationRequiredError) {
            navigate({ to: "/", replace: true });
            return;
          }
          current = getSession() ?? recoverSessionSnapshotForNavigation();
          if (!current) {
            setSessionUnavailable(true);
            setDefaultAddressResolved(true);
            return;
          }
        }
        if (!active) return;
      }

      if (!current) {
        current = getSession() ?? recoverSessionSnapshotForNavigation();
      }

      if (!current) {
        navigate({ to: "/", replace: true });
        return;
      }

      setSessionUnavailable(false);
      setUser(current);
      setDefaultAddressResolved(true);

      const cartLoad = loadCart()
        .then(() => {
          if (active) syncCartSummary();
        })
        .catch(() => {
          if (active) {
            setCartItemCount(0);
            setCartItems([]);
          }
        });

      try {
        const defaultAddress = await loadSelectedAddress();
        if (!active) return;
        setAddress(defaultAddress);
        setCatalogMessage(
          defaultAddress
            ? "Loading food near your default delivery address…"
            : "Choose a default delivery address to see nearby food.",
        );
        const shouldPreserveCatalog =
          allDishes().length > 0 || allKitchens().length > 0;
        await refreshDiscovery(defaultAddress, false, shouldPreserveCatalog);
      } catch (error) {
        if (!active) return;
        setAddress(null);
        setKitchens([]);
        setKitchenDiscoveryVerified(false);
        setNearbyDishes([]);
        setDiscoveryState("error");
        setDefaultAddressResolved(true);
        setCatalogMessage(
          error instanceof Error
            ? error.message
            : "Your default delivery address could not be loaded.",
        );
      }

      void cartLoad;
    })();

    const unsubscribeCart = subscribeCart(syncCartSummary);
    const unsubscribeSession = subscribeSession(() => {
      if (!active) return;
      const current = getSession();
      if (current) setUser(current);
    });
    return () => {
      active = false;
      unsubscribeCart();
      unsubscribeSession();
    };
  }, [navigate, refreshDiscovery, sessionRetryNonce]);

  const nearbyKitchenIds = useMemo(() => new Set(kitchens.map((kitchen) => kitchen.id)), [kitchens]);
  const nearbyDishIds = useMemo(() => new Set(nearbyDishes.map((dish) => dish.id)), [nearbyDishes]);
  const {
    unavailableItems: unavailableCartItems,
    open: cartAvailabilityOpen,
    busy: cartRepairBusy,
    error: cartRepairError,
    resolve: resolveUnavailableCartItems,
    dismiss: dismissCartAvailability,
  } = useCartAddressAvailability({
    items: cartItems,
    // Checked against what Home discovered for this address, once discovery has answered.
    address: defaultAddressResolved && discoveryState === "ready" && kitchenDiscoveryVerified ? address : null,
    nearbyKitchenIds,
    nearbyDishIds,
    readMenu: readKitchenMenu,
  });

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

  // Dish photos come from one storage host: open that connection while discovery is loading,
  // instead of after the first card asks for its photo.
  useEffect(() => {
    try {
      const origin = window.localStorage.getItem(MEDIA_ORIGIN_KEY);
      if (origin?.startsWith("https://") && new URL(origin).origin === origin) preconnect(origin);
    } catch {
      // No hint: the first photo opens the connection itself.
    }
  }, []);
  useEffect(() => {
    const photo = nearbyDishes.find((dish) => !dish.imageIsPlaceholder)?.img;
    if (!photo?.startsWith("https://")) return;
    try {
      window.localStorage.setItem(MEDIA_ORIGIN_KEY, new URL(photo).origin);
    } catch {
      // Storage blocked: nothing to remember.
    }
  }, [nearbyDishes]);

  const filteredKitchens = kitchens;

  const filteredDishes = useMemo(() => {
    const homeKeywords = listCategory ? HOME_CATEGORY_KEYWORDS[listCategory] : null;
    return sortDishes(
      nearbyDishes.filter(
        (dish) =>
          matchesCraving(dish, homeKeywords) &&
          matchesFoodPreference(dish, listFoodPreference) &&
          matchesDishFilters(dish, listDishFilters),
      ),
      listSort,
    );
  }, [listCategory, listDishFilters, listFoodPreference, listSort, nearbyDishes]);

  // The filter sheet's "Show N dishes": the same rules on the current craving, for a draft view.
  const countDishes = useCallback(
    (view: DishView) => {
      const keywords = homeCategory ? HOME_CATEGORY_KEYWORDS[homeCategory] : null;
      return nearbyDishes.filter(
        (dish) =>
          matchesCraving(dish, keywords) &&
          matchesFoodPreference(dish, view.foodPreference) &&
          matchesDishFilters(dish, view.filters),
      ).length;
    },
    [homeCategory, nearbyDishes],
  );
  const dishView = useMemo<DishView>(
    () => ({ sort: dishSort, filters: dishFilters, foodPreference }),
    [dishFilters, dishSort, foodPreference],
  );
  const changeDishView = useCallback((next: DishView) => {
    setDishSort(next.sort);
    setDishFilters(next.filters);
    setFoodPreference(next.foodPreference);
    revealDishes();
  }, [revealDishes]);

  const locationLabel = address ? deliveryPlaceLabel(address) : "Choose delivery location";
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
      foodPreference === "all"
        ? nearbyDishes
        : nearbyDishes.filter((dish) => matchesFoodPreference(dish, foodPreference)),
    [foodPreference, nearbyDishes],
  );

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

  if (sessionUnavailable) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-5 text-[#1A1A1A]">
        <section className="w-full max-w-md rounded-[1.5rem] border border-[#E5E7EB] bg-white p-6 text-center shadow-[0_14px_42px_rgba(26,26,26,0.08)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-xl font-black text-[#F62E18]">
            C
          </div>
          <h1 className="mt-4 text-xl font-black tracking-[-0.02em]">
            Reconnecting to Craves
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">
            Your sign-in has not been cleared. We just couldn’t reach the session service for a moment.
          </p>
          <button
            type="button"
            onClick={() => {
              setSessionUnavailable(false);
              setDefaultAddressResolved(false);
              setSessionRetryNonce((current) => current + 1);
            }}
            className="mt-5 min-h-11 rounded-xl !border-transparent !bg-[#F62E18] px-5 text-sm font-bold !text-white shadow-[0_6px_18px_rgba(26,26,26,0.14)] active:!bg-[#C4200F]"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (!user || !defaultAddressResolved) {
    return <CustomerPageSkeleton label="Loading your Craves home" />;
  }

  return (
    <div
      className={`${styles.paperSurface} min-h-screen pb-24 text-[#1A1A1A]`}
      onClickCapture={handleDetailNavigationCapture}
    >
      <BrowseHeader
        locationLabel={locationLabel}
        locationTypeLabel={locationTypeLabel}
        onOpenLocation={openAddressManager}
        cartCount={cartItemCount}
        onOpenCart={() => navigate({ to: "/cart" })}
        onLogout={() => setSignOutOpen(true)}
        searchTerm={searchTerm}
        onSearchTermChange={typeInSearch}
        onSearchActivate={openSearchOnTap}
        onSearchIntent={preloadHomeSearchOverlay}
        foodPreference={foodPreference}
        onFoodPreferenceChange={changeFoodPreference}
      />

      <main>
        <CartAddressAvailabilityBanner
          open={cartAvailabilityOpen}
          addressLabel={locationLabel}
          unavailableItems={unavailableCartItems}
          totalCartItems={cartItems.length}
          busy={cartRepairBusy}
          error={cartRepairError}
          onResolve={() => void resolveUnavailableCartItems()}
          onChooseAddress={openAddressManager}
          onClose={dismissCartAvailability}
        />

        <WelcomeBanner onOpenSearch={openSearchOnTap} />

        <HomeCategoryRail
          selected={homeCategory}
          images={categoryImages}
          onSelect={(nextCategory) => {
            // aria-pressed chips: tapping the selected one again shows every dish.
            setHomeCategory((current) => (current === nextCategory ? null : nextCategory));
            setSearchTerm("");
            revealDishes();
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
          dishes={nearbyDishes}
          limit={6}
        />

        <DishesGrid
          dishes={filteredDishes}
          selectedCategory={listCategory ?? ALL_DISHES_CATEGORY}
          searchTerm=""
          state={discoveryState}
          message={catalogMessage}
          view={dishView}
          onViewChange={changeDishView}
          countFor={countDishes}
          onRemoveFilters={() => {
            setHomeCategory(null);
            setDishSort("recommended");
            setDishFilters(DEFAULT_DISH_FILTERS);
            // Veg is the header switch's choice and stays; Egg or Non-veg came from the filters.
            setFoodPreference((current) => (current === "veg" ? current : "all"));
            revealDishes();
            // The button goes away with the filters: keep keyboard focus on the list it changed.
            window.requestAnimationFrame(() =>
              document.getElementById("available-dishes-heading")?.focus({ preventScroll: true }),
            );
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

      <AnimatePresence>
        {searchOpen && HomeSearchOverlay ? (
          <HomeSearchOverlay
            key="home-search"
            dishes={searchDishes}
            kitchens={kitchens}
            searchTerm={searchTerm}
            vegOnly={foodPreference === "veg"}
            onSearchTermChange={setSearchTerm}
            onDisableVeg={() => setFoodPreference("all")}
            onClose={closeSearch}
          />
        ) : null}
      </AnimatePresence>

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
