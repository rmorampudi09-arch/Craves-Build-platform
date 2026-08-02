import { AdminSubscriptionOperator } from "@/components/admin-subscription-operator";

export const metadata = { title: "Subscription operations | Craves Admin", robots: { index: false, follow: false } };

export default function AdminSubscriptionsPage() {
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-12 sm:px-8">
    <a href="/admin" className="text-sm font-semibold text-[#F6B545]">← Administration</a>
    <p className="mt-8 text-sm font-bold uppercase tracking-[0.22em] text-[#F6B545]">Subscription operations</p>
    <h1 className="mt-4 text-4xl font-bold text-white sm:text-6xl">Controlled status intervention.</h1>
    <p className="mt-5 max-w-3xl text-slate-300">Use an exact subscription UUID and record an explicit reason. Subscription Service validates the administrator role, allowed status and durable history.</p>
    <div className="mt-10"><AdminSubscriptionOperator /></div>
  </main>;
}
