import { useEffect, useSyncExternalStore, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CalendarDays, ChevronDown, ClipboardList } from "lucide-react";
import {
  FaArrowLeft,
  FaMapMarkerAlt,
  FaSearch,
  FaSignOutAlt,
  FaUser,
} from "react-icons/fa";

import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import {
  AutoHideCustomerHeader,
  useScrollChrome,
} from "@/shared/components/navigation/AutoHideCustomerHeader";
import { rememberReturnRoute, toCustomerReturnRoute } from "@/shared/lib/return-navigation";
import { FoodTypeMenu } from "@/features/home/components/FoodTypeMenu";
import type { HomeFoodPreference } from "@/features/home/lib/home-return-state";
import { cn } from "@/shared/lib/utils";
import styles from "./BrowseHeader.module.css";

interface BrowseHeaderProps {
  locationLabel: string;
  locationTypeLabel?: string;
  onOpenLocation: () => void;
  cartCount: number;
  onOpenCart: () => void;
  onLogout: () => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  /** A click or tap on a search field. Keyboard focus alone opens nothing (WCAG 3.2.1). */
  onSearchActivate: () => void;
  /** Enter in a search field. */
  onSearchSubmit?: () => void;
  /** Pointer down on a search field: a chance to fetch the search UI before focus. */
  onSearchIntent?: () => void;
  foodPreference?: HomeFoodPreference;
  onFoodPreferenceChange?: (preference: HomeFoodPreference) => void;
  returnPath?: string;
  onBack?: () => void;
  backLabel?: string;
  /**
   * "red" is Home's Craves red top (app 1.35.1–1.35.3): red while the page is at the top, then
   * white clouds rise over it and the header turns white.
   */
  tone?: "white" | "red";
  /** Placeholder for every search field in the header (the Chefs tab searches kitchens and areas). */
  searchPlaceholder?: string;
}

/** Home's red: the accessible flame red, so white text on it passes 4.5:1. */
const HOME_RED = "#D92714";
const AT_TOP_PX = 24;

function subscribeScroll(listener: () => void) {
  window.addEventListener("scroll", listener, { passive: true });
  return () => window.removeEventListener("scroll", listener);
}

/** True while the page is scrolled to (near) its top; the server render counts as the top. */
function useAtPageTop(enabled: boolean): boolean {
  return useSyncExternalStore(
    enabled ? subscribeScroll : () => () => {},
    () => !enabled || window.scrollY <= AT_TOP_PX,
    () => true,
  );
}

/** The browser bar follows the header on phones: red with the red top, white once it turns white. */
function useThemeColor(color: string | null) {
  useEffect(() => {
    if (!color) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = color;
    return () => {
      meta.content = previous;
    };
  }, [color]);
}

