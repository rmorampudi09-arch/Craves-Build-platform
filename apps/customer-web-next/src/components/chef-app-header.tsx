"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { ChefAccountMenu } from "@/components/chef-account-menu";
import { ChefWorkspaceNavigation } from "@/components/chef-workspace-navigation";

/** Chef Mode header: the logo stays in the chef app; leaving it is an explicit account action. */
export function ChefAppHeader() {
  const pathname = usePathname();
  // The sign-in page carries its own brand block and no account controls.
  if (pathname === "/chef/sign-in") return null;
  return (
    <header className="chef-panel-header border-b border-[#E5E7EB] bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-2 md:px-6">
        <div className="flex min-h-12 items-center justify-between gap-4">
          <Link href="/chef" className="inline-flex min-h-11 items-center gap-3 rounded-xl" aria-label="Chef Mode home">
            <CravesLogo size="sm" decorative />
            <span>
              <span className="block text-base font-bold text-[#1A1A1A]">Craves</span>
              <span className="block text-xs font-medium text-[#6B6B6B]">Chef Mode</span>
            </span>
          </Link>
          <ChefAccountMenu />
        </div>
        <ChefWorkspaceNavigation placement="header" />
      </div>
    </header>
  );
}

export default ChefAppHeader;
