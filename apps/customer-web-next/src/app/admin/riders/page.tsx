import { RidersList } from "@/features/admin/fleet/components/riders-list";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Riders | Craves Admin", robots: { index: false, follow: false } };

export default function AdminRidersPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Riders & fleet" title="Riders" description="Review each application once and approve it, or send the rider what to fix, in one step. Every later status change keeps due process: a reason, the evidence and the approver recorded." />
    <RidersList />
  </div>;
}
