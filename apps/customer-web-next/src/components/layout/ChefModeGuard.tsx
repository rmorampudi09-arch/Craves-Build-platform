"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isChefModeVerified } from "@/lib/chef-mode";
import { getSession, subscribeSession } from "@/features/auth/api/cravesAuth";

// Reachable from Chef Mode: the chef app, legal and help pages, sign-in, and the separate admin portal.
const OPEN_PATHS = [
  "/chef",
  "/privacy",
  "/terms",
  "/security",
  "/refunds-cancellations",
  "/contact",
  "/products-pricing",
  "/pilot-launch",
  "/sign-in",
  "/admin",
];

export function isOpenInChefMode(pathname: string): boolean {
  return OPEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * While this tab is in Chef Mode, customer screens are replaced with the chef home, so browser
 * Back never lands on them. Leaving is explicit: "Switch to customer app" or "Sign out".
 */
export function ChefModeGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const [, setRestored] = useState(0);
  const leave = Boolean(user && !isOpenInChefMode(pathname) && isChefModeVerified(user.id));

  useEffect(() => {
    if (leave) router.replace("/chef");
  }, [leave, router]);
  useEffect(() => {
    // Back can restore a customer page from the browser's page cache; check it again when it shows.
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setRestored((value) => value + 1);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  // Cover the customer screen for the moment it takes to return to the chef app.
  return leave ? <div className="fixed inset-0 z-[200] bg-white" aria-hidden="true" /> : null;
}

export default ChefModeGuard;
