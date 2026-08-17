import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  FaMapMarkerAlt,
  FaSearch,
  FaShoppingCart,
  FaSignOutAlt,
  FaUser,
} from "react-icons/fa";

import { CravesLogo } from "@/components/brand/CravesLogo";
import { PersistentCustomerServiceNav } from "@/components/navigation/PersistentCustomerServiceNav";
import type { CravesUser } from "@/services/auth/cravesAuth";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

interface BrowseHeaderProps {
  user: CravesUser;
  locationLabel: string;
  onOpenLocation: () => void;
  cartCount: number;
  onOpenCart: () => void;
  onLogout: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

const CATEGORY_SEARCH_EVENT = "craves:home-category-search";

export function BrowseHeader({
  user,
  locationLabel,
  onOpenLocation,
  cartCount,
  onOpenCart,
  onLogout,
  searchTerm,
  onSearchTermChange,
}: BrowseHeaderProps) {
  const firstName = user.firstName || user.username.split(" ")[0] || "there";

  useEffect(() => {
    const handleCategorySearch = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string") onSearchTermChange(detail);
    };

    window.addEventListener(CATEGORY_SEARCH_EVENT, handleCategorySearch);
    return () => window.removeEventListener(CATEGORY_SEARCH_EVENT, handleCategorySearch);
  }, [onSearchTermChange]);

  return (
    <header className="sticky top-0 z-40 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto max-w-[88rem] px-4 md:px-7 lg:px-10">
        <div className="flex min-h-[4.8rem] items-center gap-3 py-2.5 lg:gap-6">
          <Link
            to="/home"
            className="flex shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
            aria-label="Craves home"
          >
            <CravesLogo size="md" />
            <span className="hidden border-l border-[#E5E7EB] pl-3 text-xs font-bold tracking-[0.02em] text-[#1A1A1A] sm:block">
              Food From Home
            </span>
          </Link>

          <button
            type="button"
            onClick={onOpenLocation}
            className="hidden min-h-11 min-w-0 max-w-[15rem] items-center gap-2.5 rounded-full bg-[#F1F3F5] px-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(26,26,26,0.08)] md:flex"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18]">
              <FaMapMarkerAlt className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[#6B6B6B]">Deliver to</span>
              <span className="block truncate text-xs font-extrabold text-[#1A1A1A]">{locationLabel}</span>
            </span>
          </button>

          <label className="ml-auto hidden min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[1.35rem] bg-[#F1F3F5] px-5 transition-all duration-200 ease-out hover:scale-[1.02] hover:shadow-[0_10px_30px_rgba(26,26,26,0.09)] focus-within:scale-[1.02] focus-within:ring-2 focus-within:ring-[#F62E18] focus-within:shadow-[0_12px_34px_rgba(246,46,24,0.12)] motion-reduce:transform-none lg:flex lg:max-w-[36rem]">
            <FaSearch className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" />
            <span className="sr-only">Search dishes or home kitchens</span>
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search homemade dishes or kitchens"
              className={`${styles.searchInput} w-full p-0 text-sm font-semibold text-[#1A1A1A] placeholder:text-[#6B6B6B]`}
              type="text"
              inputMode="search"
              autoComplete="off"
              aria-label="Search homemade dishes or kitchens"
            />
          </label>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <span className="hidden text-sm font-bold text-[#1A1A1A] xl:inline">Hi, {firstName}</span>
            <Link
              to="/profile"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_7px_18px_rgba(26,26,26,0.08)]"
              aria-label="Open profile"
            >
              <FaUser className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={onOpenCart}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_7px_18px_rgba(26,26,26,0.08)]"
              aria-label={`Open cart${cartCount ? ` with ${cartCount} items` : ""}`}
            >
              <FaShoppingCart className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
              {cartCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F62E18] px-1 text-[0.62rem] font-bold text-white">
                  {cartCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="hidden h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_7px_18px_rgba(26,26,26,0.08)] xl:flex"
              aria-label="Sign out"
            >
              <FaSignOutAlt className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid gap-2.5 pb-2.5 lg:hidden">
          <label className="flex min-h-14 items-center gap-3 rounded-[1.35rem] bg-[#F1F3F5] px-5 transition-all duration-200 ease-out hover:scale-[1.01] hover:shadow-[0_8px_24px_rgba(26,26,26,0.08)] focus-within:scale-[1.01] focus-within:ring-2 focus-within:ring-[#F62E18] motion-reduce:transform-none">
            <FaSearch className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" />
            <span className="sr-only">Search dishes or home kitchens</span>
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search homemade dishes or kitchens"
              className={`${styles.searchInput} w-full p-0 text-sm font-semibold text-[#1A1A1A] placeholder:text-[#6B6B6B]`}
              type="text"
              inputMode="search"
              autoComplete="off"
              aria-label="Search homemade dishes or kitchens"
            />
          </label>
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3 pb-2.5">
          <button
            type="button"
            onClick={onOpenLocation}
            className="flex min-w-0 max-w-[8rem] shrink items-center gap-2 text-left text-xs font-bold text-[#1A1A1A] sm:max-w-[12rem] md:hidden"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <FaMapMarkerAlt className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="truncate">{locationLabel}</span>
          </button>
          <PersistentCustomerServiceNav className="ml-auto min-w-0 !gap-1 !pb-0 [&>a]:!min-h-9 [&>a]:!border-0 [&>a]:!bg-transparent [&>a]:!px-2.5 [&>a]:!text-xs [&>a]:!text-[#1A1A1A] [&>a:hover]:!bg-[#F1F3F5] [&>a:hover]:!text-[#F62E18]" />
        </div>
      </div>
    </header>
  );
}

export default BrowseHeader;
