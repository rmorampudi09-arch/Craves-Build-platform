import { AdminNotificationRecovery } from "@/components/admin-notification-recovery";

export const dynamic = "force-dynamic";

export default function AdminNotificationsPage() {
  return <main className="min-h-screen bg-[#0B1426] px-5 py-10 text-white sm:px-8 lg:px-12">
    <div className="mx-auto max-w-7xl">
      <a href="/admin" className="text-sm font-bold text-[#F6B545]">← Administrator home</a>
      <div className="mt-6 max-w-4xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F6B545]">Notification operations</p>
        <h1 className="mt-3 text-4xl font-black sm:text-5xl">Failed delivery recovery</h1>
        <p className="mt-4 max-w-3xl leading-7 text-slate-300">Inspect bounded FAILED or DEAD_LETTER requests and return one audited request to PENDING without calling an external provider in the administrator transaction.</p>
      </div>
      <div className="mt-9"><AdminNotificationRecovery /></div>
    </div>
  </main>;
}
