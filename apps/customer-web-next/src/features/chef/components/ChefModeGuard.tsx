"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isChefModeVerified, isCustomerModeVerified } from "@/features/chef/lib/chef-mode";
import { CUSTOMERS_LAUNCHING_SOON } from "@/features/sign-in/lib/customer-launch";
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
 * A chef reaches customer screens (a new tab, or after Chef Mode ends) only once the customer side
 * is confirmed with an OTP on this device, as the switch asks.
 */
export function ChefModeGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const [, setRestored] = useState(0);
  const customerScreen = user && !isOpenInChefMode(pathname) ? user : null;
  const leave = Boolean(customerScreen && isChefModeVerified(customerScreen.id));
  const confirm = Boolean(
    customerScreen &&
      !leave &&
      customerScreen.roles.some((role) => role.toUpperCase() === "CHEF") &&
      !isCustomerModeVerified(customerScreen.id),
  );

  useEffect(() => {
    if (leave) router.replace("/chef");
    // Until the customer launch, the same launching-soon note as "Switch to customer app" (customer-launch.ts).
    else if (confirm && CUSTOMERS_LAUNCHING_SOON) router.replace("/sign-in?from=chef");
    else if (confirm)
      router.replace(`/sign-in?confirm=customer&returnTo=${encodeURIComponent(`${pathname}${window.location.search}`)}`);
  }, [leave, confirm, pathname, router]);
  useEffect(() => {
    // Back can restore a customer page from the browser's page cache; check it again when it shows.
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setRestored((value) => value + 1);
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  // Cover the customer screen for the moment it takes to leave it.
  return leave || confirm ? <div className="fixed inset-0 z-[200] bg-white" aria-hidden="true" /> : null;
}

export default ChefModeGuard;
