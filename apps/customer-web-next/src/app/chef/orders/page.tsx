import Link from "next/link";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ChefOrderInbox } from "@/components/chef-order-inbox";

export const metadata = {
  title: "Chef orders | Craves",
  robots: { index: false, follow: false },
};

export default function ChefOrdersPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-12 sm:px-8">
      <Link href="/chef" className="text-sm font-semibold text-[#F6B545]">
        ← Chef mode
      </Link>
      <h1 className="mt-5 text-4xl font-bold text-white sm:text-5xl">
        Chef orders
      </h1>
      <p className="mt-4 max-w-3xl text-slate-300">
        Review orders owned by your approved kitchen and take the workflow
        actions supported by Order Service.
      </p>
      <div className="mt-8">
        <ChefAccessBoundary>
          <ChefOrderInbox />
        </ChefAccessBoundary>
      </div>
    </main>
  );
}
