import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";
import { AdminSupportCase } from "@/features/admin/support/components/admin-support-inbox";
import { isUuid } from "@/shared/lib/server-api";

export const metadata = { title: "Help request | Craves Admin", robots: { index: false, follow: false } };

export default async function AdminSupportCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Customer & chef support" title="Help request" description="Reply, add a private note only owners see, and change the status.">
      <Link href="/admin/support" className="inline-flex items-center gap-2 rounded-xl border border-[#d9cfdf] px-4 py-2.5 text-sm font-bold text-[#5d4e69]"><ArrowLeft size={16} aria-hidden="true" />All help requests</Link>
    </AdminPageIntro>
    {isUuid(caseId)
      ? <AdminSupportCase caseId={caseId} />
      : <section className="rounded-[28px] bg-white p-6 text-slate-950">Invalid support case ID.</section>}
  </div>;
}
