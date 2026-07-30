import { AdminSubscriptionPlanManager } from "@/components/admin-subscription-plan-manager";

export const metadata = { title: "Subscription plans | Craves Admin", robots: { index: false, follow: false } };

export default function AdminSubscriptionPlansPage() {
  return <main className="mx-auto min-h-screen max-w-7xl px-5 py-12 sm:px-8">
    <a href="/admin" className="text-sm font-semibold text-[#F6B545]">← Administration</a>
    <p className="mt-8 text-sm font-bold uppercase tracking-[0.22em] text-[#F6B545]">Subscription configuration</p>
    <h1 className="mt-4 text-4xl font-bold text-white sm:text-6xl">Manage subscription plans.</h1>
    <p className="mt-5 max-w-3xl text-slate-300">Create backend-owned draft plans and control only the existing DRAFT, ACTIVE and INACTIVE states. Product and Finance remain responsible for plan content and amount decisions.</p>
    <div className="mt-10"><AdminSubscriptionPlanManager /></div>
  </main>;
}
