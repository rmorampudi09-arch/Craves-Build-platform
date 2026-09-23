"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, ChefHat } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FaHome, FaUser } from "react-icons/fa";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";
import { cartCount, subscribeCart } from "@/services/api/cravesCart";

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

export function BottomNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const lastScrollY = useRef(0);
  const framePending = useRef(false);
  const [hiddenByScroll, setHiddenByScroll] = useState(false);
  const [itemCount, setItemCount] = useState(() => cartCount());

  useEffect(() => {
    const sync = () => setItemCount(cartCount());
    sync();
    return subscribeCart(sync);
  }, []);

  useEffect(() => {
    lastScrollY.current = Math.max(window.scrollY, 0);
    setHiddenByScroll(false);

    const update = () => {
      const currentY = Math.max(window.scrollY, 0);
      const delta = currentY - lastScrollY.current;

      // Keep the lower navigation out of the way while the customer scrolls
      // back up to search/filter content. Bring it back while moving deeper
      // into the feed, and always show it near the top of a page.
      if (currentY <= 52) {
        setHiddenByScroll(false);
      } else if (delta < -6) {
        setHiddenByScroll(true);
      } else if (delta > 6) {
        setHiddenByScroll(false);
      }

      lastScrollY.current = currentY;
      framePending.current = false;
    };

    const handleScroll = () => {
      if (framePending.current) return;
      framePending.current = true;
      window.requestAnimationFrame(update);
    };

    const handleFocus = () => setHiddenByScroll(false);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("focus", handleFocus);
    };
  }, [pathname]);

  if (shouldHide(pathname)) return null;

  const activeKey = activeKeyForPath(pathname);

  return (
    <>
      <div
        aria-hidden="true"
        className="h-[calc(4.7rem+env(safe-area-inset-bottom))] md:hidden"
      />

      <motion.nav
        initial={false}
        animate={{
          y: hiddenByScroll ? "115%" : "0%",
          opacity: hiddenByScroll ? 0 : 1,
        }}
        transition={{
          duration: reduceMotion ? 0 : 0.24,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={[
          "fixed inset-x-0 bottom-0 z-40 rounded-t-[1.15rem] border-t border-[#ECEEF0] bg-white/96 shadow-[0_-8px_24px_rgba(26,26,26,0.065)] backdrop-blur-xl md:hidden",
          hiddenByScroll ? "pointer-events-none" : "",
        ].join(" ")}
        aria-hidden={hiddenByScroll || undefined}
        aria-label="Customer navigation"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5 items-stretch px-1.5 pb-[max(0.38rem,env(safe-area-inset-bottom))] pt-1.5">
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
        </ul>
      </motion.nav>
    </>
  );
}

export function BottomNavAll() {
  return <BottomNav />;
}
