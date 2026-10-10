"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CalendarDays, ChefHat } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FaHome, FaUser } from "react-icons/fa";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";
import {
  resetScrollChrome,
  useScrollChrome,
} from "@/components/navigation/AutoHideCustomerHeader";
import { AnimateCount } from "@/components/ui/AnimateCount";
import { ease } from "@/lib/motion";
import {
  cartCount,
  cartCurrency,
  cartTotal,
  subscribeCart,
} from "@/services/api/cravesCart";

/** Leave in 100 ms, arrive after it (80 ms delay, 180 ms): transform and opacity only. */
const NAV_SWAP = {
  hide: { opacity: 0, transform: "scale(0.98)", transition: { duration: 0.1, ease: ease.in } },
  show: { opacity: 1, transform: "scale(1)", transition: { duration: 0.18, ease: ease.out, delay: 0.08 } },
  pillOut: { opacity: 0, transform: "translateX(16px)" },
  pillIn: { opacity: 1, transform: "translateX(0px)", transition: { duration: 0.18, ease: ease.out, delay: 0.08 } },
  pillLeave: { opacity: 0, transform: "translateX(16px)", transition: { duration: 0.1, ease: ease.in } },
};

type NavKey =
  | "home"
  | "subscriptions"
  | "chefs"
  | "profile"
  | "cart";

const HIDDEN_PATH_PREFIXES = [
  "/sign-in",
  "/cart",
  "/checkout",
  "/confirmation",
  "/chef",
  "/admin",
  "/contact",
  "/privacy",
  "/terms",
  "/security",
  "/refunds-cancellations",
  "/products-pricing",
];

const NAV_ITEMS = [
  { key: "home" as const, href: "/home", label: "Home", icon: FaHome },
  {
    key: "subscriptions" as const,
    href: "/subscriptions",
    label: "Meal plans",
    icon: CalendarDays,
  },
  {
    key: "chefs" as const,
    href: "/chefs",
    label: "Chefs",
    icon: ChefHat,
  },
  {
    key: "profile" as const,
    href: "/profile",
    label: "Profile",
    icon: FaUser,
  },
] as const;

function shouldHide(pathname: string): boolean {
  if (pathname === "/") return true;
  return HIDDEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

function activeKeyForPath(pathname: string): NavKey | null {
  if (pathname === "/cart" || pathname.startsWith("/cart/")) return "cart";
  if (
    pathname === "/subscriptions" ||
    pathname.startsWith("/subscriptions/")
  ) {
    return "subscriptions";
  }
  if (pathname === "/profile" || pathname.startsWith("/profile/")) {
    return "profile";
  }
  if (
    pathname === "/chefs" ||
    pathname.startsWith("/chefs/") ||
    pathname.startsWith("/kitchen")
  ) {
    return "chefs";
  }
  if (pathname === "/home") return "home";
  return null;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** True after Tab or arrow keys, false after a tap or click: keyboard users always keep the tabs. */
function useKeyboardNavigation(): boolean {
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key.startsWith("Arrow")) setKeyboard(true);
    };
    const onPointer = () => setKeyboard(false);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  return keyboard;
}

