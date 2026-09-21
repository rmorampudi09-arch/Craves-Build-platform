import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Bell, CalendarDays } from "lucide-react";
import {
  FaArrowLeft,
  FaMapMarkerAlt,
  FaSearch,
  FaSignOutAlt,
  FaUser,
} from "react-icons/fa";

import { CravesLogo } from "@/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";
import { AppleSwitch } from "@/components/ui/AppleSwitch";
import { rememberReturnRoute, toCustomerReturnRoute } from "@/lib/return-navigation";
import type { HomeFoodPreference } from "@/lib/home-return-state";
import type { CravesUser } from "@/services/auth/cravesAuth";

interface BrowseHeaderProps {
  user?: CravesUser;
  locationLabel: string;
  locationTypeLabel?: string;
  onOpenLocation: () => void;
  cartCount: number;
  onOpenCart: () => void;
  onLogout: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSearchFocus: () => void;
  foodPreference?: HomeFoodPreference;
  onFoodPreferenceChange?: (preference: HomeFoodPreference) => void;
  returnPath?: string;
  onBack?: () => void;
  backLabel?: string;
}

const headerIconActionClass =
  "h-10 w-10 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#F62E18] transition-[background-color,color,box-shadow] duration-200 ease-out hover:!bg-white hover:!text-[#F62E18] hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30";

function FoodPreferenceQuickToggles({
  value,
  onChange,
  className = "",
}: {
  value: HomeFoodPreference;
  onChange: (preference: HomeFoodPreference) => void;
  className?: string;
}) {
  return (
    <div
      className={"items-center rounded-[1.15rem] bg-[#F1F3F5] px-3 py-2 " + className}
      aria-label="Vegetarian filter"
    >
      <AppleSwitch
        checked={value === "veg"}
        onCheckedChange={(checked) => onChange(checked ? "veg" : "all")}
        label="Veg"
        size="sm"
        tone="neutral"
        aria-label="Show only vegetarian dishes"
      />
    </div>
  );
}

