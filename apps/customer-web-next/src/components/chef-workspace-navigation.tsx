"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeIndianRupee,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  Home,
  ShieldCheck,
  Store,
  Utensils,
} from "lucide-react";

const coreLinks = [
  { href: "/chef", label: "Home", icon: Home },
  { href: "/chef/kitchen", label: "My kitchen", icon: Store },
  { href: "/chef/menu", label: "My menu", icon: Utensils },
  { href: "/chef/orders", label: "Orders", icon: ClipboardList },
  { href: "/chef/earnings", label: "What I've earned", icon: BadgeIndianRupee },
] as const;

// These routes stay available for existing chefs and direct links, but they are
// intentionally not presented as equal-weight choices to a new chef.
const extraLinks = [
  { href: "/chef/application", label: "Your details", icon: ClipboardCheck },
  { href: "/chef/meal-plans", label: "Meal Plans", icon: CalendarDays },
  { href: "/chef/capacity", label: "Capacity", icon: Gauge },
  { href: "/chef/operations", label: "Operations", icon: ShieldCheck },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/chef" && pathname.startsWith(`${href}/`));
}

export function ChefWorkspaceNavigation() {
  const pathname = usePathname();

  // Application onboarding is intentionally linear: no tabs, no competing
  // destinations, and no dashboard navigation while a chef is applying.
  if (pathname === "/chef/application" || pathname.startsWith("/chef/application/")) {
    return null;
  }

  const currentExtra = extraLinks.find((link) => isActive(pathname, link.href));
  const visibleLinks = currentExtra ? [...coreLinks, currentExtra] : coreLinks;

  return (
    <nav
      className="chef-panel-navigation mt-1 border-t border-[#E5E7EB] pt-2"
      aria-label="Chef mode navigation"
    >
      {visibleLinks.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`chef-panel-nav-link inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
              active
                ? "!bg-[#F62E18] !text-white"
                : "!bg-white !text-[#1A1A1A] hover:!bg-[#F1F3F5]"
            }`}
          >
            <link.icon className="h-4 w-4" aria-hidden="true" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default ChefWorkspaceNavigation;
