import Link from "next/link";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";
import { SubscriptionPlanBrowser } from "@/components/subscription-plan-browser";

export const metadata = {
  title: "Meal subscriptions | Craves",
  robots: { index: true, follow: true },
};

export default function SubscriptionPlansPage() {
  return (
    <main className="min-h-screen bg-[#0B1426] text-white">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-[64px] max-w-7xl items-center gap-3 px-5 py-2.5 sm:px-8">
          <Link href="/home" className="flex items-center gap-3 rounded-xl" aria-label="Craves home">
            <CravesLogo size="sm" />
            <span className="text-sm font-black text-[#1A1A1A]">Meal plans</span>
          </Link>
        </div>
      </AutoHideCustomerHeader>
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <Link href="/home" className="text-sm font-semibold text-[#F6B545]">
          ← Craves home
        </Link>
        <p className="mt-8 text-sm font-bold uppercase tracking-[0.22em] text-[#F6B545]">
          Meal subscriptions
        </p>
        <h1 className="mt-4 max-w-4xl text-4xl font-bold text-white sm:text-6xl">
          Choose an active home-food plan.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">
          Prices and billing periods come directly from Craves Subscription Service. Renewal, unused meals and cancellation refunds are not promised by this screen.
        </p>
        <div className="mt-10">
          <SubscriptionPlanBrowser />
        </div>
      </div>
    </main>
  );
}
