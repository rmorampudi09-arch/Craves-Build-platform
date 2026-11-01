import { FleetSlots } from "@/features/admin/fleet/components/fleet-slots";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Rider slots | Craves Admin", robots: { index: false, follow: false } };

export default function AdminFleetSlotsPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Riders & fleet" title="Slots and zone banner" description="Book a rider into a zone for a time window with a guaranteed hourly minimum, and set the banner every rider sees on Home." />
    <FleetSlots />
  </div>;
}
