import { Link } from "@tanstack/react-router";
import {
  LogOut,
  MapPin,
  Search,
  ShoppingCart,
  UserCircle,
} from "lucide-react";

import { CravesLogo } from "@/components/brand/CravesLogo";
import { PersistentCustomerServiceNav } from "@/components/navigation/PersistentCustomerServiceNav";
import type { CravesUser } from "@/services/auth/cravesAuth";

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

  return (
    <header className="sticky top-0 z-40 border-b border-[#ECEDEF] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex min-h-[5.25rem] items-center gap-3 py-3 lg:gap-5">
          <Link
            to="/home"
            className="flex shrink-0 items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
            aria-label="Craves home"
          >
            <CravesLogo size="md" />
          </Link>

          <button
            type="button"
            onClick={onOpenLocation}
            className="hidden min-h-12 min-w-0 max-w-[14rem] items-center gap-2 rounded-xl px-2 text-left sm:flex"
          >
            <MapPin className="h-5 w-5 shrink-0 text-[#111111]" strokeWidth={2.1} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[0.68rem] font-semibold text-muted-foreground">Deliver to</span>
              <span className="block truncate text-sm font-bold text-ink">{locationLabel}</span>
            </span>
          </button>

          <label className="ml-auto hidden min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[#E5E7E9] bg-white px-4 shadow-[0_3px_14px_rgba(17,17,17,0.05)] focus-within:border-[#F62E18] lg:flex lg:max-w-xl">
            <Search className="h-5 w-5 shrink-0 text-[#111111]" aria-hidden="true" />
            <span className="sr-only">Search dishes or home kitchens</span>
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search for dishes or home kitchens..."
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-[#93979B]"
              type="search"
              autoComplete="off"
            />
          </label>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <span className="hidden text-sm font-semibold text-ink xl:inline">Hi, {firstName}</span>
            <Link
              to="/profile"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E3E5E7] bg-white text-ink transition-colors hover:border-[#F62E18]/35 hover:bg-[#FFF7F5]"
              aria-label="Open profile"
            >
              <UserCircle className="h-6 w-6" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={onOpenCart}
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#E3E5E7] bg-white text-ink transition-colors hover:border-[#F62E18]/35 hover:bg-[#FFF7F5]"
              aria-label={`Open cart${cartCount ? ` with ${cartCount} items` : ""}`}
            >
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {cartCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F62E18] px-1 text-[0.62rem] font-bold text-white">
                  {cartCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="hidden h-11 w-11 items-center justify-center rounded-full border border-[#E3E5E7] bg-white text-ink transition-colors hover:border-[#F62E18]/35 hover:bg-[#FFF7F5] xl:flex"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 pb-3 lg:hidden">
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#E5E7E9] bg-white px-4 shadow-[0_3px_14px_rgba(17,17,17,0.04)] focus-within:border-[#F62E18]">
            <Search className="h-5 w-5 shrink-0 text-[#111111]" aria-hidden="true" />
            <span className="sr-only">Search dishes or home kitchens</span>
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search dishes or home kitchens"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-[#93979B]"
              type="search"
              autoComplete="off"
            />
          </label>
          <PersistentCustomerServiceNav className="pb-0" />
        </div>

        <div className="hidden pb-3 lg:block">
          <PersistentCustomerServiceNav className="justify-end pb-0" />
        </div>

        <button
          type="button"
          onClick={onOpenLocation}
          className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-xl bg-[#F1F3F5] px-3 text-left text-sm sm:hidden"
        >
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate font-semibold">{locationLabel}</span>
        </button>
      </div>
    </header>
  );
}

export default BrowseHeader;
