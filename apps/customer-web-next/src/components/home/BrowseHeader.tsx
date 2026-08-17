import { Link } from "@tanstack/react-router";
import { LogOut, MapPin, Search, ShoppingBag, UserRound } from "lucide-react";

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
    <header className="sticky top-0 z-40 border-b border-[#EEDFD5]/80 bg-[#FFFBF7]/95 backdrop-blur-xl">
      <div className="mx-auto max-w-[88rem] px-4 md:px-7 lg:px-10">
        <div className="flex min-h-[4.8rem] items-center gap-3 py-2.5 lg:gap-6">
          <Link
            to="/home"
            className="flex shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
            aria-label="Craves home"
          >
            <CravesLogo size="md" />
            <span className="hidden border-l border-[#DCCFC8] pl-3 text-xs font-bold tracking-[0.02em] text-[#5B4941] sm:block">
              Food From Home
            </span>
          </Link>

          <button
            type="button"
            onClick={onOpenLocation}
            className="hidden min-h-11 min-w-0 max-w-[15rem] items-center gap-2.5 rounded-full border border-[#E9DCD4] bg-white/75 px-3.5 text-left transition hover:-translate-y-0.5 hover:border-[#F62E18]/25 hover:shadow-[0_7px_22px_rgba(60,39,30,0.07)] md:flex"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#261A15]">
              <MapPin className="h-4 w-4 fill-current" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[#967C70]">Deliver to</span>
              <span className="block truncate text-xs font-extrabold text-[#261A15]">{locationLabel}</span>
            </span>
          </button>

          <label className="ml-auto hidden min-h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-[#EADDD5] bg-white/90 px-4 shadow-[0_4px_18px_rgba(50,33,26,0.045)] transition focus-within:border-[#F62E18]/45 focus-within:shadow-[0_5px_22px_rgba(246,46,24,0.08)] lg:flex lg:max-w-[30rem]">
            <Search className="h-[1.125rem] w-[1.125rem] shrink-0 text-[#806B62]" aria-hidden="true" />
            <span className="sr-only">Search dishes or home kitchens</span>
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search homemade dishes or kitchens"
              className="w-full bg-transparent text-sm font-medium text-[#261A15] outline-none placeholder:text-[#A28F86]"
              type="search"
              autoComplete="off"
            />
          </label>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <span className="hidden text-sm font-bold text-[#5B4941] xl:inline">Hi, {firstName}</span>
            <Link
              to="/profile"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#261A15] transition duration-200 hover:-translate-y-0.5 hover:bg-[#E9ECEF]"
              aria-label="Open profile"
            >
              <UserRound className="h-5 w-5 fill-current" strokeWidth={1.6} aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={onOpenCart}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#261A15] transition duration-200 hover:-translate-y-0.5 hover:bg-[#E9ECEF]"
              aria-label={`Open cart${cartCount ? ` with ${cartCount} items` : ""}`}
            >
              <ShoppingBag className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
              {cartCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F62E18] px-1 text-[0.62rem] font-bold text-white">
                  {cartCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="hidden h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5] text-[#261A15] transition duration-200 hover:-translate-y-0.5 hover:bg-[#FFE9E4] hover:text-[#C92716] xl:flex"
              aria-label="Sign out"
            >
              <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid gap-2.5 pb-2.5 lg:hidden">
          <label className="flex min-h-11 items-center gap-3 rounded-full border border-[#EADDD5] bg-white px-4 shadow-[0_3px_14px_rgba(50,33,26,0.04)] focus-within:border-[#F62E18]/45">
            <Search className="h-[1.125rem] w-[1.125rem] shrink-0 text-[#806B62]" aria-hidden="true" />
            <span className="sr-only">Search dishes or home kitchens</span>
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search homemade dishes or kitchens"
              className="w-full bg-transparent text-sm font-medium text-[#261A15] outline-none placeholder:text-[#A28F86]"
              type="search"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3 pb-2.5">
          <button
            type="button"
            onClick={onOpenLocation}
            className="flex min-w-0 max-w-[8rem] shrink items-center gap-2 text-left text-xs font-bold text-[#5F4C44] sm:max-w-[12rem] md:hidden"
          >
            <MapPin className="h-4 w-4 shrink-0 fill-current" strokeWidth={1.6} aria-hidden="true" />
            <span className="truncate">{locationLabel}</span>
          </button>
          <PersistentCustomerServiceNav className="ml-auto min-w-0 !gap-1 !pb-0 [&>a]:!min-h-9 [&>a]:!border-0 [&>a]:!bg-transparent [&>a]:!px-2.5 [&>a]:!text-xs [&>a]:!text-[#6C574E] [&>a:hover]:!bg-[#FFF0EA] [&>a:hover]:!text-[#C92716]" />
        </div>
      </div>
    </header>
  );
}

export default BrowseHeader;
