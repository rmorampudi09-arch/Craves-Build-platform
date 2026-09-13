import Link from "next/link";
import { AdminDashboard } from "@/components/admin-dashboard";

export default function AdminPage() {
  return <><Link href="/admin/finance" className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-slate-900"><span><strong className="block">Finance control center</strong><span className="mt-1 block text-sm text-slate-600">Policy versions, taxes, payout schedules, chef holds and subscription price previews</span></span><span aria-hidden="true">→</span></Link><AdminDashboard /></>;
}
