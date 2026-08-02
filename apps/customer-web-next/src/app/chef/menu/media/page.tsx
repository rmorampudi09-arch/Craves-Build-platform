import Link from "next/link";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefMenuMediaManager } from "@/components/chef-menu-media-manager";

export const metadata = {
  title: "Menu images and availability | Craves",
  robots: { index: false, follow: false },
};

export default function ChefMenuMediaPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-12 sm:px-8">
      <Link href="/chef/menu" className="text-sm font-semibold text-[#F6B545]">
        ← Menu management
      </Link>
      <h1 className="mt-5 text-4xl font-bold text-white sm:text-5xl">
        Images and availability
      </h1>
      <p className="mt-4 max-w-3xl text-slate-300">
        Manage Catalog-backed availability and upload approved image formats.
        The browser never receives Blob Storage paths or credentials.
      </p>
      <div className="mt-8">
        <ChefAccessBoundary>
          <ChefMenuMediaManager />
        </ChefAccessBoundary>
      </div>
    </main>
  );
}
