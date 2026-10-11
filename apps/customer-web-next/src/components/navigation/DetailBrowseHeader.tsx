import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BrowseHeader } from "@/components/home/BrowseHeader";
import {
  cartCount,
  loadCart,
  subscribeCart,
} from "@/services/api/cravesCart";
import {
  clearSession,
  getAddress,
  getSession,
  loadSelectedAddress,
} from "@/services/auth/cravesAuth";

interface DetailBrowseHeaderProps {
  returnPath: string;
  onBack: () => void;
}

export function DetailBrowseHeader({ returnPath, onBack }: DetailBrowseHeaderProps) {
  const navigate = useNavigate();
  const [address, setAddress] = useState(() => getAddress());
  const [cartItemCount, setCartItemCount] = useState(() => cartCount());
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeCart(() => setCartItemCount(cartCount()));

    void loadCart().catch(() => {
      // Keep the in-memory cart count when the remote cart cannot refresh.
    });

    if (!getAddress()) {
      void loadSelectedAddress()
        .then((selected) => {
          if (active) setAddress(selected);
        })
        .catch(() => {
          // The header can still render and let the customer choose an address.
        });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const locationLabel = address
    ? [address.mandal, address.city].filter(Boolean).join(", ")
    : "Choose address";
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

  // Home's search opens with whatever was typed here (a tap or Enter); a stale term never carries.
  const openSearch = () => {
    const term = searchTerm.trim();
    window.sessionStorage.setItem("craves-home-open-search", "1");
    if (term) window.sessionStorage.setItem("craves-home-search-term", term);
    else window.sessionStorage.removeItem("craves-home-search-term");
    navigate({ to: "/home" });
  };

  const handleLogout = async () => {
    await clearSession();
    navigate({ to: "/" });
  };

  return (
    <BrowseHeader
      user={getSession() ?? undefined}
      locationLabel={locationLabel}
      locationTypeLabel={locationTypeLabel}
      onOpenLocation={() => navigate({ to: "/addresses" })}
      cartCount={cartItemCount}
      onOpenCart={() => navigate({ to: "/cart" })}
      onLogout={() => void handleLogout()}
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      onSearchActivate={openSearch}
      onSearchSubmit={openSearch}
      returnPath={returnPath}
      onBack={onBack}
      backLabel="Back"
    />
  );
}

export default DetailBrowseHeader;
