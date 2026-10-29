import { FleetHealth } from "@/features/admin/fleet/components/fleet-health";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Rider pilot health | Craves Admin", robots: { index: false, follow: false } };

export default function AdminFleetHealthPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Riders & fleet" title="Pilot health" description="The rider pilot's checks, run read-only on the fleet database each time this page loads: how fast offers ring, phones that go silent, battery use, and the triggers for work that waits for pilot data. Each table says what to look for." />
    <FleetHealth />
  </div>;
}
