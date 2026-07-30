import { AdminOperationalInvestigator } from "@/components/admin-operational-investigator";

export const metadata = {
  title: "Operational investigations | Craves administration",
  robots: { index: false, follow: false }
};

export default function AdminOperationsPage() {
  return <main className="mx-auto min-h-screen max-w-7xl px-5 py-12 sm:px-8">
    <a href="/admin" className="text-sm font-semibold text-[#F6B545]">← Administration</a>
    <p className="mt-8 text-sm font-bold uppercase tracking-[0.22em] text-[#F6B545]">Craves operations</p>
    <h1 className="mt-4 text-4xl font-bold text-white sm:text-6xl">Audited operational evidence.</h1>
    <p className="mt-5 max-w-3xl text-slate-300">Inspect one exact order, payment, refund or delivery command. Every successful lookup requires an operational reason and is recorded by the owning backend service.</p>
    <div className="mt-10"><AdminOperationalInvestigator /></div>
  </main>;
}
