"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Bell } from "lucide-react";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { ChefAccountMenu } from "@/components/chef-account-menu";
import { ChefWorkspaceNavigation } from "@/components/chef-workspace-navigation";
import { isChefModeVerified } from "@/lib/chef-mode";
import { getSession, subscribeSession } from "@/services/auth/cravesAuth";

/** Chef Mode header: the logo stays in the chef app; leaving it is an explicit account action. */
export function ChefAppHeader() {
  const pathname = usePathname();
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  // The sign-in page carries its own brand block and no account controls.
  if (pathname === "/chef/sign-in") return null;
  const workspace =
    !pathname.startsWith("/chef/application") &&
    Boolean(user?.roles.some((role) => role.toUpperCase() === "CHEF")) &&
    isChefModeVerified(user?.id);
  return (
    <header className="chef-panel-header">
      <div className="chef-header-bar">
        <Link href="/chef" className="chef-brand" aria-label="Craves Chef home">
          <CravesLogo size="sm" decorative />
          <span className="chef-brand-name">Craves</span>
          <span className="chef-brand-tag">Chef</span>
        </Link>
        <ChefWorkspaceNavigation placement="header" />
        <div className="chef-header-actions">
          {workspace ? (
            <Link href="/chef/notifications" className="chef-icon-button" aria-label="Notifications">
              <Bell className="h-5 w-5" aria-hidden="true" />
            </Link>
          ) : null}
          <ChefAccountMenu />
        </div>
      </div>
    </header>
  );
}

export default ChefAppHeader;
