import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";
import { DeletionRequestDetail } from "@/features/admin/account-deletions/components/deletion-request-detail";
import { isUuid } from "@/shared/lib/server-api";

export const metadata = { title: "Deletion request | Craves Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminAccountDeletionPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="People & kitchens" title="Deletion request" description="What is still open for this person and where the deletion has got to. Approve or reject only after reading the open items.">
      <Link href="/admin/account-deletions" className="inline-flex items-center gap-2 rounded-xl border border-[#d9cfdf] px-4 py-2.5 text-sm font-bold text-[#5d4e69]"><ArrowLeft size={16} />All requests</Link>
    </AdminPageIntro>
    {isUuid(requestId) ? <DeletionRequestDetail requestId={requestId} /> : <section className="rounded-[28px] bg-white p-6 text-slate-950">Invalid request ID.</section>}
  </div>;
}
