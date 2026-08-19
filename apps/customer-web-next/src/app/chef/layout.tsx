import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ChefHat } from "lucide-react";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { ChefWorkspaceNavigation } from "@/components/chef-workspace-navigation";

export default function ChefLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="chef-panel-theme min-h-screen bg-white" style={{ background: "#FFFFFF" }}>
      <header className="chef-panel-header border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-3 md:px-6">
          <div className="flex min-h-11 items-center justify-between gap-4">
            <Link
              href="/chef"
              className="inline-flex min-h-11 items-center gap-3 rounded-xl"
              aria-label="Craves Chef Mode home"
            >
              <CravesLogo size="sm" />
              <span className="hidden sm:block">
                <span className="block text-base font-bold text-[#1A1A1A]">Craves</span>
                <span className="block text-xs font-medium text-[#6B6B6B]">Chef Mode</span>
              </span>
              <span className="hidden items-center gap-1.5 rounded-full bg-[#F1F3F5] px-3 py-1.5 text-xs font-semibold text-[#1A1A1A] md:inline-flex">
                <ChefHat className="h-3.5 w-3.5 text-[#F62E18]" aria-hidden="true" />
                Chef
              </span>
            </Link>

            <Link
              href="/home"
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-[#6B6B6B] transition hover:bg-[#F1F3F5] hover:text-[#1A1A1A]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Back to Craves</span>
              <span className="sm:hidden">Back</span>
            </Link>
          </div>

          <ChefWorkspaceNavigation />
        </div>
      </header>

      <div className="chef-panel-content">{children}</div>

      <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] px-4 py-6 text-xs text-[#6B6B6B] md:px-6">
        <p>Craves Chef Mode</p>
        <Link href="/home" className="font-semibold text-[#1A1A1A] hover:text-[#F62E18]">
          Customer home
        </Link>
      </footer>
    </div>
  );
}
