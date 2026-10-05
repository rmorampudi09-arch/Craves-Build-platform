"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const BottomNavContent = dynamic(() => import("./BottomNavContent"), {
  loading: () => (
    <div
      aria-hidden="true"
      className="h-[calc(4.7rem+env(safe-area-inset-bottom))] md:hidden"
    />
  ),
});

const HIDDEN_PATH_PREFIXES = [
  "/sign-in", "/cart", "/checkout", "/confirmation", "/chef", "/admin",
  "/contact", "/privacy", "/terms", "/security", "/refunds-cancellations",
  "/products-pricing",
];

export function BottomNav() {
  const pathname = usePathname();
  if (
    pathname === "/" ||
    HIDDEN_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }
  return <BottomNavContent />;
}

export function BottomNavAll() {
  return <BottomNav />;
}
