import { FleetSetup } from "@/features/admin/fleet/components/fleet-setup";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Rider pilot setup | Craves Admin", robots: { index: false, follow: false } };

export default function AdminFleetSetupPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Riders & fleet" title="Rider pilot setup" description="Publish the rider rate card, switch dispatch off, shadow or live, and choose the pilot riders and kitchens." />
    <FleetSetup />
  </div>;
}
