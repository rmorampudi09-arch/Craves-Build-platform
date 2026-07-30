import { ChefMenuManager } from "@/components/chef-menu-manager";

export const metadata = { title: "Chef menu | Craves", robots: { index: false, follow: false } };

export default function ChefMenuPage() {
  return <main className="mx-auto min-h-screen max-w-7xl px-5 py-12 sm:px-8"><a href="/chef" className="text-sm font-semibold text-[#F6B545]">← Chef mode</a><h1 className="mt-5 text-4xl font-bold text-white sm:text-5xl">Menu management</h1><p className="mt-4 max-w-3xl text-slate-300">Create and edit dishes owned by your Catalog kitchen. Pricing and status are persisted only by Catalog Service.</p><div className="mt-8"><ChefMenuManager /></div></main>;
}
