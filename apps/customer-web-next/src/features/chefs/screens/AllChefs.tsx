"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useNavigate } from "@tanstack/react-router";

import { CustomerFloatingCart } from "@/features/cart/components/CustomerFloatingCart";
import { KitchenFilterBar } from "@/features/chefs/components/KitchenFilterBar";
import { DEFAULT_KITCHEN_VIEW, sortKitchens, type KitchenView } from "@/features/chefs/lib/kitchen-filters";
import { BrowseHeader } from "@/features/home/components/BrowseHeader";
import { CustomerSignOutDialog } from "@/features/home/components/CustomerSignOutDialog";
import { CustomerPageSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { KitchensGrid } from "@/features/home/components/KitchensGrid";
import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/features/home/lib/catalog-discovery-policy";
import type { NearbyKitchen } from "@/features/home/lib/discovery-contract";
import { rememberReturnRoute } from "@/shared/lib/return-navigation";
import { SPICE_LEVEL_LABELS } from "@/shared/lib/spice-level";
import {
  cartCount,
  loadCart,
  subscribeCart,
} from "@/features/cart/api/cravesCart";
import { discoverDishes } from "@/features/dish/api/dishes";
import { discoverKitchens } from "@/features/chefs/api/kitchens";
import {
  clearSession,
  loadSelectedAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/features/auth/api/cravesAuth";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

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

export function AllChefsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CravesUser | null>(null);
  const [address, setAddress] = useState<CravesAddress | null>(null);
  const [kitchens, setKitchens] = useState<NearbyKitchen[]>([]);
  const [dishImagesByKitchen, setDishImagesByKitchen] = useState<Record<string, string[]>>({});
  const [state, setState] = useState<DiscoveryState>("loading");
  const [message, setMessage] = useState("Loading home chefs near your delivery address…");
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItemCount, setCartItemCount] = useState(() => cartCount());
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [view, setView] = useState<KitchenView>(DEFAULT_KITCHEN_VIEW);
  // Only the latest load may fill the list: an older one (say, before a spice change) lands late.
  const latestRefresh = useRef(0);

  const refresh = useCallback(async (nextAddress: CravesAddress | null, spice: KitchenView["spice"] = "any") => {
    const request = ++latestRefresh.current;
    if (
      typeof nextAddress?.lat !== "number" ||
      typeof nextAddress.lng !== "number"
    ) {
      setKitchens([]);
      setDishImagesByKitchen({});
      setState("address-required");
      setMessage(
        "Choose a default delivery address to see all active home chefs within 50 km.",
      );
      return;
    }

    setKitchens([]);
    setState("loading");
    setMessage("Loading home chefs near your delivery address…");

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

      const previews: Record<string, string[]> = {};
      if (dishResult.status === "fulfilled") {
        for (const dish of dishResult.value) {
          if (!dish.kitchenId || dish.imageIsPlaceholder || !dish.img) continue;
          const current = previews[dish.kitchenId] ?? [];
          if (!current.includes(dish.img) && current.length < 5) {
            previews[dish.kitchenId] = [...current, dish.img];
          }
        }
      }

      setDishImagesByKitchen(previews);
      setKitchens(kitchenResult.value.kitchens);
      setState("ready");
      setMessage(
        kitchenResult.value.kitchens.length > 0
          ? "Showing active home chefs within 50 km of your delivery address."
          : spice !== "any"
            ? `No home chefs near you are cooking ${SPICE_LEVEL_LABELS[spice].toLowerCase()} dishes right now. Clear the spice filter to see every chef.`
            : "No active home chefs are available within 50 km of your delivery address yet.",
      );
    } catch (error) {
      setKitchens([]);
      setDishImagesByKitchen({});
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Home chefs are temporarily unavailable.",
      );
    }
  }, []);

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
      } catch (error) {
        if (!active) return;
        setAddress(null);
        setKitchens([]);
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Your delivery address could not be loaded.",
        );
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
      />

      <main>
        {state === "address-required" ? null : (
          <div className="mx-auto max-w-[88rem] px-4 pt-3 md:px-7 md:pt-4 lg:px-10">
            <KitchenFilterBar view={view} onViewChange={changeView} />
          </div>
        )}
        <KitchensGrid
          kitchens={sortKitchens(filteredKitchens, view.sort)}
          searchTerm={searchTerm}
          state={state}
          message={message}
          onSelectKitchen={(kitchen) =>
            navigate({ to: "/kitchen/$id", params: { id: kitchen.id } })
          }
          onRetry={() => void refresh(address, view.spice)}
          onManageAddress={openAddressManager}
          dishImagesByKitchen={dishImagesByKitchen}
        />
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
