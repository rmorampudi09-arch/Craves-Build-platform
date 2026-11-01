"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ClipboardList, House, UserRound, Utensils, Wallet } from "lucide-react";
import { chefDeviceAccount, isChefModeVerified } from "@/features/chef/lib/chef-mode";
import { useWaitingOrderCount } from "@/features/chef/lib/chef-order-alert";
import { getSession, subscribeSession, type CravesUser } from "@/features/auth/api/cravesAuth";
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: { home: "Home", orders: "Orders", menu: "Menu", earnings: "Earnings", profile: "Profile", workspace: "Chef workspace", primary: "Chef primary navigation", waiting: "{count} waiting", waitingOne: "{count} waiting" },
  te: { home: "హోమ్", orders: "ఆర్డర్లు", menu: "మెనూ", earnings: "సంపాదన", profile: "ప్రొఫైల్", workspace: "చెఫ్ పేజీలు", primary: "చెఫ్ ముఖ్య మెనూ", waiting: "{count} వేచి ఉన్నాయి", waitingOne: "{count} వేచి ఉంది" },
  kn: { home: "ಹೋಮ್", orders: "ಆರ್ಡರ್‌ಗಳು", menu: "ಮೆನು", earnings: "ಗಳಿಕೆ", profile: "ಪ್ರೊಫೈಲ್", workspace: "ಚೆಫ್ ಪುಟಗಳು", primary: "ಚೆಫ್ ಮುಖ್ಯ ಮೆನು", waiting: "{count} ಕಾಯುತ್ತಿವೆ", waitingOne: "{count} ಕಾಯುತ್ತಿದೆ" },
});

// The same five tabs on phones and desktop, named as in the app; every other chef page is listed in Profile (/chef/profile).
const primaryLinks = [
  { href: "/chef", key: "home", icon: House },
  { href: "/chef/orders", key: "orders", icon: ClipboardList },
  { href: "/chef/menu", key: "menu", icon: Utensils },
  { href: "/chef/earnings", key: "earnings", icon: Wallet },
  { href: "/chef/profile", key: "profile", icon: UserRound },
] as const;

/** The tab a page belongs to; Notifications has none (the header bell marks it). */
function activeHref(pathname: string): string | null {
  if (pathname === "/chef") return "/chef";
  if (pathname === "/chef/notifications") return null;
  // Money pages open from Earnings; Meal plans from Menu. Anything else (Daily limits too) keeps Profile highlighted.
  if (/^\/chef\/(?:finance|statements|bank)(?:\/|$)/.test(pathname)) return "/chef/earnings";
  if (pathname === "/chef/meal-plans") return "/chef/menu";
  const tab = primaryLinks.find(
    ({ href }) => href !== "/chef" && (pathname === href || pathname.startsWith(`${href}/`)),
  );
  // Pages opened from Profile keep Profile highlighted.
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
  const text = useText(TEXT);
  // Orders waiting for an answer show as a red count on the Orders tab, on every page.
  const waiting = useWaitingOrderCount();

  // Applicants and the sign-in page get no workspace tabs; the header keeps their account menu.
  if (!workspace) return null;
  const current = activeHref(pathname);
  const links = primaryLinks.map((link) => {
    const active = link.href === current;
    // The tab is the page itself only at its own address; inside its section it is the current item.
    const ariaCurrent = active ? (pathname === link.href ? "page" : "true") : undefined;
    const label = text[link.key];
    const count = link.key === "orders" && waiting > 0 ? (waiting > 9 ? "9+" : String(waiting)) : null;
    const badge = count ? <span className="chef-nav-badge" aria-hidden="true">{count}</span> : null;
    const name = count ? `${label}, ${format(waiting === 1 ? text.waitingOne : text.waiting, { count: waiting })}` : undefined;
    return placement === "header" ? (
      <Link key={link.href} href={link.href} aria-current={ariaCurrent} aria-label={name} className={`chef-desktop-nav-link ${active ? "is-active" : ""}`}><link.icon className="h-4 w-4" aria-hidden="true" /><span>{label}</span>{badge}</Link>
    ) : (
      <Link key={link.href} href={link.href} aria-current={ariaCurrent} aria-label={name} className={`chef-mobile-nav-link ${active ? "is-active" : ""}`}><span className="chef-mobile-nav-icon"><link.icon className="h-[1.375rem] w-[1.375rem] shrink-0" strokeWidth={active ? 2.25 : 1.9} aria-hidden="true" />{badge}</span><span className="chef-mobile-nav-label">{label}</span></Link>
    );
  });

  if (placement === "header") return (
      <nav className="chef-desktop-nav" aria-label={text.workspace}>
        <div className="chef-desktop-nav-primary">{links}</div>
      </nav>
  );
  return (
      <nav className="chef-mobile-nav" aria-label={text.primary} data-craves-bottom-nav>{links}</nav>
  );
}
export default ChefWorkspaceNavigation;
