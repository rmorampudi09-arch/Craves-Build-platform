import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
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
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { rememberReturnRoute, toCustomerReturnRoute } from "@/shared/lib/return-navigation";
import { getSession, subscribeSession } from "@/features/auth/api/cravesAuth";
import { notificationsLabel, UnreadBadge, useCustomerUnreadCount } from "@/shared/components/notifications/unread-badge";
import { setVegMode, useVegMode, type VegMode } from "@/shared/hooks/use-veg-mode";
import { Sheet } from "@/shared/ui/overlays/overlay";

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
  /** Show the Veg switch (Home and the Kitchens page); veg mode itself applies everywhere. */
  vegToggle?: boolean;
  /** After the customer turns veg mode on, off or changes it. */
  onVegModeChange?: () => void;
  returnPath?: string;
  onBack?: () => void;
  backLabel?: string;
  /** Placeholder for every search field in the header (the Chefs tab searches kitchens and areas). */
  searchPlaceholder?: string;
}

/** One quiet round button for every header action (owner, 5 Nov 2026): grey tile, ink icon. */
const headerIconActionClass =
  "h-9 w-9 items-center justify-center rounded-full !bg-[#F1F3F5] lg:h-10 lg:w-10 !text-[#1A1A1A] transition-[background-color,box-shadow] duration-200 ease-out hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30";
/** The same tile with its name beside the icon from xl, where there is room for it. */
const headerActionClass =
  "relative inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full !bg-[#F1F3F5] text-[0.8125rem] font-bold !text-[#1A1A1A] transition-[background-color,box-shadow] duration-200 ease-out hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 lg:h-10 lg:w-10 xl:w-auto xl:pl-3 xl:pr-3.5";
const headerActionLabel = "hidden whitespace-nowrap xl:inline";

