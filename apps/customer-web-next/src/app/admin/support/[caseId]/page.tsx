import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminPageIntro } from "@/components/admin-page-intro";
import { AdminSupportCase } from "@/components/admin-support-inbox";
import { isUuid } from "@/lib/server-api";

export const metadata = { title: "Support case | Craves Admin", robots: { index: false, follow: false } };

export default async function AdminSupportCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Customer & chef support" title="Support case" description="Reply to the requester, add internal notes for the team and move the case through its status.">
      <Link href="/admin/support" className="inline-flex items-center gap-2 rounded-xl border border-[#d9cfdf] px-4 py-2.5 text-sm font-bold text-[#5d4e69]"><ArrowLeft size={16} />Support inbox</Link>
    </AdminPageIntro>
    {isUuid(caseId)
      ? <AdminSupportCase caseId={caseId} />
      : <section className="rounded-[28px] bg-white p-6 text-slate-950">Invalid support case ID.</section>}
  </div>;
}
