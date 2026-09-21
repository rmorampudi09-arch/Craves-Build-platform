"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChefHat, Home, Soup, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";
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

type NavKey = "home" | "meals" | "chefs" | "profile" | "cart";

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
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return "profile";
  if (pathname.startsWith("/kitchen")) return "chefs";
  if (pathname.startsWith("/dish")) return "meals";
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

      if (currentY <= 48 || delta < -6) {
        setCartMode(false);
      } else if (currentY > 112 && delta > 7) {
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

  const hidden = shouldHide(pathname);
  const activeKey = activeKeyForPath(pathname);
  const expandedCart = cartMode && summary.itemCount > 0;

  const items = useMemo(
    () => [
      { key: "home" as const, href: "/home", label: "Home", icon: Home },
      {
        key: "meals" as const,
        href: "/home#available-dishes-heading",
        label: "Meals",
        icon: Soup,
      },
      {
        key: "chefs" as const,
        href: "/home#nearby-kitchens-heading",
        label: "Chefs",
        icon: ChefHat,
      },
      { key: "profile" as const, href: "/profile", label: "Profile", icon: User },
    ],
    [],
  );

  if (hidden) return null;

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
        className="h-[calc(4.65rem+env(safe-area-inset-bottom))] md:hidden"
      />

      <AnimatePresence initial={false} mode="sync">
        {expandedCart ? (
          <motion.div
            key="mobile-cart-expanded"
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 10, scale: 0.98 }
            }
            transition={{
              duration: reduceMotion ? 0 : 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 md:hidden"
          >
            <Link
              href="/cart"
              className="flex min-h-[3.75rem] w-full items-center gap-3 rounded-[1.2rem] bg-[#F62E18] px-3.5 text-white shadow-[0_16px_38px_rgba(246,46,24,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35 focus-visible:ring-offset-2"
              aria-label={
                "View cart with " +
                summary.itemCount +
                " " +
                (summary.itemCount === 1 ? "item" : "items")
              }
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
                <CravesCartIcon className="h-[1.08rem] w-[1.08rem] text-white" />
              </span>
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
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </motion.div>
        ) : (
          <motion.nav
            key="mobile-five-item-nav"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{
              duration: reduceMotion ? 0 : 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E5E7EB] bg-white/95 shadow-[0_-8px_26px_rgba(26,26,26,0.07)] backdrop-blur-xl md:hidden"
            aria-label="Customer navigation"
          >
            <ul className="mx-auto grid max-w-lg grid-cols-5 items-stretch px-1.5 pb-[max(0.38rem,env(safe-area-inset-bottom))] pt-1.5">
              {items.map(({ key, href, label, icon: Icon }) => {
                const active = activeKey === key;
                const sectionId =
                  key === "meals"
                    ? "available-dishes-heading"
                    : key === "chefs"
                      ? "nearby-kitchens-heading"
                      : null;

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
                        "flex min-h-[3.4rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[0.62rem] font-extrabold transition-colors",
                        active
                          ? "text-[#F62E18]"
                          : "text-[#6B6B6B] hover:text-[#1A1A1A]",
                      ].join(" ")}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon
                        className={[
                          "h-[1.16rem] w-[1.16rem]",
                          active ? "stroke-[2.5]" : "stroke-[2]",
                        ].join(" ")}
                        aria-hidden="true"
                      />
                      <span>{label}</span>
                    </Link>
                  </li>
                );
              })}

              <li>
                <Link
                  href="/cart"
                  className={[
                    "relative flex min-h-[3.4rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[0.62rem] font-extrabold transition-colors",
                    activeKey === "cart"
                      ? "text-[#F62E18]"
                      : "text-[#6B6B6B] hover:text-[#1A1A1A]",
                  ].join(" ")}
                  aria-current={activeKey === "cart" ? "page" : undefined}
                  aria-label={cartAria}
                >
                  <span className="relative">
                    <CravesCartIcon className="h-[1.16rem] w-[1.16rem]" />
                    {summary.itemCount > 0 ? (
                      <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F62E18] px-1 text-[0.52rem] font-black leading-none text-white">
                        {summary.itemCount > 99 ? "99+" : summary.itemCount}
                      </span>
                    ) : null}
                  </span>
                  <span>Cart</span>
                </Link>
              </li>
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}

export function BottomNavAll() {
  return <BottomNav />;
}
