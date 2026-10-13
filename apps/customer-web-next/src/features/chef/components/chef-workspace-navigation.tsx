"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BadgeIndianRupee, ClipboardList, House, LayoutGrid, Utensils } from "lucide-react";
import { chefDeviceAccount, isChefModeVerified } from "@/features/chef/lib/chef-mode";
import { getSession, subscribeSession, type CravesUser } from "@/features/auth/api/cravesAuth";

// The same five tabs on phones and desktop; every other chef page is listed in More (/chef/profile).
const primaryLinks = [
  { href: "/chef", label: "Home", icon: House },
  { href: "/chef/orders", label: "Orders", icon: ClipboardList },
  { href: "/chef/menu", label: "Menu", icon: Utensils },
  { href: "/chef/earnings", label: "Earnings", icon: BadgeIndianRupee },
  { href: "/chef/profile", label: "More", icon: LayoutGrid },
] as const;

/** The tab a page belongs to; Notifications has none (the header bell marks it). */
function activeHref(pathname: string): string | null {
  if (pathname === "/chef") return "/chef";
  if (pathname === "/chef/notifications") return null;
  // Money pages open from Earnings.
  if (/^\/chef\/(?:finance|statements|bank)(?:\/|$)/.test(pathname)) return "/chef/earnings";
  const tab = primaryLinks.find(
    ({ href }) => href !== "/chef" && (pathname === href || pathname.startsWith(`${href}/`)),
  );
  // Pages opened from More keep More highlighted.
  return tab?.href ?? "/chef/profile";
}
function hasChefRole(user: CravesUser | null) {
  return Boolean(user?.roles.some((role) => role.toUpperCase() === "CHEF"));
}

/**
 * Whether the tabs and the bell show: for a chef in Chef Mode. A device that remembers a kitchen
 * shows them at once (`pending`), before the session check answers; the answer keeps them, or hides
 * them for an account without CHEF or another account. The server render has neither, so hydration
 * matches. Applicants never get tabs, so application pages wait for the answer.
 */
export function useChefWorkspace(): { workspace: boolean; pending: boolean } {
  const pathname = usePathname();
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const device = useSyncExternalStore(subscribeSession, chefDeviceAccount, () => null);
  const applying = pathname.startsWith("/chef/application");
  if (pathname === "/chef/sign-in" || (applying && pathname !== "/chef/application/status"))
    return { workspace: false, pending: false };
  if (user) return { workspace: hasChefRole(user) && isChefModeVerified(user.id), pending: false };
  const pending = device !== null && !applying;
  return { workspace: pending, pending };
}

export function ChefWorkspaceNavigation({ placement }: { placement: "header" | "bottom" }) {
  const pathname = usePathname();
  const { workspace } = useChefWorkspace();

  // Applicants and the sign-in page get no workspace tabs; the header keeps their account menu.
  if (!workspace) return null;
  const current = activeHref(pathname);
  const links = primaryLinks.map((link) => {
    const active = link.href === current;
    // The tab is the page itself only at its own address; inside its section it is the current item.
    const ariaCurrent = active ? (pathname === link.href ? "page" : "true") : undefined;
    return placement === "header" ? (
      <Link key={link.href} href={link.href} aria-current={ariaCurrent} className={`chef-desktop-nav-link ${active ? "is-active" : ""}`}><link.icon className="h-4 w-4" aria-hidden="true" /><span>{link.label}</span></Link>
    ) : (
      <Link key={link.href} href={link.href} aria-current={ariaCurrent} className={`chef-mobile-nav-link ${active ? "is-active" : ""}`}><span className="chef-mobile-nav-icon"><link.icon className="h-[1.375rem] w-[1.375rem] shrink-0" strokeWidth={active ? 2.25 : 1.9} aria-hidden="true" /></span><span>{link.label}</span></Link>
    );
  });

  if (placement === "header") return (
      <nav className="chef-desktop-nav" aria-label="Chef workspace">
        <div className="chef-desktop-nav-primary">{links}</div>
      </nav>
  );
  return (
      <nav className="chef-mobile-nav" aria-label="Chef primary navigation" data-craves-bottom-nav>{links}</nav>
  );
}
export default ChefWorkspaceNavigation;
