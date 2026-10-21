import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SelfieQueue } from "@/features/admin/fleet/components/selfie-queue";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Selfie review | Craves Admin", robots: { index: false, follow: false } };

export default function AdminRiderSelfiesPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Riders & fleet" title="Go-online selfies" description="Riders take a selfie each time they go online. Customers never see these photos.">
      <Link href="/admin/riders" className="cr-button"><ArrowLeft size={16} aria-hidden="true" />Riders</Link>
    </AdminPageIntro>
    <SelfieQueue />
  </div>;
}