export function BrowseHeader({
  locationLabel,
  locationTypeLabel = "Location",
  onOpenLocation,
  onLogout,
  searchTerm,
  onSearchTermChange,
  onSearchActivate,
  onSearchSubmit,
  onSearchIntent,
  foodPreference,
  onFoodPreferenceChange,
  returnPath = "/home",
  onBack,
  backLabel = "Back to home",
  tone = "white",
  searchPlaceholder,
}: BrowseHeaderProps) {
  const openLocation = () => {
    rememberReturnRoute("/addresses", toCustomerReturnRoute(returnPath));
    onOpenLocation();
  };

  const red = tone === "red";
  const onRed = useAtPageTop(red) && red;
  useThemeColor(red ? (onRed ? HOME_RED : "#FFFFFF") : null);
  const pick = (whenRed: string, whenWhite: string) => (onRed ? whenRed : whenWhite);

  const iconAction = cn(
    "h-9 w-9 items-center justify-center rounded-full lg:h-10 lg:w-10 transition-[background-color,color,box-shadow] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2",
    pick(
      "bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white",
      "!bg-[#F1F3F5] !text-[#F62E18] hover:!bg-white hover:!text-[#F62E18] hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] focus-visible:ring-[#1A1A1A]/30",
    ),
  );
  const locationCard = pick(
    "border-white/25 bg-white/15 text-white hover:bg-white/20",
    "border-[#E5E7EB] !bg-white !text-[#1A1A1A] shadow-[0_4px_14px_rgba(26,26,26,0.06)] hover:border-[#D7DADF] hover:shadow-[0_8px_20px_rgba(26,26,26,0.10)]",
  );
  const foodMenu =
    foodPreference && onFoodPreferenceChange ? (
      <FoodTypeMenu value={foodPreference} onChange={onFoodPreferenceChange} tone={onRed ? "onRed" : "light"} />
    ) : null;

  // Compact search bar slides in while scrolling back up (shared chrome controller).
  const { compact: mobileCompact } = useScrollChrome();
  const submitSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    // Not the Enter that ends an IME composition (Telugu, Hindi…); Safari reports it as 229.
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return;
    onSearchSubmit?.();
  };

  return (
    <>
    <AutoHideCustomerHeader mobileStatic className={red ? undefined : "border-b border-[#E5E7EB] bg-white"}>
      <div className={red ? styles.redTop : undefined} data-covered={red ? String(!onRed) : undefined}>
      {red ? (
        // White clouds: puffs along the bottom edge while red, rising over the whole header when white.
        <span aria-hidden="true" className={styles.clouds}>
          <span className={styles.cloudsBack} />
          <span className={styles.cloudsFront} />
        </span>
      ) : null}
      <div className={cn("relative z-10 mx-auto max-w-[88rem] px-4 md:px-7 lg:px-10", red && "pb-4")}>
        <div className="hidden min-h-[4.25rem] items-center gap-2 py-2 md:flex lg:min-h-[4.65rem] lg:gap-2.5 lg:py-2.5 xl:gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] p-0 text-[#1A1A1A] transition-[background-color,color,box-shadow] hover:bg-white hover:text-[#F62E18] hover:shadow-[0_6px_16px_rgba(26,26,26,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30"
              aria-label={backLabel}
              title={backLabel}
            >
              <FaArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}

          <Link
            to="/home"
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30",
              // The logo is red: on the red top it sits on a white disc.
              onRed && "rounded-full bg-white p-1",
            )}
            aria-label="Craves home"
          >
            <CravesLogo size={onRed ? "sm" : "md"} />
          </Link>

          <button
            type="button"
            onClick={openLocation}
            data-craves-location-button="desktop"
            className={cn(
              "flex min-h-10 min-w-0 max-w-[11.5rem] items-center gap-2 rounded-[1.1rem] border px-2.5 text-left transition-[background-color,border-color,box-shadow,color,scale] duration-300 ease-out active:scale-[0.98] lg:min-h-11 lg:max-w-[14rem] lg:gap-2.5 lg:px-3 xl:max-w-[16rem]",
              locationCard,
            )}
            aria-label={locationTypeLabel + " delivery address: " + locationLabel + ". Manage address"}
          >
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full lg:h-8 lg:w-8", pick("bg-white/20 text-white", "bg-white text-[#F62E18]"))}>
              <FaMapMarkerAlt className="h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className={cn("block text-xs font-bold", pick("text-white", "text-[#6B6B6B]"))}>
                {locationTypeLabel}
              </span>
              <span className={cn("block truncate text-xs font-extrabold", pick("text-white", "text-[#1A1A1A]"))}>
                {locationLabel}
              </span>
            </span>
          </button>

          <label
            className={cn(
              "ml-auto flex min-h-10 min-w-[8rem] flex-1 items-center gap-2 rounded-[1.05rem] border px-3 transition-[background-color,box-shadow,border-color] duration-200 ease-out focus-within:border-[#1A1A1A] focus-within:bg-white focus-within:shadow-[0_0_0_1px_#1A1A1A] lg:min-h-12 lg:min-w-[12rem] lg:gap-3 lg:px-4 xl:min-h-14 xl:max-w-[34rem] xl:px-5",
              pick("border-white bg-white", "border-white/80 bg-[#F1F3F5] hover:border-[#D3D7DD] hover:bg-white"),
            )}
          >
            <FaSearch className="h-4 w-4 shrink-0 text-[#F62E18] lg:h-5 lg:w-5" aria-hidden="true" />
            <span className="sr-only">Search dishes or home kitchens</span>
            <input
              value={searchTerm}
              onPointerDown={onSearchIntent}
              onClick={onSearchActivate}
              onKeyDown={submitSearch}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder={searchPlaceholder ?? "Search homemade dishes or kitchens"}
              data-craves-bare-input
              className="w-full appearance-none border-0 bg-transparent p-0 text-xs font-semibold text-[#1A1A1A] lg:text-sm shadow-none outline-none placeholder:text-[#6B6B6B] focus:border-0 focus:outline-none focus:ring-0"
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              aria-label="Search homemade dishes or home kitchens"
            />
          </label>

          {foodMenu ? <div className="hidden lg:flex">{foodMenu}</div> : null}

          <Link
            to="/subscriptions"
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-xs font-extrabold transition-[background-color,box-shadow,color] duration-300 lg:h-10 lg:w-10 2xl:w-auto 2xl:px-3.5",
              pick("bg-white/15 text-white hover:bg-white/25", "bg-[#F1F3F5] text-[#1A1A1A] hover:bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)]"),
            )}
            aria-label="Open meal plans"
            title="Meal plans"
          >
            <CalendarDays className={cn("h-[1.05rem] w-[1.05rem]", pick("text-white", "text-[#F62E18]"))} aria-hidden="true" />
            <span className="hidden 2xl:inline">Meal plans</span>
          </Link>

          <Link
            to="/notifications"
            className={"flex shrink-0 " + iconAction}
            aria-label="Open notifications"
            title="Notifications"
          >
            <Bell className="h-[1.08rem] w-[1.08rem]" aria-hidden="true" />
          </Link>

          <Link
            to="/profile"
            className={"flex shrink-0 " + iconAction}
            aria-label="Open profile"
            title="Profile"
          >
            <FaUser className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
          </Link>

          {/* Where the chef switch used to sit: on desktop, orders are one tap away (phones have the tab bar). */}
          <Link
            to="/orders"
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[translate,box-shadow,background-color,color] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/35 motion-reduce:transform-none lg:h-10 lg:w-10",
              pick("bg-white text-[#D92714]", "bg-[#F62E18] text-white shadow-[0_8px_18px_rgba(26,26,26,0.14)] hover:shadow-[0_10px_24px_rgba(26,26,26,0.14)]"),
            )}
            aria-label="Open your orders"
            title="Your orders"
          >
            <ClipboardList className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
          </Link>

          <button
            type="button"
            onClick={onLogout}
            className={"hidden shrink-0 2xl:flex " + iconAction}
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
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] p-0 text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30"
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
              className={cn(
                "group flex min-w-0 flex-1 items-center gap-2.5 rounded-[1.1rem] border px-2.5 py-2 text-left transition-[scale] duration-(--dur-micro) active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30",
                red ? "border-transparent bg-transparent px-0 text-white" : "border-[#E5E7EB] !bg-white !text-[#1A1A1A] shadow-[0_4px_16px_rgba(26,26,26,0.07)]",
              )}
              aria-label={locationTypeLabel + " delivery address: " + locationLabel + ". Manage address"}
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", red ? "bg-white/15 text-white" : "bg-[#F1F3F5] text-[#F62E18]")}>
                <FaMapMarkerAlt className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("flex items-center gap-1.5 text-[0.92rem] font-black leading-none", red ? "text-white" : "text-[#1A1A1A]")}>
                  <span className="truncate">{locationTypeLabel}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0", red ? "text-white" : "text-[#F62E18]")} aria-hidden="true" />
                </span>
                <span className={cn("mt-1.5 block truncate text-xs font-semibold leading-none", red ? "text-white" : "text-[#6B6B6B]")}>
                  {locationLabel}
                </span>
              </span>
            </button>

            <Link
              to="/subscriptions"
              className={cn("flex shrink-0", red ? "h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white" : "hidden")}
              aria-label="Open meal plans"
              title="Meal plans"
            >
              <CalendarDays className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
            </Link>

            <Link
              to="/notifications"
              className={cn(
                "flex shrink-0",
                red
                  ? "h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  : iconAction,
              )}
              aria-label="Open notifications"
              title="Notifications"
            >
              <Bell className="h-[1.08rem] w-[1.08rem]" aria-hidden="true" />
            </Link>

          </div>

          <div className="mt-2 flex items-stretch gap-2">
            <label
              className={cn(
                "flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[0.95rem] border px-3 transition-[background-color,box-shadow,border-color] duration-200 focus-within:border-[#1A1A1A] focus-within:bg-white focus-within:shadow-[0_0_0_1px_#1A1A1A]",
                red ? "border-white bg-white" : "border-[#E5E7EB] bg-[#F6F7F8] shadow-[0_3px_12px_rgba(26,26,26,0.05)]",
              )}
            >
              <FaSearch className="h-[1.05rem] w-[1.05rem] shrink-0 text-[#F62E18]" aria-hidden="true" />
              <span className="sr-only">Search dishes or home kitchens</span>
              <input
                value={searchTerm}
                onPointerDown={onSearchIntent}
                onClick={onSearchActivate}
                onKeyDown={submitSearch}
                onChange={(event) => onSearchTermChange(event.target.value)}
                placeholder={searchPlaceholder ?? "Search dishes, kitchens"}
                data-craves-bare-input
                className="w-full appearance-none border-0 bg-transparent p-0 text-sm font-semibold text-[#1A1A1A] shadow-none outline-none placeholder:text-[#6B6B6B] focus:border-0 focus:outline-none focus:ring-0"
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                aria-label="Search homemade dishes or home kitchens"
              />
            </label>

            {foodPreference && onFoodPreferenceChange ? (
              <FoodTypeMenu value={foodPreference} onChange={onFoodPreferenceChange} tone={red ? "onRed" : "light"} />
            ) : null}
          </div>
        </div>
      </div>
      </div>
    </AutoHideCustomerHeader>

      <div
        aria-hidden={!mobileCompact}
        inert={!mobileCompact}
        className={[
          "fixed inset-x-0 top-0 z-50 border-b border-[#ECEEF0] bg-white px-3 py-2 shadow-[0_7px_22px_rgba(26,26,26,0.065)] transition-[translate,opacity] duration-(--dur-chrome) ease-(--ease-standard) motion-reduce:transition-none md:hidden",
          mobileCompact
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-[115%] opacity-0",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[0.95rem] border border-[#E5E7EB] bg-[#F6F7F8] px-3 shadow-[0_3px_12px_rgba(26,26,26,0.05)] transition-[background-color,box-shadow,border-color] focus-within:border-[#1A1A1A] focus-within:bg-white focus-within:shadow-[0_0_0_1px_#1A1A1A]">
            <FaSearch className="h-[1.05rem] w-[1.05rem] shrink-0 text-[#F62E18]" aria-hidden="true" />
            <span className="sr-only">Search dishes or home kitchens</span>
            <input
              value={searchTerm}
              onPointerDown={onSearchIntent}
              onClick={onSearchActivate}
              onKeyDown={submitSearch}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder={searchPlaceholder ?? "Search dishes or kitchens"}
              data-craves-bare-input
              className="w-full appearance-none border-0 bg-transparent p-0 text-sm font-semibold text-[#1A1A1A] shadow-none outline-none placeholder:text-[#6B6B6B] focus:border-0 focus:outline-none focus:ring-0"
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              aria-label="Search homemade dishes or home kitchens"
            />
          </label>
          {foodPreference && onFoodPreferenceChange ? (
            <FoodTypeMenu value={foodPreference} onChange={onFoodPreferenceChange} />
          ) : null}
        </div>
      </div>
    </>
  );
}

export default BrowseHeader;
