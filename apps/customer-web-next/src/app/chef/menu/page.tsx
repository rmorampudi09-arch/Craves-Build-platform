import Link from "next/link";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefMenuManager } from "@/components/chef-menu-manager";

export const metadata = {
  title: "Chef menu | Craves",
  robots: { index: false, follow: false },
};

export default function ChefMenuPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-12 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/chef" className="text-sm font-semibold text-[#F6B545]">
          ← Chef mode
        </Link>
        <Link
          href="/chef/menu/media"
          className="rounded-full border border-[#F6B545] px-4 py-2 text-sm font-bold text-[#F6B545]"
        >
          Images and availability
        </Link>
      </div>
      <h1 className="mt-5 text-4xl font-bold text-white sm:text-5xl">
        Menu management
      </h1>
      <p className="mt-4 max-w-3xl text-slate-300">
        Create and edit dishes owned by your Catalog kitchen. Pricing and status
        are persisted only by Catalog Service.
      </p>
      <div className="mt-8">
        <ChefAccessBoundary>
          <ChefMenuManager />
        </ChefAccessBoundary>
      </div>
    </main>
  );
}
