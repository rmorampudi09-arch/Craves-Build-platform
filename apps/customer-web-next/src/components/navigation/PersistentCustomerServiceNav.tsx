"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarRange,
  ChefHat,
  ClipboardList,
  Heart,
} from "lucide-react";
import {
  getSession,
  loadSession,
  subscribeSession,
} from "@/services/auth/cravesAuth";
import {
  customerFavoritesLoaded,
  getCustomerFavoriteIds,
  loadCustomerFavoriteIds,
  subscribeCustomerFavorites,
} from "@/services/api/customerFavorites";
import { rememberReturnRoute } from "@/lib/return-navigation";

const serviceLinks = [
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/wishlist", label: "Saved", icon: Heart },
  { href: "/subscriptions", label: "Meal plans", icon: CalendarRange },
  { href: "/notifications", label: "Updates", icon: Bell },
  { href: "/chef", label: "Chef mode", icon: ChefHat },
] as const;

function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PersistentCustomerServiceNav({
  className = "",
}: {
  className?: string;
}) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(Boolean(getSession()));
  const [savedCount, setSavedCount] = useState(() => getCustomerFavoriteIds().size);

  useEffect(() => {
    if (pathname !== "/home") return;

    let active = true;
    const updateFromMemory = () => {
      if (active) setSignedIn(Boolean(getSession()));
    };
    const unsubscribe = subscribeSession(updateFromMemory);

    if (!getSession()) {
      void loadSession()
        .then((user) => {
          if (active) setSignedIn(Boolean(user));
        })
        .catch(() => {
          if (active) setSignedIn(false);
        });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/home" || !signedIn) return;

    let active = true;
    const syncSavedCount = () => {
      if (active) setSavedCount(getCustomerFavoriteIds().size);
    };
    const unsubscribe = subscribeCustomerFavorites(syncSavedCount);
    syncSavedCount();

    if (!customerFavoritesLoaded()) {
      void loadCustomerFavoriteIds()
        .then(syncSavedCount)
        .catch(() => {
          if (active) setSavedCount(0);
        });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [pathname, signedIn]);

  if (pathname !== "/home" || !signedIn) return null;

  return (
    <nav
      className={`flex gap-2 overflow-x-auto pb-1 ${className}`.trim()}
      aria-label="Customer services"
      data-customer-service-navigation="embedded"
    >
      {serviceLinks.map((link) => {
        const active = isActiveRoute(pathname, link.href);
        const savedLink = link.href === "/wishlist";
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => {
              rememberReturnRoute(link.href, pathname);
            }}
            aria-current={active ? "page" : undefined}
            className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-transparent bg-transparent px-3 text-sm font-semibold text-[#1A1A1A] transition-all duration-200 hover:-translate-y-px hover:bg-[#F1F3F5] hover:text-[#F62E18] hover:shadow-[0_6px_18px_rgba(26,26,26,0.08)] focus-visible:bg-[#F1F3F5] focus-visible:text-[#F62E18]"
          >
            <link.icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
            <span>{link.label}</span>
            {savedLink ? (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[0.65rem] font-black text-[#F62E18] shadow-[0_1px_4px_rgba(26,26,26,0.08)]"
                aria-label={`${savedCount} saved dishes`}
              >
                {savedCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export default PersistentCustomerServiceNav;
