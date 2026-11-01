"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, LifeBuoy } from "lucide-react";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { NOTICES_READ_EVENT } from "@/shared/lib/notice-events";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { ChefAccountMenu } from "@/features/chef/components/chef-account-menu";
import { ChefWorkspaceNavigation, useChefWorkspace } from "@/features/chef/components/chef-workspace-navigation";
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: { skip: "Skip to content", home: "Craves Chef home", help: "Help", notifications: "Notifications", unread: "Notifications, {count} unread" },
  te: { skip: "నేరుగా పేజీకి వెళ్లండి", home: "Craves చెఫ్ హోమ్", help: "సహాయం", notifications: "నోటిఫికేషన్లు", unread: "నోటిఫికేషన్లు, {count} చదవనివి" },
  kn: { skip: "ನೇರವಾಗಿ ಪುಟಕ್ಕೆ ಹೋಗಿ", home: "Craves ಚೆಫ್ ಹೋಮ್", help: "ಸಹಾಯ", notifications: "ಅಧಿಸೂಚನೆಗಳು", unread: "ಅಧಿಸೂಚನೆಗಳು, {count} ಓದದವು" },
});

/**
 * The bell's unread count of Chef Mode notices: read again on each page, when the tab comes back, after
 * notices are read, and every minute while the tab is visible. No count (route not live, or a failure) shows no badge.
 */
function useUnreadNotices(enabled: boolean, pathname: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      void sessionFetch("/api/notifications/in-app/unread-count?role=CHEF", { cache: "no-store" })
        .then(async (response) => {
          const body: unknown = response.ok ? await response.json().catch(() => null) : null;
          const unread = body && typeof body === "object" ? (body as { unreadCount?: unknown }).unreadCount : null;
          if (active) setCount(typeof unread === "number" && Number.isSafeInteger(unread) && unread > 0 ? unread : 0);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    window.addEventListener(NOTICES_READ_EVENT, load);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener(NOTICES_READ_EVENT, load);
    };
  }, [enabled, pathname]);
  return enabled ? count : 0;
}

/** Chef Mode header: the logo stays in the chef app; leaving it is an explicit account action. */
export function ChefAppHeader() {
  const pathname = usePathname();
  const { workspace, pending } = useChefWorkspace();
  const unread = useUnreadNotices(workspace && !pending, pathname);
  const text = useText(TEXT);
  // The sign-in page carries its own brand block and no account controls.
  if (pathname === "/chef/sign-in") return null;
  const onNotifications = pathname === "/chef/notifications";
  const onHelp = pathname === "/chef/support" || pathname.startsWith("/chef/support/");
  return (
    <header className="chef-panel-header">
      <a href="#chef-content" className="chef-skip-link">{text.skip}</a>
      <div className="chef-header-bar">
        <Link href="/chef" className="chef-brand" aria-label={text.home}>
          <CravesLogo size="sm" decorative />
          <span className="chef-brand-name">Craves</span>
          <span className="chef-brand-tag">Chef</span>
        </Link>
        <ChefWorkspaceNavigation placement="header" />
        <div className="chef-header-actions">
          {workspace ? (
            // Help is one tap away on every chef page, in words as well as a picture.
            <Link href="/chef/support" className="chef-help-link" aria-current={onHelp ? "page" : undefined}>
              <LifeBuoy className="h-5 w-5" aria-hidden="true" />
              <span>{text.help}</span>
            </Link>
          ) : null}
          {workspace ? (
            <Link
              href="/chef/notifications"
              className="chef-icon-button relative"
              aria-label={unread ? format(text.unread, { count: unread > 99 ? "99+" : unread }) : text.notifications}
              aria-current={onNotifications ? "page" : undefined}
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {unread ? (
                <span className="absolute right-0.5 top-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full border-2 border-white bg-[#C4200F] px-1 text-[0.625rem] font-bold leading-none text-white" aria-hidden="true">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
          ) : null}
          {/* The menu needs the signed-in account; until the check answers, a circle keeps its place. */}
          {/* On phones the Profile tab holds the account; the menu stays for laptops and for applicants. */}
          <div className={workspace ? "is-desktop-only" : undefined}>
            {pending ? <span className="chef-account-placeholder" aria-hidden="true" /> : <ChefAccountMenu />}
          </div>
        </div>
      </div>
    </header>
  );
}

export default ChefAppHeader;
