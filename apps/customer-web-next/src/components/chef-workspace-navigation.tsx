"use client";

import Link from "next/link";
import { FaHome, FaUser } from "react-icons/fa";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeIndianRupee, CalendarDays, ClipboardCheck, ClipboardList, Gauge, ShieldCheck, Store, Utensils } from "lucide-react";
import { getSession, subscribeSession, type CravesUser } from "@/services/auth/cravesAuth";

const primaryLinks = [
  { href: "/chef", label: "Home", icon: FaHome },
  { href: "/chef/orders", label: "Orders", icon: ClipboardList },
  { href: "/chef/menu", label: "Menu", icon: Utensils },
  { href: "/chef/earnings", label: "Earnings", icon: BadgeIndianRupee },
  { href: "/chef/profile", label: "Profile", icon: FaUser },
] as const;

const contextualLinks = [
  { href: "/chef/kitchen", label: "My kitchen", icon: Store },
  { href: "/chef/application", label: "Your details", icon: ClipboardCheck },
  { href: "/chef/meal-plans", label: "Meal Plans", icon: CalendarDays },
  { href: "/chef/capacity", label: "Capacity", icon: Gauge },
  { href: "/chef/operations", label: "Operations", icon: ShieldCheck },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/chef" && pathname.startsWith(`${href}/`));
}
function hasChefRole(user: CravesUser | null) {
  return Boolean(user?.roles.some((role) => role.toUpperCase() === "CHEF"));
}

export function ChefWorkspaceNavigation() {
  const pathname = usePathname();
  const [canUseChefWorkspace, setCanUseChefWorkspace] = useState(() => hasChefRole(getSession()));

  useEffect(() => {
    const sync = () => setCanUseChefWorkspace(hasChefRole(getSession()));
    sync();
    return subscribeSession(sync);
  }, []);

  if (pathname.startsWith("/chef/application") || !canUseChefWorkspace) return null;
  const currentContextual = contextualLinks.find((link) => isActive(pathname, link.href));

  return (
    <>
      <nav className="chef-desktop-nav" aria-label="Chef workspace">
        <div className="chef-desktop-nav-primary">
          {primaryLinks.map((link) => {
            const active = isActive(pathname, link.href);
            return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`chef-desktop-nav-link ${active ? "is-active" : ""}`}><link.icon className="h-4 w-4" aria-hidden="true" /><span>{link.label}</span></Link>;
          })}
        </div>
        {currentContextual ? <Link href={currentContextual.href} aria-current="page" className="chef-context-link"><currentContextual.icon className="h-4 w-4" aria-hidden="true" /><span>{currentContextual.label}</span></Link> : null}
      </nav>
      <nav className="chef-mobile-nav" aria-label="Chef primary navigation">
        {primaryLinks.map((link) => {
          const active = isActive(pathname, link.href);
          return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`chef-mobile-nav-link ${active ? "is-active" : ""}`}><span className="chef-mobile-nav-icon"><link.icon className="h-5 w-5" aria-hidden="true" /></span><span>{link.label}</span></Link>;
        })}
      </nav>
    </>
  );
}
export default ChefWorkspaceNavigation;