export function BottomNav() {
  const pathname = usePathname();
  const { hidden } = useScrollChrome();
  const keyboardNavigation = useKeyboardNavigation();
  const [itemCount, setItemCount] = useState(() => cartCount());
  const [total, setTotal] = useState(() => cartTotal());
  const [currency, setCurrency] = useState(() => cartCurrency());

  useEffect(() => {
    const sync = () => {
      setItemCount(cartCount());
      setTotal(cartTotal());
      setCurrency(cartCurrency());
    };
    sync();
    return subscribeCart(sync);
  }, []);

  // Each page opens with its tabs showing.
  useEffect(() => {
    resetScrollChrome();
  }, [pathname]);

  if (shouldHide(pathname)) return null;

  const activeKey = activeKeyForPath(pathname);
  // Browsing down with food in the cart turns the tabs into a View cart bar;
  // scrolling back up brings the tabs back. Cart changes never collapse it, and
  // keyboard users keep the tabs (the bar would make them unreachable).
  const cartExpanded = hidden && itemCount > 0 && !keyboardNavigation;

  return (
    <>
      <div
        aria-hidden="true"
        data-craves-bottom-nav
        className="h-[calc(4.7rem+env(safe-area-inset-bottom))] md:hidden"
      />

      <nav
        data-craves-bottom-nav
        className="fixed inset-x-0 bottom-0 z-40 md:hidden"
        aria-label="Customer navigation"
      >
        <div
          className={[
            "relative mx-auto max-w-lg rounded-t-[1.15rem] border-t transition-[background-color,border-color,box-shadow] duration-200 ease-out",
            cartExpanded
              ? "border-transparent bg-transparent shadow-none"
              : "border-[#ECEEF0] bg-white shadow-[0_-8px_24px_rgba(26,26,26,0.065)]",
          ].join(" ")}
        >
          {/* Tabs and the cart pill trade places as a fade-through: the leaving layer is gone
              before the arriving one shows, so icons and the total are never drawn over each other. */}
          <motion.ul
            initial={false}
            animate={cartExpanded ? NAV_SWAP.hide : NAV_SWAP.show}
            className={[
              "grid grid-cols-5 items-stretch px-1.5 pb-[max(0.38rem,env(safe-area-inset-bottom))] pt-1.5",
              cartExpanded ? "pointer-events-none" : "",
            ].join(" ")}
            aria-hidden={cartExpanded || undefined}
            inert={cartExpanded}
          >
            {NAV_ITEMS.map(({ key, href, label, icon: Icon }) => {
              const active = activeKey === key;
              return (
                <li key={key}>
                  <Link
                    href={href}
                    className={[
                      "flex min-h-[3.45rem] flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-center text-[0.61rem] leading-[0.72rem] transition-[color,scale] duration-(--dur-micro) active:scale-[0.94]",
                      active
                        ? "font-black text-[#1A1A1A]"
                        : "font-bold text-[#6B6B6B] hover:text-[#1A1A1A]",
                    ].join(" ")}
                    aria-current={active ? "page" : undefined}
                  >
                    {/* The selected tab is marked by shape, not colour alone: its icon sits in a pill. */}
                    <span
                      className={[
                        "flex h-7 w-12 items-center justify-center rounded-full transition-[background-color] duration-(--dur-component)",
                        active ? "bg-[#F1F3F5] text-[#F62E18]" : "",
                      ].join(" ")}
                    >
                      <Icon className="h-[1.12rem] w-[1.12rem] shrink-0" aria-hidden="true" />
                    </span>
                    <span className="max-w-[4.4rem]">{label}</span>
                  </Link>
                </li>
              );
            })}

            <li>
              <Link
                href="/cart"
                className={[
                  "flex min-h-[3.45rem] flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-center text-[0.61rem] leading-[0.72rem] transition-[color,scale] duration-(--dur-micro) active:scale-[0.94]",
                  activeKey === "cart"
                    ? "font-black text-[#1A1A1A]"
                    : "font-bold text-[#6B6B6B] hover:text-[#1A1A1A]",
                ].join(" ")}
                aria-current={activeKey === "cart" ? "page" : undefined}
                aria-label={
                  itemCount > 0
                    ? `Cart, ${itemCount} ${itemCount === 1 ? "item" : "items"}`
                    : "Cart"
                }
              >
                <span
                  className={[
                    "relative flex h-7 w-12 items-center justify-center rounded-full transition-[background-color] duration-(--dur-component)",
                    activeKey === "cart" ? "bg-[#F1F3F5] text-[#F62E18]" : "",
                  ].join(" ")}
                >
                  <CravesCartIcon className="h-[1.12rem] w-[1.12rem]" />
                  <AnimatePresence initial={false}>
                    {itemCount > 0 ? (
                      // Keyed to the count: every change gives the badge one small bump.
                      <motion.span
                        key={itemCount}
                        animate={{ scale: [1, 1.18, 1] }}
                        transition={{ duration: 0.2, ease: ease.out }}
                        className="absolute right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C4200F] px-1 text-[0.5625rem] font-black leading-none text-white ring-2 ring-white"
                      >
                        {itemCount > 99 ? "99+" : itemCount}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>
                <span>Cart</span>
              </Link>
            </li>
          </motion.ul>

          <AnimatePresence initial={false}>
            {cartExpanded ? (
              <motion.div
                key="mobile-cart-expanded"
                initial={NAV_SWAP.pillOut}
                animate={NAV_SWAP.pillIn}
                exit={NAV_SWAP.pillLeave}
                className="absolute inset-x-1.5 bottom-[max(0.38rem,env(safe-area-inset-bottom))] top-1.5 z-10"
              >
                {/* Frosted glass over the page; only "View cart" is coloured (leaf green, AA with white). */}
                <Link
                  href="/cart"
                  className="group flex h-full min-h-[3.45rem] items-center gap-3 rounded-[1.15rem] border border-white/80 bg-white/72 py-1.5 pl-2 pr-1.5 text-[#1A1A1A] shadow-[0_14px_34px_rgba(26,26,26,0.16),0_1px_3px_rgba(26,26,26,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[14px] backdrop-saturate-[160%] transition-[scale] duration-(--dur-micro) active:scale-[0.98]"
                  aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}, ${formatMoney(total, currency)}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18] shadow-[0_2px_8px_rgba(26,26,26,0.08)]">
                    <CravesCartIcon className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-sm font-black">
                      <AnimateCount className="inline-grid min-w-[1ch]">
                        {itemCount}
                      </AnimateCount>
                      <span>
                        {itemCount === 1 ? "item" : "items"} ·{" "}
                        {formatMoney(total, currency)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[0.7rem] font-semibold text-[#4A4A4A]">
                      Your Craves cart is ready
                    </span>
                  </span>
                  <span className="flex h-11 shrink-0 items-center gap-1.5 rounded-[0.9rem] bg-[#17803D] px-4 text-sm font-black text-white shadow-[0_6px_16px_rgba(23,128,61,0.28)] transition-[background-color] duration-(--dur-micro) group-active:bg-[#12692F]">
                    View cart
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </nav>
    </>
  );
}

export function BottomNavAll() {
  return <BottomNav />;
}
