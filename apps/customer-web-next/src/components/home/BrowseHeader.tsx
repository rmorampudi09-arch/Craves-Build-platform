import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Bell, CalendarDays, ChevronDown } from "lucide-react";
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
  "h-9 w-9 items-center justify-center rounded-full !bg-[#F1F3F5] lg:h-10 lg:w-10 !text-[#F62E18] transition-[background-color,color,box-shadow] duration-200 ease-out hover:!bg-white hover:!text-[#F62E18] hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30";

function FoodPreferenceQuickToggles({
  value,
  onChange,
  className = "",
  compact = false,
}: {
  value: HomeFoodPreference;
  onChange: (preference: HomeFoodPreference) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "items-center border border-[#E5E7EB] bg-white",
        compact
          ? "rounded-[0.9rem] px-2.5 py-1.5 shadow-[0_4px_14px_rgba(26,26,26,0.07)]"
          : "rounded-[1.15rem] px-3 py-2",
        className,
      ].join(" ")}
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
  const lastMobileScrollYRef = useRef(0);
  const mobileDirectionAnchorRef = useRef(0);
  const mobileDirectionRef = useRef<"up" | "down" | null>(null);
  const [mobileCompact, setMobileCompact] = useState(false);

  useEffect(() => {
    let frame = 0;
    const initialY = Math.max(window.scrollY, 0);
    lastMobileScrollYRef.current = initialY;
    mobileDirectionAnchorRef.current = initialY;
    mobileDirectionRef.current = null;

    const update = () => {
      const currentY = Math.max(window.scrollY, 0);
      const delta = currentY - lastMobileScrollYRef.current;
      const direction: "up" | "down" | null =
        delta > 1 ? "down" : delta < -1 ? "up" : null;

      if (currentY <= 76) {
        setMobileCompact(false);
        mobileDirectionAnchorRef.current = currentY;
        mobileDirectionRef.current = direction;
      } else if (direction) {
        if (mobileDirectionRef.current !== direction) {
          mobileDirectionRef.current = direction;
          mobileDirectionAnchorRef.current = currentY;
        }

        const travel = Math.abs(currentY - mobileDirectionAnchorRef.current);

        // Require meaningful travel before toggling. This prevents the compact
        // search/filter row from fluttering on tiny touch/trackpad movements.
        if (direction === "up" && travel >= 20) {
          setMobileCompact(true);
        } else if (direction === "down" && travel >= 16) {
          setMobileCompact(false);
        }
      }

      lastMobileScrollYRef.current = currentY;
      frame = 0;
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--craves-mobile-search-offset",
      mobileCompact ? "3.75rem" : "0px",
    );
    return () => {
      root.style.removeProperty("--craves-mobile-search-offset");
    };
  }, [mobileCompact]);

  return (
    <>
    <AutoHideCustomerHeader mobileStatic className="border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto max-w-[88rem] px-4 md:px-7 lg:px-10">
        <div className="hidden min-h-[4.25rem] items-center gap-2 py-2 md:flex lg:min-h-[4.65rem] lg:gap-2.5 lg:py-2.5 xl:gap-3">
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
            <CravesLogo size="sm" />
            <span className="hidden border-l border-[#E5E7EB] pl-3 text-xs font-bold tracking-[0.02em] text-[#1A1A1A] 2xl:block">
              Food From Home
            </span>
          </Link>

          <button
            type="button"
            onClick={openLocation}
            data-craves-location-button="desktop"
            className="flex min-h-10 min-w-0 max-w-[11.5rem] items-center gap-2 rounded-[1.1rem] border border-[#E5E7EB] !bg-white px-2.5 text-left !text-[#1A1A1A] shadow-[0_4px_14px_rgba(26,26,26,0.06)] transition-[border-color,box-shadow,transform] duration-200 ease-out hover:border-[#F62E18]/30 hover:shadow-[0_8px_20px_rgba(26,26,26,0.10)] active:scale-[0.99] lg:min-h-11 lg:max-w-[14rem] lg:gap-2.5 lg:px-3 xl:max-w-[16rem]"
            aria-label={locationTypeLabel + " delivery address: " + locationLabel + ". Manage address"}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18] lg:h-8 lg:w-8">
              <FaMapMarkerAlt className="h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden="true" />
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

          <label className="ml-auto flex min-h-10 min-w-[8rem] flex-1 items-center gap-2 rounded-[1.05rem] border border-white/80 bg-[#F1F3F5]/90 px-3 backdrop-blur-xl transition-[transform,background-color,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#F62E18]/20 hover:bg-white/80 hover:shadow-[0_14px_34px_rgba(246,46,24,0.18),inset_0_1px_0_rgba(255,255,255,0.95)] focus-within:-translate-y-0.5 focus-within:border-[#F62E18]/30 focus-within:bg-white/90 focus-within:shadow-[0_14px_34px_rgba(246,46,24,0.18),inset_0_1px_0_rgba(255,255,255,0.95)] focus-within:ring-2 focus-within:ring-[#F62E18]/25 motion-reduce:transform-none lg:min-h-12 lg:min-w-[12rem] lg:gap-3 lg:px-4 xl:min-h-14 xl:max-w-[34rem] xl:px-5">
            <FaSearch className="h-4 w-4 shrink-0 text-[#F62E18] lg:h-5 lg:w-5" aria-hidden="true" />
            <span className="sr-only">Search dishes or home kitchens</span>
            <input
              value={searchTerm}
              onFocus={onSearchFocus}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search homemade dishes or kitchens"
              className="w-full appearance-none border-0 bg-transparent p-0 text-xs font-semibold text-[#1A1A1A] lg:text-sm shadow-none outline-none placeholder:text-[#6B6B6B] focus:border-0 focus:outline-none focus:ring-0"
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
              className="hidden lg:flex"
            />
          ) : null}

          <Link
            to="/subscriptions"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-[#F1F3F5] text-xs font-extrabold text-[#1A1A1A] transition-[background-color,box-shadow] hover:bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] lg:h-10 lg:w-10 2xl:w-auto 2xl:px-3.5"
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F62E18] lg:h-10 lg:w-10 text-white shadow-[0_8px_18px_rgba(246,46,24,0.22)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(246,46,24,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35 motion-reduce:transform-none"
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

        <div className="py-2.5 md:hidden">
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
              data-craves-location-button="mobile"
              className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-[1.1rem] border border-[#E5E7EB] !bg-white px-2.5 py-2 text-left !text-[#1A1A1A] shadow-[0_4px_16px_rgba(26,26,26,0.07)] transition-[border-color,box-shadow,transform] duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
              aria-label={locationTypeLabel + " delivery address: " + locationLabel + ". Manage address"}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF1EF] text-[#F62E18]">
                <FaMapMarkerAlt className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[0.92rem] font-black leading-none text-[#1A1A1A]">
                  <span className="truncate">{locationTypeLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#F62E18]" aria-hidden="true" />
                </span>
                <span className="mt-1.5 block truncate text-[0.7rem] font-semibold leading-none text-[#6B6B6B]">
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
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[0.95rem] border border-[#E5E7EB] bg-[#F6F7F8] px-3 shadow-[0_3px_12px_rgba(26,26,26,0.05)] transition-[background-color,box-shadow,border-color] duration-200 focus-within:border-[#F62E18]/25 focus-within:bg-white focus-within:shadow-[0_7px_20px_rgba(246,46,24,0.11)] focus-within:ring-2 focus-within:ring-[#F62E18]/15">
              <FaSearch className="h-[1.05rem] w-[1.05rem] shrink-0 text-[#F62E18]" aria-hidden="true" />
              <span className="sr-only">Search dishes or home kitchens</span>
              <input
                value={searchTerm}
                onFocus={onSearchFocus}
                onChange={(event) => onSearchTermChange(event.target.value)}
                placeholder="Search dishes, kitchens"
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
                compact
                className="flex shrink-0"
              />
            ) : null}
          </div>
        </div>
      </div>
    </AutoHideCustomerHeader>

      <div
        aria-hidden={!mobileCompact}
        className={[
          "fixed inset-x-0 top-0 z-50 border-b border-[#ECEEF0] bg-white/96 px-3 py-2 shadow-[0_7px_22px_rgba(26,26,26,0.065)] backdrop-blur-xl will-change-[transform,opacity] transition-[transform,opacity,box-shadow] duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden",
          mobileCompact
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-[115%] opacity-0 shadow-none",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[0.95rem] border border-[#E5E7EB] bg-[#F6F7F8] px-3 shadow-[0_3px_12px_rgba(26,26,26,0.05)] transition-[background-color,box-shadow,border-color] focus-within:border-[#F62E18]/25 focus-within:bg-white focus-within:shadow-[0_7px_20px_rgba(246,46,24,0.11)] focus-within:ring-2 focus-within:ring-[#F62E18]/15">
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
              compact
              className="flex shrink-0"
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

export default BrowseHeader;