/** The veg mark Indian menus use: a green square with a dot. */
function VegMark({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-[3px] border-[1.5px] border-[#2E7D32] bg-white ${size === "md" ? "h-5 w-5" : "h-3 w-3"}`}
    >
      <span className={`rounded-full bg-[#2E7D32] ${size === "md" ? "h-2.5 w-2.5" : "h-1.5 w-1.5"}`} />
    </span>
  );
}

/** Turning it on asks which veg mode (the sheet below); turning it off is one tap. */
function VegModeSwitch({
  onTurnOn,
  onTurnOff,
  className = "",
  compact = false,
}: {
  onTurnOn: () => void;
  onTurnOff: () => void;
  className?: string;
  compact?: boolean;
}) {
  const mode = useVegMode();
  const label = mode === "pure" ? "Pure veg" : "Veg";
  return (
    <div
      className={[
        "items-center border border-[#E5E7EB] bg-white",
        compact
          ? "rounded-[0.9rem] px-2.5 py-1.5 shadow-[0_4px_14px_rgba(26,26,26,0.07)]"
          : "rounded-[1.15rem] px-3 py-2",
        className,
      ].join(" ")}
    >
      <AppleSwitch
        checked={mode !== "off"}
        onCheckedChange={(checked) => (checked ? onTurnOn() : onTurnOff())}
        label={
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <VegMark />
            {label}
          </span>
        }
        size="sm"
        tone="veg"
        aria-label={`${label} mode`}
      />
    </div>
  );
}

const VEG_CHOICES: { mode: Exclude<VegMode, "off">; title: string; detail: string }[] = [
  { mode: "pure", title: "Pure veg kitchens only", detail: "Kitchens that cook nothing but veg food." },
  { mode: "veg-dishes", title: "Veg dishes from all kitchens", detail: "Every kitchen, showing only its veg dishes." },
];

/** Swiggy's question when veg mode turns on: pure veg kitchens, or veg dishes from every kitchen. */
function VegModeSheet({ open, onOpenChange, onChoose }: { open: boolean; onOpenChange: (open: boolean) => void; onChoose: (mode: VegMode) => void }) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Veg mode"
      description="Choose what you see on Home, Kitchens, kitchen menus and search. This device remembers it."
      closeLabel="Keep veg mode off"
    >
      <div className="mt-1 grid gap-3 pb-1">
        {VEG_CHOICES.map((choice) => (
          <button
            key={choice.mode}
            type="button"
            onClick={() => {
              onChoose(choice.mode);
              onOpenChange(false);
            }}
            className="flex min-h-16 w-full items-center gap-3.5 rounded-2xl !border-[1.5px] !border-[#E5E7EB] !bg-white p-4 text-left !shadow-none transition-[background-color,border-color,scale] duration-(--dur-micro) hover:!border-[#2E7D32] hover:!bg-[#F2F8F2] motion-safe:active:scale-[0.98]"
          >
            <VegMark size="md" />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-[#1A1A1A]">{choice.title}</span>
              <span className="mt-0.5 block text-sm text-[#6B6B6B]">{choice.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
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
  vegToggle = false,
  onVegModeChange,
  returnPath = "/home",
  onBack,
  backLabel = "Back to home",
  searchPlaceholder,
}: BrowseHeaderProps) {
  const openLocation = () => {
    rememberReturnRoute("/addresses", toCustomerReturnRoute(returnPath));
    onOpenLocation();
  };

  // The bell's red count; guests have no inbox, so nothing is asked for them.
  const signedIn = useSyncExternalStore(subscribeSession, () => Boolean(getSession()), () => false);
  const unread = useCustomerUnreadCount(signedIn);
  const [vegSheetOpen, setVegSheetOpen] = useState(false);
  const askVegMode = () => setVegSheetOpen(true);
  const chooseVegMode = (mode: VegMode) => {
    setVegMode(mode);
    onVegModeChange?.();
  };
  const vegOff = () => chooseVegMode("off");

  // Compact search bar slides in while scrolling back up (shared chrome controller).
  const { compact: mobileCompact } = useScrollChrome();
  const submitSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    // Not the Enter that ends an IME composition (Telugu, Hindi…); Safari reports it as 229.
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return;
    onSearchSubmit?.();
  };

  return (
    <>
    <AutoHideCustomerHeader mobileStatic className="border-b border-[#E5E7EB] bg-white">
      <div className="mx-auto max-w-[88rem] px-4 md:px-7 lg:px-10">
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
            className="flex shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30"
            aria-label="Craves home"
          >
            <CravesLogo size="md" />
          </Link>

          <button
            type="button"
            onClick={openLocation}
            data-craves-location-button="desktop"
            className="flex min-h-10 min-w-0 max-w-[11.5rem] items-center gap-2 rounded-[1.1rem] border border-[#E5E7EB] !bg-white px-2.5 text-left !text-[#1A1A1A] shadow-[0_4px_14px_rgba(26,26,26,0.06)] transition-[border-color,box-shadow,scale] duration-200 ease-out hover:border-[#D7DADF] hover:shadow-[0_8px_20px_rgba(26,26,26,0.10)] active:scale-[0.98] lg:min-h-11 lg:max-w-[14rem] lg:gap-2.5 lg:px-3 xl:max-w-[16rem]"
            aria-label={locationTypeLabel + " delivery address: " + locationLabel + ". Manage address"}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18] lg:h-8 lg:w-8">
              <FaMapMarkerAlt className="h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-[#6B6B6B]">
                {locationTypeLabel}
              </span>
              <span className="block truncate text-xs font-extrabold text-[#1A1A1A]">
                {locationLabel}
              </span>
            </span>
          </button>

          <label className="ml-auto flex min-h-10 min-w-[8rem] flex-1 items-center gap-2 rounded-[1.05rem] border border-white/80 bg-[#F1F3F5] px-3 transition-[background-color,box-shadow,border-color] duration-200 ease-out hover:border-[#D3D7DD] hover:bg-white focus-within:border-[#1A1A1A] focus-within:bg-white focus-within:shadow-[0_0_0_1px_#1A1A1A] lg:min-h-12 lg:min-w-[12rem] lg:gap-3 lg:px-4 xl:min-h-14 xl:max-w-[34rem] xl:px-5">
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

          {vegToggle ? <VegModeSwitch onTurnOn={askVegMode} onTurnOff={vegOff} className="hidden lg:flex" /> : null}

          {/* Meal plans, Orders, Alerts and Profile share one button style. */}
          <Link to="/subscriptions" className={headerActionClass} aria-label="Open meal plans" title="Meal plans">
            <CalendarDays className="h-[1.05rem] w-[1.05rem] shrink-0" aria-hidden="true" />
            <span className={headerActionLabel}>Meal plans</span>
          </Link>

          {/* On desktop, orders are one tap away (phones have the tab bar). */}
          <Link to="/orders" className={headerActionClass} aria-label="Open your orders" title="Your orders">
            <ClipboardList className="h-[1.05rem] w-[1.05rem] shrink-0" aria-hidden="true" />
            <span className={headerActionLabel}>Orders</span>
          </Link>

          <Link to="/notifications" className={headerActionClass} aria-label={notificationsLabel(unread, "Alerts")} title="Alerts">
            <Bell className="h-[1.08rem] w-[1.08rem] shrink-0" aria-hidden="true" />
            <span className={headerActionLabel}>Alerts</span>
            <UnreadBadge count={unread} />
          </Link>

          <Link to="/profile" className={headerActionClass} aria-label="Open profile" title="Profile">
            <FaUser className="h-[1.05rem] w-[1.05rem] shrink-0" aria-hidden="true" />
            <span className={headerActionLabel}>Profile</span>
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
              className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-[1.1rem] border border-[#E5E7EB] !bg-white px-2.5 py-2 text-left !text-[#1A1A1A] shadow-[0_4px_16px_rgba(26,26,26,0.07)] transition-[scale] duration-(--dur-micro) active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30"
              aria-label={locationTypeLabel + " delivery address: " + locationLabel + ". Manage address"}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                <FaMapMarkerAlt className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[0.92rem] font-black leading-none text-[#1A1A1A]">
                  <span className="truncate">{locationTypeLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#F62E18]" aria-hidden="true" />
                </span>
                <span className="mt-1.5 block truncate text-xs font-semibold leading-none text-[#6B6B6B]">
                  {locationLabel}
                </span>
              </span>
            </button>

            <Link
              to="/notifications"
              className={"relative flex shrink-0 " + headerIconActionClass}
              aria-label={notificationsLabel(unread)}
              title="Notifications"
            >
              <Bell className="h-[1.08rem] w-[1.08rem]" aria-hidden="true" />
              <UnreadBadge count={unread} />
            </Link>

          </div>

          <div className="mt-2 flex items-stretch gap-2">
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[0.95rem] border border-[#E5E7EB] bg-[#F6F7F8] px-3 shadow-[0_3px_12px_rgba(26,26,26,0.05)] transition-[background-color,box-shadow,border-color] duration-200 focus-within:border-[#1A1A1A] focus-within:bg-white focus-within:shadow-[0_0_0_1px_#1A1A1A]">
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

            {vegToggle ? <VegModeSwitch onTurnOn={askVegMode} onTurnOff={vegOff} compact className="flex shrink-0" /> : null}
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
          {vegToggle ? <VegModeSwitch onTurnOn={askVegMode} onTurnOff={vegOff} compact className="flex shrink-0" /> : null}
        </div>
      </div>
      {vegToggle ? <VegModeSheet open={vegSheetOpen} onOpenChange={setVegSheetOpen} onChoose={chooseVegMode} /> : null}
    </>
  );
}

export default BrowseHeader;
