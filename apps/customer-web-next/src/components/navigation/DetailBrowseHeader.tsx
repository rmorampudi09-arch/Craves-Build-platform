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

  const openSearch = () => {
    window.sessionStorage.setItem("craves-home-open-search", "1");
    navigate({ to: "/home" });
  };

  const handleLogout = async () => {
    await clearSession();
    navigate({ to: "/" });
  };

  return (
    <BrowseHeader
      locationLabel={locationLabel}
      locationTypeLabel={locationTypeLabel}
      onOpenLocation={() => navigate({ to: "/addresses" })}
      cartCount={cartItemCount}
      onOpenCart={() => navigate({ to: "/cart" })}
      onLogout={() => void handleLogout()}
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      onSearchFocus={openSearch}
      returnPath={returnPath}
      onBack={onBack}
      backLabel="Back to home"
    />
  );
}

export default DetailBrowseHeader;
