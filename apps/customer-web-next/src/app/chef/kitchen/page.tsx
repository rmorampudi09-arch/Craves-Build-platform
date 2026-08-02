import Link from "next/link";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefKitchenForm } from "@/components/chef-kitchen-form";

export const metadata = {
  title: "Kitchen profile | Craves",
  robots: { index: false, follow: false },
};

export default function ChefKitchenPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-12 sm:px-8">
      <Link href="/chef" className="text-sm font-semibold text-[#F6B545]">
        ← Chef mode
      </Link>
      <h1 className="mt-5 text-4xl font-bold text-white sm:text-5xl">
        Kitchen profile
      </h1>
      <p className="mt-4 max-w-3xl text-slate-300">
        Manage the Catalog Service profile owned by your approved chef identity.
        Serviceability, ranking and delivery radius remain backend/product
        decisions.
      </p>
      <div className="mt-8">
        <ChefAccessBoundary>
          <ChefKitchenForm />
        </ChefAccessBoundary>
      </div>
    </main>
  );
}
