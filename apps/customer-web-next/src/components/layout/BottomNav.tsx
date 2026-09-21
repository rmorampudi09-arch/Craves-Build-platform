"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  Home,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  cartCount,
  cartCurrency,
  cartTotal,
  subscribeCart,
} from "@/services/api/cravesCart";

type CartSummary = {
  itemCount: number;
  total: number;
  currency: string;
};

type NavKey =
  | "home"
  | "subscriptions"
  | "chefs"
  | "profile"
  | "cart";

const HIDDEN_PATH_PREFIXES = [
  "/sign-in",
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
  { key: "home" as const, href: "/home", label: "Home", icon: Home },
  {
    key: "subscriptions" as const,
    href: "/subscriptions",
    label: "Meal Subscription",
    icon: CalendarDays,
  },
  {
    key: "chefs" as const,
    href: "/home#nearby-kitchens-heading",
    label: "Chefs",
    icon: ChefHat,
  },
  {
    key: "profile" as const,
    href: "/profile",
    label: "Profile",
    icon: UserRound,
  },
] as const;

function readCartSummary(): CartSummary {
  return {
    itemCount: cartCount(),
    total: cartTotal(),
    currency: cartCurrency(),
  };
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

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
  if (
    pathname === "/profile" ||
    pathname.startsWith("/profile/")
  ) {
    return "profile";
  }
  if (pathname.startsWith("/kitchen")) return "chefs";
  if (pathname === "/home") return "home";
  return null;
}

