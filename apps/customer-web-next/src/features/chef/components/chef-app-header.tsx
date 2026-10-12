"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { ChefAccountMenu } from "@/features/chef/components/chef-account-menu";
import { ChefWorkspaceNavigation, useChefWorkspace } from "@/features/chef/components/chef-workspace-navigation";

/** Chef Mode header: the logo stays in the chef app; leaving it is an explicit account action. */
export function ChefAppHeader() {
  const pathname = usePathname();
  const { workspace, pending } = useChefWorkspace();
  // The sign-in page carries its own brand block and no account controls.
  if (pathname === "/chef/sign-in") return null;
  const onNotifications = pathname === "/chef/notifications";
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
            <Link
              href="/chef/notifications"
              className="chef-icon-button"
              aria-label="Notifications"
              aria-current={onNotifications ? "page" : undefined}
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
            </Link>
          ) : null}
          {/* The menu needs the signed-in account; until the check answers, a circle keeps its place. */}
          {pending ? <span className="chef-account-placeholder" aria-hidden="true" /> : <ChefAccountMenu />}
        </div>
      </div>
    </header>
  );
}

export default ChefAppHeader;
