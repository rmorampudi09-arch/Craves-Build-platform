"use client";

import { usePathname } from "next/navigation";
import { ChefLoading, chefLoadingShapeFor } from "@/features/chef/components/chef-loading";

/**
 * A tapped tab or link shows the next page's shape at once while it comes from the server: Home,
 * an order, Statements and Get help are made fresh on each visit. Static pages arrive prefetched.
 */
export default function ChefRouteLoading() {
  const pathname = usePathname();
  // The sign-in page draws its own full screen.
  if (pathname === "/chef/sign-in") return null;
  const shape = chefLoadingShapeFor(pathname);
  return (
    <main className={shape === "dashboard" || shape === "orders" ? "chef-page" : "chef-page is-narrow"}>
      <ChefLoading shape={shape} label="Opening the page" />
    </main>
  );
}
