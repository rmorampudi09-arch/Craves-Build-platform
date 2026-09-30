"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, ChefHat } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FaHome, FaUser } from "react-icons/fa";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";
import { AnimateCount } from "@/components/ui/AnimateCount";
import {
  cartCount,
  cartCurrency,
  cartTotal,
  subscribeCart,
} from "@/services/api/cravesCart";

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
    label: "Meal Subscription",
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

export function BottomNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const lastScrollY = useRef(0);
  const directionAnchorY = useRef(0);
  const lastDirection = useRef<"up" | "down" | null>(null);
  const framePending = useRef(false);

  const [cartExpanded, setCartExpanded] = useState(false);
  const [itemCount, setItemCount] = useState(() => cartCount());
  const [total, setTotal] = useState(() => cartTotal());
  const [currency, setCurrency] = useState(() => cartCurrency());

  useEffect(() => {
    const sync = () => {
      const nextCount = cartCount();
      setItemCount(nextCount);
      setTotal(cartTotal());
      setCurrency(cartCurrency());
      if (nextCount <= 0) setCartExpanded(false);
    };
    sync();
    return subscribeCart(sync);
  }, []);

  useEffect(() => {
    lastScrollY.current = Math.max(window.scrollY, 0);
    directionAnchorY.current = lastScrollY.current;
    lastDirection.current = null;
    setCartExpanded(false);

    const update = () => {
      const currentY = Math.max(window.scrollY, 0);
      const delta = currentY - lastScrollY.current;
      const direction: "up" | "down" | null =
        delta > 1 ? "down" : delta < -1 ? "up" : null;

      if (currentY <= 48) {
        setCartExpanded(false);
        directionAnchorY.current = currentY;
        lastDirection.current = direction;
      } else if (direction) {
        if (lastDirection.current !== direction) {
          directionAnchorY.current = currentY;
          lastDirection.current = direction;
        }

        const travel = Math.abs(currentY - directionAnchorY.current);

        // Match the original mobile behavior: the right-most Cart tab expands
        // right-to-left into View Cart while browsing down. Scrolling back up
        // contracts it left-to-right into the normal five-tab navigation.
        if (direction === "down" && travel >= 18 && itemCount > 0) {
          setCartExpanded(true);
        } else if (direction === "up" && travel >= 18) {
          setCartExpanded(false);
        }
      }

      lastScrollY.current = currentY;
      framePending.current = false;
    };

    const handleScroll = () => {
      if (framePending.current) return;
      framePending.current = true;
      window.requestAnimationFrame(update);
    };

    const handleFocus = () => setCartExpanded(false);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("focus", handleFocus);
    };
  }, [itemCount, pathname]);

  if (shouldHide(pathname)) return null;

  const activeKey = activeKeyForPath(pathname);

  return (
    <>
      <div
        aria-hidden="true"
        className="h-[calc(4.7rem+env(safe-area-inset-bottom))] md:hidden"
      />

      <nav
        className="fixed inset-x-0 bottom-0 z-40 md:hidden"
        aria-label="Customer navigation"
      >
        <div
          className={[
            "relative mx-auto max-w-lg overflow-hidden rounded-t-[1.15rem] transition-[background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            cartExpanded
              ? "border-t border-white/70 bg-transparent shadow-none"
              : "border-t border-[#ECEEF0] bg-white/96 shadow-[0_-8px_24px_rgba(26,26,26,0.065)] backdrop-blur-xl",
          ].join(" ")}
        >
          <motion.ul
            initial={false}
            animate={{
              opacity: cartExpanded ? 0 : 1,
              x: cartExpanded ? -18 : 0,
              scale: cartExpanded ? 0.985 : 1,
            }}
            transition={{
              duration: reduceMotion ? 0 : 0.34,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={[
              "grid grid-cols-5 items-stretch px-1.5 pb-[max(0.38rem,env(safe-area-inset-bottom))] pt-1.5",
              cartExpanded ? "pointer-events-none" : "",
            ].join(" ")}
            aria-hidden={cartExpanded || undefined}
          >
            {NAV_ITEMS.map(({ key, href, label, icon: Icon }) => {
              const active = activeKey === key;
              return (
                <li key={key}>
                  <Link
                    href={href}
                    className={[
                      "flex min-h-[3.45rem] flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-center text-[0.61rem] font-extrabold leading-[0.72rem] transition-colors duration-200",
                      active
                        ? "text-[#F62E18]"
                        : "text-[#777777] hover:text-[#1A1A1A]",
                    ].join(" ")}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon
                      className="h-[1.12rem] w-[1.12rem] shrink-0"
                      aria-hidden="true"
                    />
                    <span className="max-w-[4.4rem]">{label}</span>
                  </Link>
                </li>
              );
            })}

            <li>
              <Link
                href="/cart"
                className={[
                  "flex min-h-[3.45rem] flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-center text-[0.61rem] font-extrabold leading-[0.72rem] transition-colors duration-200",
                  activeKey === "cart"
                    ? "text-[#F62E18]"
                    : "text-[#777777] hover:text-[#1A1A1A]",
                ].join(" ")}
                aria-current={activeKey === "cart" ? "page" : undefined}
                aria-label={
                  itemCount > 0
                    ? `Cart, ${itemCount} ${itemCount === 1 ? "item" : "items"}`
                    : "Cart"
                }
              >
                <span className="relative flex h-[1.2rem] w-[1.2rem] items-center justify-center">
                  <CravesCartIcon className="h-[1.12rem] w-[1.12rem]" />
                  {itemCount > 0 ? (
                    <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F62E18] px-1 text-[0.5rem] font-black leading-none text-white">
                      {itemCount > 99 ? "99+" : itemCount}
                    </span>
                  ) : null}
                </span>
                <span>Cart</span>
              </Link>
            </li>
          </motion.ul>

          <AnimatePresence initial={false}>
            {cartExpanded && itemCount > 0 ? (
              <motion.div
                key="mobile-cart-expanded"
                initial={
                  reduceMotion
                    ? false
                    : {
                        opacity: 0,
                        left: "79%",
                        scale: 0.96,
                        y: 10,
                      }
                }
                animate={{
                  opacity: 1,
                  left: "0.4rem",
                  scale: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  left: "79%",
                  scale: 0.96,
                  y: 8,
                }}
                transition={{
                  duration: reduceMotion ? 0 : 0.38,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="absolute bottom-[max(0.38rem,env(safe-area-inset-bottom))] right-1.5 top-1.5 z-10 overflow-hidden rounded-[1.05rem]"
              >
                <Link
                  href="/cart"
                  className="relative flex h-full min-h-[3.45rem] items-center gap-3 overflow-hidden rounded-[1.05rem] border border-white/80 bg-white/50 px-3.5 text-[#1A1A1A] shadow-[0_16px_42px_rgba(26,26,26,0.18),0_2px_8px_rgba(26,26,26,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-[8px] backdrop-saturate-[145%] backdrop-contrast-[96%]"
                  aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(112deg,rgba(255,255,255,0.24),rgba(255,255,255,0.06)_52%,rgba(255,255,255,0.18))]"
                  />
                  <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.78] text-[#F62E18] shadow-[0_4px_14px_rgba(26,26,26,0.08)] backdrop-blur-[4px]">
                    <CravesCartIcon className="h-4.5 w-4.5" />
                  </span>
                  <span className="relative z-10 min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-sm font-black">
                      <AnimateCount className="inline-grid min-w-[1ch]">
                        {itemCount}
                      </AnimateCount>
                      <span>
                        {itemCount === 1 ? "item" : "items"} ·{" "}
                        {formatMoney(total, currency)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[0.65rem] font-semibold text-[#6B6B6B]">
                      Your Craves cart is ready
                    </span>
                  </span>
                  <span className="relative z-10 flex shrink-0 items-center gap-1.5 text-xs font-black">
                    View Cart
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
