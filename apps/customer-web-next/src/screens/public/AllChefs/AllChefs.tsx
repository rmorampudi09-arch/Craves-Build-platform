"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useNavigate } from "@tanstack/react-router";

import { CustomerFloatingCart } from "@/components/cart/CustomerFloatingCart";
import { BrowseHeader } from "@/components/home/BrowseHeader";
import { CustomerSignOutDialog } from "@/components/home/CustomerSignOutDialog";
import { KitchensGrid } from "@/components/home/KitchensGrid";
import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/lib/catalog-discovery-policy";
import type { NearbyKitchen } from "@/lib/discovery-contract";
import { rememberReturnRoute } from "@/lib/return-navigation";
import {
  cartCount,
  loadCart,
  subscribeCart,
} from "@/services/api/cravesCart";
import { discoverKitchens } from "@/services/api/kitchens";
import {
  clearSession,
  loadSelectedAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";

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
  const [state, setState] = useState<DiscoveryState>("loading");
  const [message, setMessage] = useState("Loading home chefs near your delivery address…");
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItemCount, setCartItemCount] = useState(() => cartCount());
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const refresh = useCallback(async (nextAddress: CravesAddress | null) => {
    if (
      typeof nextAddress?.lat !== "number" ||
      typeof nextAddress.lng !== "number"
    ) {
      setKitchens([]);
      setState("address-required");
      setMessage(
        "Choose a default delivery address to see all active home chefs within 10 km.",
      );
      return;
    }

    setKitchens([]);
    setState("loading");
    setMessage("Loading home chefs near your delivery address…");

    try {
      const result = await discoverKitchens(
        nextAddress.lat,
        nextAddress.lng,
        DEFAULT_DISCOVERY_RADIUS_METERS,
      );
      setKitchens(result.kitchens);
      setState("ready");
      setMessage(
        result.kitchens.length > 0
          ? "Showing active home chefs within 10 km of your delivery address."
          : "No active home chefs are available within 10 km of your delivery address yet.",
      );
    } catch (error) {
      setKitchens([]);
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
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center" role="status">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#F1F3F5] border-t-[#F62E18]" />
          <p className="mt-4 text-sm font-bold text-[#6B6B6B]">
            Finding home chefs near you…
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24 text-[#1A1A1A]">
      <BrowseHeader
        user={user}
        locationLabel={locationLabel(address)}
        locationTypeLabel={locationTypeLabel(address)}
        onOpenLocation={openAddressManager}
        cartCount={cartItemCount}
        onOpenCart={() => navigate({ to: "/cart" })}
        onLogout={() => setSignOutOpen(true)}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onSearchFocus={() => undefined}
        returnPath="/chefs"
      />

      <main>
        <KitchensGrid
          kitchens={filteredKitchens}
          searchTerm={searchTerm}
          state={state}
          message={message}
          onSelectKitchen={(kitchen) =>
            navigate({ to: "/kitchen/$id", params: { id: kitchen.id } })
          }
          onRetry={() => void refresh(address)}
          onManageAddress={openAddressManager}
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