export function BrowseHeader({
  user,
  locationLabel,
  locationTypeLabel = "Location",
  onOpenLocation,
  onLogout,
  searchTerm,
  onSearchTermChange,
  onSearchFocus,
  foodPreference,
  onFoodPreferenceChange,
  returnPath = "/home",
  onBack,
  backLabel = "Back to home",
}: BrowseHeaderProps) {
  const openLocation = () => {
    rememberReturnRoute("/addresses", toCustomerReturnRoute(returnPath));
    onOpenLocation();
  };

  const isChef = Boolean(
    user?.roles.some((role) => role.toUpperCase() === "CHEF"),
  );
  const chefDestination = isChef ? "/chef" : "/chef/application";
  const chefActionLabel = isChef ? "Switch to chef mode" : "Open chef application";

  return (
    <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto max-w-[88rem] px-4 md:px-7 lg:px-10">
        <div className="hidden min-h-[4.65rem] items-center gap-2.5 py-2.5 lg:flex xl:gap-3.5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] p-0 text-[#1A1A1A] transition-[background-color,color,box-shadow] hover:bg-white hover:text-[#F62E18] hover:shadow-[0_6px_16px_rgba(26,26,26,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
              aria-label={backLabel}
              title={backLabel}
            >
              <FaArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}

          <Link
            to="/home"
            className="flex shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
            aria-label="Craves home"
          >
            <CravesLogo size="md" />
            <span className="hidden border-l border-[#E5E7EB] pl-3 text-xs font-bold tracking-[0.02em] text-[#1A1A1A] xl:block">
              Food From Home
            </span>
          </Link>

          <button
            type="button"
            onClick={openLocation}
            className="flex min-h-11 min-w-0 max-w-[15rem] items-center gap-2.5 rounded-full !bg-[#F1F3F5] px-3 text-left !text-[#1A1A1A] transition-[background-color,box-shadow] duration-200 ease-out hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)]"
            aria-label={locationTypeLabel + " delivery address: " + locationLabel + ". Manage address"}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18]">
              <FaMapMarkerAlt className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#6B6B6B]">
                {locationTypeLabel}
              </span>
              <span className="block truncate text-xs font-extrabold text-[#1A1A1A]">
                {locationLabel}
              </span>
            </span>
          </button>

          <label className="ml-auto flex min-h-12 min-w-[13rem] flex-1 items-center gap-3 rounded-[1.2rem] bg-[#F1F3F5] px-4 transition-[box-shadow,ring-color] duration-200 ease-out hover:ring-2 hover:ring-[#F62E18]/30 focus-within:ring-2 focus-within:ring-[#F62E18] focus-within:shadow-[0_10px_28px_rgba(246,46,24,0.14)] xl:min-h-14 xl:max-w-[34rem] xl:px-5">
            <FaSearch className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" />
            <span className="sr-only">Search dishes or home kitchens</span>
            <input
              value={searchTerm}
              onFocus={onSearchFocus}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search homemade dishes or kitchens"
              className="w-full appearance-none border-0 bg-transparent p-0 text-sm font-semibold text-[#1A1A1A] shadow-none outline-none placeholder:text-[#6B6B6B] focus:border-0 focus:outline-none focus:ring-0"
              type="text"
              inputMode="search"
              autoComplete="off"
              aria-label="Search homemade dishes or home kitchens"
            />
          </label>

          {foodPreference && onFoodPreferenceChange ? (
            <FoodPreferenceQuickToggles
              value={foodPreference}
              onChange={onFoodPreferenceChange}
              className="hidden xl:flex"
            />
          ) : null}

          <Link
            to="/subscriptions"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#F1F3F5] px-2.5 text-xs font-extrabold text-[#1A1A1A] transition-[background-color,box-shadow] hover:bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] 2xl:px-3.5"
            aria-label="Open meal plans"
            title="Meal plans"
          >
            <CalendarDays className="h-[1.05rem] w-[1.05rem] text-[#F62E18]" aria-hidden="true" />
            <span className="hidden 2xl:inline">Meal plans</span>
          </Link>

          <Link
            to="/notifications"
            className={"flex shrink-0 " + headerIconActionClass}
            aria-label="Open notifications"
            title="Notifications"
          >
            <Bell className="h-[1.08rem] w-[1.08rem]" aria-hidden="true" />
          </Link>

          <Link
            to="/profile"
            className={"flex shrink-0 " + headerIconActionClass}
            aria-label="Open profile"
            title="Profile"
          >
            <FaUser className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
          </Link>

          <Link
            to={chefDestination}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F62E18] text-white shadow-[0_8px_18px_rgba(246,46,24,0.22)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(246,46,24,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35 motion-reduce:transform-none"
            aria-label={chefActionLabel}
            title={chefActionLabel}
          >
            <ArrowLeftRight className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
          </Link>

          <button
            type="button"
            onClick={onLogout}
            className={"hidden shrink-0 2xl:flex " + headerIconActionClass}
            aria-label="Sign out"
            title="Sign out"
          >
            <FaSignOutAlt className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
          </button>
        </div>

        <div className="py-2.5 lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] p-0 text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
                aria-label={backLabel}
                title={backLabel}
              >
                <FaArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={openLocation}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-[1.05rem] bg-[#F1F3F5] px-2.5 py-2 text-left text-[#1A1A1A] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
              aria-label={locationTypeLabel + " delivery address: " + locationLabel + ". Manage address"}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18]">
                <FaMapMarkerAlt className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.55rem] font-black uppercase tracking-[0.1em] text-[#6B6B6B]">
                  {locationTypeLabel}
                </span>
                <span className="block truncate text-xs font-extrabold">
                  {locationLabel}
                </span>
              </span>
            </button>

            <Link
              to="/notifications"
              className={"flex shrink-0 " + headerIconActionClass}
              aria-label="Open notifications"
              title="Notifications"
            >
              <Bell className="h-[1.08rem] w-[1.08rem]" aria-hidden="true" />
            </Link>

            <Link
              to={chefDestination}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F62E18] text-white shadow-[0_7px_16px_rgba(246,46,24,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35"
              aria-label={chefActionLabel}
              title={chefActionLabel}
            >
              <ArrowLeftRight className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-2 flex items-stretch gap-2">
            <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[1.05rem] bg-[#F1F3F5] px-3.5 transition-shadow focus-within:ring-2 focus-within:ring-[#F62E18]">
              <FaSearch className="h-[1.05rem] w-[1.05rem] shrink-0 text-[#F62E18]" aria-hidden="true" />
              <span className="sr-only">Search dishes or home kitchens</span>
              <input
                value={searchTerm}
                onFocus={onSearchFocus}
                onChange={(event) => onSearchTermChange(event.target.value)}
                placeholder="Search dishes or kitchens"
                className="w-full appearance-none border-0 bg-transparent p-0 text-sm font-semibold text-[#1A1A1A] shadow-none outline-none placeholder:text-[#6B6B6B] focus:border-0 focus:outline-none focus:ring-0"
                type="text"
                inputMode="search"
                autoComplete="off"
                aria-label="Search homemade dishes or home kitchens"
              />
            </label>

            {foodPreference && onFoodPreferenceChange ? (
              <FoodPreferenceQuickToggles
                value={foodPreference}
                onChange={onFoodPreferenceChange}
                className="flex shrink-0"
              />
            ) : null}
          </div>
        </div>
      </div>
    </AutoHideCustomerHeader>
  );
}

export default BrowseHeader;
