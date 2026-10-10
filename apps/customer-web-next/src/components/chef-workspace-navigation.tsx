"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BadgeIndianRupee, ClipboardList, House, LayoutGrid, Utensils } from "lucide-react";
import { isChefModeVerified } from "@/lib/chef-mode";
import { getSession, subscribeSession, type CravesUser } from "@/services/auth/cravesAuth";

// The same five tabs on phones and desktop; every other chef page is listed in More (/chef/profile).
const primaryLinks = [
  { href: "/chef", label: "Home", icon: House },
  { href: "/chef/orders", label: "Orders", icon: ClipboardList },
  { href: "/chef/menu", label: "Menu", icon: Utensils },
  { href: "/chef/earnings", label: "Earnings", icon: BadgeIndianRupee },
  { href: "/chef/profile", label: "More", icon: LayoutGrid },
] as const;

function activeHref(pathname: string): string {
  if (pathname === "/chef") return "/chef";
  const tab = primaryLinks.find(
    ({ href }) => href !== "/chef" && (pathname === href || pathname.startsWith(`${href}/`)),
  );
  // Pages opened from More keep More highlighted.
  return tab?.href ?? "/chef/profile";
}
function hasChefRole(user: CravesUser | null) {
  return Boolean(user?.roles.some((role) => role.toUpperCase() === "CHEF"));
}

export function ChefWorkspaceNavigation({ placement }: { placement: "header" | "bottom" }) {
  const pathname = usePathname();
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);

  // Applicants and the sign-in page get no workspace tabs; the header keeps their account menu.
  if (
    pathname === "/chef/sign-in" ||
    pathname.startsWith("/chef/application") ||
    !hasChefRole(user) ||
    !isChefModeVerified(user?.id)
  )
    return null;
  const current = activeHref(pathname);
  const links = primaryLinks.map((link) => {
    const active = link.href === current;
    return placement === "header" ? (
      <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`chef-desktop-nav-link ${active ? "is-active" : ""}`}><link.icon className="h-4 w-4" aria-hidden="true" /><span>{link.label}</span></Link>
    ) : (
      <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`chef-mobile-nav-link ${active ? "is-active" : ""}`}><span className="chef-mobile-nav-icon"><link.icon className="h-[1.12rem] w-[1.12rem] shrink-0" aria-hidden="true" /></span><span>{link.label}</span></Link>
    );
  });

  if (placement === "header") return (
      <nav className="chef-desktop-nav" aria-label="Chef workspace">
        <div className="chef-desktop-nav-primary">{links}</div>
      </nav>
  );
  return (
      <nav className="chef-mobile-nav" aria-label="Chef primary navigation">{links}</nav>
  );
}
export default ChefWorkspaceNavigation;
