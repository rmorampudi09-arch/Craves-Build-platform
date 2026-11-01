"use client";

import { usePathname } from "next/navigation";
import { ChefLoading, chefLoadingShapeFor } from "@/features/chef/components/chef-loading";

/**
 * A tapped tab or link shows the next page's shape at once while it comes from the server. Every chef
 * page is made on each visit, because the layout reads the chef's language cookie (so the first paint
 * is already in Telugu or Kannada); this shape is what keeps a tap feeling instant.
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
