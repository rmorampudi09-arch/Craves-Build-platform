import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftRight, ChefHat } from "lucide-react";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { ChefWorkspaceNavigation } from "@/components/chef-workspace-navigation";

export default function ChefLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="chef-panel-theme bg-white" style={{ background: "#FFFFFF" }}>
      <header className="chef-panel-header" style={{ background: "#FFFFFF" }}>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-3 md:px-6">
          <div className="flex min-h-11 items-center justify-between gap-4">
            <Link
              href="/chef"
              className="chef-panel-brand-group min-h-11 rounded-lg"
              aria-label="Craves chef workspace home"
            >
              <CravesLogo size="sm" />
              <span className="hidden sm:block">
                <span className="chef-panel-brand !block !text-lg">Craves</span>
                <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Chef workspace
                </span>
              </span>
              <span className="chef-panel-mode-badge hidden md:inline-flex">
                <ChefHat className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Chef mode
              </span>
            </Link>

            <Link
              href="/home"
              className="chef-panel-customer-link inline-flex min-h-11 items-center gap-2"
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Customer mode</span>
            </Link>
          </div>

          <div className="min-w-0 border-t border-[#E5E7EB] pt-1">
            <ChefWorkspaceNavigation />
          </div>
        </div>
      </header>

      <div className="chef-panel-content">{children}</div>

      <footer className="chef-panel-footer !w-full !max-w-7xl px-4 md:px-6">
        <p>Craves chef workspace · Role and ownership checked by every backend service</p>
        <Link href="/home">Return to customer experience</Link>
      </footer>
    </div>
  );
}
