import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RiderDetailView } from "@/features/admin/fleet/components/rider-detail";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";
import { UUID } from "@/features/admin/fleet/lib/fleet-common";

export const metadata = { title: "Rider | Craves Admin", robots: { index: false, follow: false } };

export default async function AdminRiderPage({ params }: { params: Promise<{ riderId: string }> }) {
  const { riderId } = await params;
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Riders & fleet" title="Rider" description="Documents, phones, payout account, status changes and every admin action on this rider.">
      <Link href="/admin/riders" className="cr-button"><ArrowLeft size={16} aria-hidden="true" />Riders</Link>
    </AdminPageIntro>
    {UUID.test(riderId) ? <RiderDetailView riderId={riderId} /> : <p className="cr-panel">This rider link is not valid.</p>}
  </div>;
}
