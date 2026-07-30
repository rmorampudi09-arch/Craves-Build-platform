import { SubscriptionPlanBrowser } from "@/components/subscription-plan-browser";

export const metadata = { title: "Meal subscriptions | Craves", robots: { index: true, follow: true } };

export default function SubscriptionPlansPage() {
  return <main className="mx-auto min-h-screen max-w-7xl px-5 py-12 sm:px-8">
    <a href="/" className="text-sm font-semibold text-[#F6B545]">← Craves home</a>
    <p className="mt-8 text-sm font-bold uppercase tracking-[0.22em] text-[#F6B545]">Meal subscriptions</p>
    <h1 className="mt-4 max-w-4xl text-4xl font-bold text-white sm:text-6xl">Choose an active home-food plan.</h1>
    <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">Prices and billing periods come directly from Craves Subscription Service. Renewal, unused meals and cancellation refunds are not promised by this screen.</p>
    <div className="mt-10"><SubscriptionPlanBrowser /></div>
  </main>;
}
