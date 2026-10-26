"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useNavigate } from "@tanstack/react-router";
import { Loader2, MapPin, RefreshCw } from "lucide-react";

import { CustomerFloatingCart } from "@/features/cart/components/CustomerFloatingCart";
import { KitchenFilterBar } from "@/features/chefs/components/KitchenFilterBar";
import { DEFAULT_KITCHEN_VIEW, sortKitchens, type KitchenView } from "@/features/chefs/lib/kitchen-filters";
import { BrowseHeader } from "@/features/home/components/BrowseHeader";
import { CustomerSignOutDialog } from "@/features/home/components/CustomerSignOutDialog";
import { CustomerPageSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { KitchensGrid } from "@/features/home/components/KitchensGrid";
import { KitchenDiscoverCard } from "@/features/chefs/components/KitchenDiscoverCard";
import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/features/home/lib/catalog-discovery-policy";
import type { NearbyKitchen } from "@/features/home/lib/discovery-contract";
import { rememberReturnRoute } from "@/shared/lib/return-navigation";
import { SPICE_LEVEL_LABELS } from "@/shared/lib/spice-level";
import { EmptyState, emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";
import {
  cartCount,
  loadCart,
  subscribeCart,
} from "@/features/cart/api/cravesCart";
import { discoverDishes, type Dish } from "@/features/dish/api/dishes";
import { discoverKitchens, loadKitchenPage } from "@/features/chefs/api/kitchens";
import {
  clearSession,
  loadSelectedAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/features/auth/api/cravesAuth";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";
/** The next page to read, while the catalog says more kitchens are in reach. */
type MorePages = { page: number; total: number; loading: boolean; failed: boolean } | null;

function locationLabel(address: CravesAddress | null): string {
  if (!address) return "Choose delivery location";
  return Array.from(
    new Set(
      [address.hno, address.street, address.mandal, address.city]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part)),
    ),
  ).join(", ");
}

function locationTypeLabel(address: CravesAddress | null): string {
  const raw = address?.label?.trim();
  const normalized = raw?.toUpperCase();
  if (normalized === "HOME") return "Home";
  if (normalized === "WORK") return "Work";
  if (normalized === "OTHER") return "Other";
  return raw || "Location";
}

/** "Coming soon to Kondapur", like the app: a short area name, else "your area". */
function comingSoonTitle(address: CravesAddress | null): string {
  const area = address?.mandal?.trim() || address?.city?.trim();
  return `Coming soon to ${area && area.length <= 28 && !area.includes(",") ? area : "your area"}`;
}

export function AllChefsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CravesUser | null>(null);
  const [address, setAddress] = useState<CravesAddress | null>(null);
  const [kitchens, setKitchens] = useState<NearbyKitchen[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [state, setState] = useState<DiscoveryState>("loading");
  const [more, setMore] = useState<MorePages>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItemCount, setCartItemCount] = useState(() => cartCount());
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [view, setView] = useState<KitchenView>(DEFAULT_KITCHEN_VIEW);
  // Only the latest load may fill the list: an older one (say, before a spice change) lands late.
  const latestRefresh = useRef(0);

  const refresh = useCallback(async (nextAddress: CravesAddress | null, spice: KitchenView["spice"] = "any") => {
    const request = ++latestRefresh.current;
    setMore(null);
    if (
      typeof nextAddress?.lat !== "number" ||
      typeof nextAddress.lng !== "number"
    ) {
      setKitchens([]);
      setDishes([]);
      setState("address-required");
      return;
    }

    setKitchens([]);
    setState("loading");

    try {
      const [kitchenResult, dishResult] = await Promise.allSettled([
        discoverKitchens(
          nextAddress.lat,
          nextAddress.lng,
          DEFAULT_DISCOVERY_RADIUS_METERS,
          spice === "any" ? undefined : spice,
        ),
        discoverDishes(
          nextAddress.lat,
          nextAddress.lng,
          DEFAULT_DISCOVERY_RADIUS_METERS,
        ),
      ]);
      if (request !== latestRefresh.current) return;

      if (kitchenResult.status !== "fulfilled") {
        throw kitchenResult.reason;
      }

      // Without dishes the cards still show, just without dish photos, prep time or prices.
      setDishes(dishResult.status === "fulfilled" ? dishResult.value : []);
      setKitchens(kitchenResult.value.kitchens);
      setMore(
        kitchenResult.value.hasNext
          ? { page: 1, total: kitchenResult.value.totalElements, loading: false, failed: false }
          : null,
      );
      setState("ready");
    } catch {
      if (request !== latestRefresh.current) return;
      setKitchens([]);
      setDishes([]);
      setState("error");
    }
  }, []);

  // The app reads kitchens a page at a time to the end; here the next page comes on "Show more".
  const showMore = async () => {
    if (!more || more.loading || typeof address?.lat !== "number" || typeof address.lng !== "number") return;
    const request = latestRefresh.current;
    setMore({ ...more, loading: true, failed: false });
    try {
      const next = await loadKitchenPage(
        address.lat,
        address.lng,
        DEFAULT_DISCOVERY_RADIUS_METERS,
        more.page,
        view.spice === "any" ? undefined : view.spice,
      );
      if (request !== latestRefresh.current) return;
      setKitchens((current) => {
        const seen = new Set(current.map((kitchen) => kitchen.id));
        return [...current, ...next.kitchens.filter((kitchen) => !seen.has(kitchen.id))];
      });
      setMore(next.hasNext ? { page: more.page + 1, total: next.totalElements, loading: false, failed: false } : null);
    } catch {
      if (request === latestRefresh.current) setMore({ ...more, loading: false, failed: true });
    }
  };

  useEffect(() => {
    let active = true;

    const syncCart = () => {
      if (active) setCartItemCount(cartCount());
    };
    const unsubscribeCart = subscribeCart(syncCart);

    void (async () => {
      const current = await loadSession();
      if (!active) return;
      if (!current) {
        navigate({ to: "/", replace: true });
        return;
      }
      setUser(current);

      try {
        const selected = await loadSelectedAddress();
        if (!active) return;
        setAddress(selected);
        await refresh(selected);
      } catch {
        if (!active) return;
        setAddress(null);
        setKitchens([]);
        setState("error");
      }

      try {
        await loadCart();
        syncCart();
      } catch {
        if (active) setCartItemCount(0);
      }
    })();

    return () => {
      active = false;
      unsubscribeCart();
    };
  }, [navigate, refresh]);

  const filteredKitchens = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("en-IN");
    if (!query) return kitchens;

    return kitchens.filter((kitchen) =>
      [
        kitchen.kitchenName,
        kitchen.displayName,
        kitchen.description,
        kitchen.areaName,
        kitchen.city,
        kitchen.state,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLocaleLowerCase("en-IN")
        .includes(query),
    );
  }, [kitchens, searchTerm]);

  const changeView = (next: KitchenView) => {
    setView(next);
    if (next.spice !== view.spice) void refresh(address, next.spice);
  };

  const openAddressManager = useCallback(() => {
    rememberReturnRoute("/addresses", "/chefs");
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
    return <CustomerPageSkeleton variant="chefs" label="Loading nearby home chefs" />;
  }

  // One state for the page instead of a list, as in the app; null while the list shows.
  let pageState: ReactNode = null;
  if (state === "address-required") {
    pageState = (
      <EmptyState
        illustration="location"
        title="Choose your location"
        message="Select a saved address to discover active home kitchens nearby."
      >
        <button type="button" onClick={openAddressManager} className="craves-primary-action">
          <MapPin className="h-5 w-5" aria-hidden="true" />
          Choose location
        </button>
      </EmptyState>
    );
  } else if (state === "error") {
    pageState = (
      <EmptyState
        role="alert"
        illustration="loadError"
        title="Home chefs could not be loaded"
        message="Check your connection and try again."
      >
        <button type="button" onClick={() => void refresh(address, view.spice)} className="craves-primary-action">
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
          Try again
        </button>
      </EmptyState>
    );
  } else if (state === "ready" && kitchens.length === 0 && view.spice === "any") {
    pageState = (
      <EmptyState
        illustration="comingSoonArea"
        title={comingSoonTitle(address)}
        message="Home chefs don't cook near this address yet. Try another address."
      >
        <button type="button" onClick={openAddressManager} className="craves-primary-action">
          Change delivery address
        </button>
      </EmptyState>
    );
  } else if (state === "ready" && filteredKitchens.length === 0) {
    const spiceOnly = kitchens.length === 0;
    pageState = (
      <EmptyState
        illustration="search"
        title="No matching kitchens"
        message={
          spiceOnly && view.spice !== "any"
            ? `No home chefs near you are cooking ${SPICE_LEVEL_LABELS[view.spice].toLowerCase()} dishes right now.`
            : more
              ? "None of the kitchens shown so far match. Try another chef, kitchen name or area, or show more kitchens."
              : "Try another chef, kitchen name or area."
        }
      >
        {spiceOnly ? (
          <button type="button" onClick={() => changeView({ ...view, spice: "any" })} className="craves-primary-action">
            Clear spice filter
          </button>
        ) : (
          <button type="button" onClick={() => setSearchTerm("")} className="craves-primary-action">
            Clear search
          </button>
        )}
      </EmptyState>
    );
  }
  // Filters stay while they can still change what shows: not before an address, and not when no kitchen is near.
  const showFilters =
    Boolean(address) && (state === "loading" || (state === "ready" && (kitchens.length > 0 || view.spice !== "any")));

  return (
    <div className="min-h-screen bg-white pb-24 text-[#1A1A1A]">
      <BrowseHeader
        locationLabel={locationLabel(address)}
        locationTypeLabel={locationTypeLabel(address)}
        onOpenLocation={openAddressManager}
        cartCount={cartItemCount}
        onOpenCart={() => navigate({ to: "/cart" })}
        onLogout={() => setSignOutOpen(true)}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onSearchActivate={() => undefined}
        returnPath="/chefs"
        searchPlaceholder="Search chefs, kitchens or area"
      />

      <main>
        <div className="mx-auto max-w-[88rem] px-4 pt-4 md:px-7 md:pt-5 lg:px-10">
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-[-0.03em] text-[#261A15] md:text-4xl">
            Discover home chefs
          </h1>
          {/* Spice reloads from the address, so the filters wait for it. */}
          {showFilters ? (
            <div className="pt-3 md:pt-4">
              <KitchenFilterBar view={view} onViewChange={changeView} />
            </div>
          ) : null}
        </div>
        {pageState ?? (
          <KitchensGrid
            kitchens={sortKitchens(filteredKitchens, view.sort)}
            searchTerm={searchTerm}
            state={state}
            message=""
            onSelectKitchen={(kitchen) =>
              navigate({ to: "/kitchen/$id", params: { id: kitchen.id } })
            }
            onRetry={() => void refresh(address, view.spice)}
            onManageAddress={openAddressManager}
            dishes={dishes}
            renderKitchen={(kitchen, summary, open) => <KitchenDiscoverCard kitchen={kitchen} summary={summary} onOpen={open} />}
          />
        )}
        {state === "ready" && more ? (
          <div className="mx-auto flex max-w-[88rem] flex-col items-center gap-2 px-4 pb-4 md:px-7 lg:px-10">
            {more.failed ? (
              <p role="alert" className="text-[0.9375rem] font-semibold text-[#D92714]">
                More kitchens could not be loaded. Check your connection and try again.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void showMore()}
              disabled={more.loading}
              aria-busy={more.loading}
              // The shared class needs "!" on a button, where the site's base button colours otherwise win.
              className={`${emptyStateSecondaryAction} !border-[#F62E18] !bg-white !text-[#D92714] !shadow-none hover:!bg-[#FDEAE8] disabled:cursor-wait`}
            >
              {more.loading ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
              {more.total > kitchens.length
                ? `Show ${more.total - kitchens.length} more home chefs`
                : "Show more home chefs"}
            </button>
          </div>
        ) : null}
      </main>

      <CustomerFloatingCart />

      <CustomerSignOutDialog
        open={signOutOpen}
        busy={signingOut}
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => void handleLogout()}
      />
    </div>
  );
}

export default AllChefsPage;