export function BottomNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const lastScrollY = useRef(0);
  const framePending = useRef(false);
  const [cartMode, setCartMode] = useState(false);
  const [summary, setSummary] = useState<CartSummary>(() => readCartSummary());

  useEffect(() => {
    const sync = () => setSummary(readCartSummary());
    sync();
    return subscribeCart(sync);
  }, []);

  useEffect(() => {
    lastScrollY.current = Math.max(window.scrollY, 0);
    setCartMode(false);

    const update = () => {
      const currentY = Math.max(window.scrollY, 0);
      const delta = currentY - lastScrollY.current;

      if (currentY <= 44 || delta < -5) {
        setCartMode(false);
      } else if (currentY > 96 && delta > 5) {
        setCartMode(true);
      }

      lastScrollY.current = currentY;
      framePending.current = false;
    };

    const handleScroll = () => {
      if (framePending.current) return;
      framePending.current = true;
      window.requestAnimationFrame(update);
    };

    const handleResize = () => {
      if (window.innerWidth >= 768) setCartMode(false);
      lastScrollY.current = Math.max(window.scrollY, 0);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [pathname]);

  if (shouldHide(pathname)) return null;

  const activeKey = activeKeyForPath(pathname);
  const expandedCart =
    pathname !== "/cart" &&
    !pathname.startsWith("/cart/") &&
    cartMode &&
    summary.itemCount > 0;

  const openHomeSection = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    if (pathname !== "/home") return;
    const target = document.getElementById(id);
    const section = target?.closest("section");
    if (!section) return;

    event.preventDefault();
    section.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    window.history.replaceState(null, "", "#" + id);
  };

  const cartAria =
    "Cart" +
    (summary.itemCount > 0 ? ", " + summary.itemCount + " items" : "");

  return (
    <>
      <div
        aria-hidden="true"
        className="h-[calc(4.7rem+env(safe-area-inset-bottom))] md:hidden"
      />

      <motion.nav
        initial={false}
        animate={{
          backgroundColor: expandedCart
            ? "rgba(255,255,255,0)"
            : "rgba(255,255,255,0.95)",
        }}
        transition={{
          duration: reduceMotion ? 0 : 0.22,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={[
          "fixed inset-x-0 bottom-0 z-40 md:hidden",
          expandedCart
            ? "border-t border-transparent shadow-none"
            : "border-t border-[#E5E7EB] shadow-[0_-8px_26px_rgba(26,26,26,0.07)] backdrop-blur-xl",
        ].join(" ")}
        aria-label="Customer navigation"
      >
        <motion.ul
          initial={false}
          animate={{
            opacity: expandedCart ? 0 : 1,
            y: expandedCart ? 4 : 0,
          }}
          transition={{
            duration: reduceMotion ? 0 : 0.16,
          }}
          className={[
            "mx-auto grid max-w-lg grid-cols-5 items-stretch px-1.5 pb-[max(0.38rem,env(safe-area-inset-bottom))] pt-1.5",
            expandedCart ? "pointer-events-none" : "",
          ].join(" ")}
        >
          {NAV_ITEMS.map(({ key, href, label, icon: Icon }) => {
            const active = activeKey === key;
            const sectionId =
              key === "chefs" ? "nearby-kitchens-heading" : null;

            return (
              <li key={key}>
                <Link
                  href={href}
                  onClick={
                    sectionId
                      ? (event) => openHomeSection(event, sectionId)
                      : undefined
                  }
                  className={[
                    "flex min-h-[3.45rem] flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-center text-[0.61rem] font-extrabold leading-[0.72rem] transition-colors",
                    active
                      ? "text-[#F62E18]"
                      : "text-[#6B6B6B] hover:text-[#1A1A1A]",
                  ].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className="h-[1.18rem] w-[1.18rem] shrink-0"
                    strokeWidth={active ? 2.5 : 2}
                    aria-hidden="true"
                  />
                  <span className="max-w-[4.4rem]">
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li aria-hidden="true" />
        </motion.ul>

        <motion.div
          initial={false}
          animate={{
            width: expandedCart
              ? "calc(100% - 0.75rem)"
              : "calc(20% - 0.15rem)",
            backgroundColor: expandedCart
              ? "#2563EB"
              : "rgba(255,255,255,0)",
            borderRadius: expandedCart ? 18 : 12,
            boxShadow: expandedCart
              ? "0 16px 38px rgba(37,99,235,0.28)"
              : "0 0 0 rgba(37,99,235,0)",
          }}
          transition={{
            duration: reduceMotion ? 0 : 0.28,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="absolute right-1.5 top-1.5 h-[3.45rem] overflow-hidden"
        >
          <Link
            href="/cart"
            className={[
              "flex h-full w-full items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 focus-visible:ring-offset-2",
              expandedCart
                ? "flex-row gap-3 px-3.5 text-white"
                : "flex-col justify-center gap-0.5 px-0.5 text-[0.61rem] font-extrabold leading-[0.72rem]",
              !expandedCart && activeKey === "cart"
                ? "text-[#2563EB]"
                : !expandedCart
                  ? "text-[#6B6B6B]"
                  : "",
            ].join(" ")}
            aria-current={activeKey === "cart" ? "page" : undefined}
            aria-label={
              expandedCart && summary.itemCount > 0
                ? "View cart with " +
                  summary.itemCount +
                  " " +
                  (summary.itemCount === 1 ? "item" : "items")
                : cartAria
            }
          >
            <span
              className={[
                "relative flex shrink-0 items-center justify-center",
                expandedCart
                  ? "h-9 w-9 rounded-full bg-white/15"
                  : "h-[1.2rem] w-[1.2rem]",
              ].join(" ")}
            >
              <ShoppingCart
                className="h-[1.18rem] w-[1.18rem]"
                strokeWidth={activeKey === "cart" && !expandedCart ? 2.5 : 2}
                aria-hidden="true"
              />
              {!expandedCart && summary.itemCount > 0 ? (
                <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#2563EB] px-1 text-[0.5rem] font-black leading-none text-white">
                  {summary.itemCount > 99 ? "99+" : summary.itemCount}
                </span>
              ) : null}
            </span>

            {expandedCart ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black leading-tight">
                    View cart
                  </span>
                  <span className="mt-0.5 block truncate text-[0.68rem] font-semibold text-white/85">
                    {summary.itemCount}{" "}
                    {summary.itemCount === 1 ? "item" : "items"} ·{" "}
                    {formatMoney(summary.total, summary.currency)}
                  </span>
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0"
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </>
            ) : (
              <span>Cart</span>
            )}
          </Link>
        </motion.div>
      </motion.nav>
    </>
  );
}

export function BottomNavAll() {
  return <BottomNav />;
}
