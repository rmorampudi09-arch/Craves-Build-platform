import { FleetSupport } from "@/features/admin/fleet/components/fleet-support";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Rider support | Craves Admin", robots: { index: false, follow: false } };

export default function AdminFleetSupportPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Riders & fleet" title="Rider support" description="SOS presses from the last 7 days and the problems riders report in the app. Support acknowledges each issue within 24 hours and fixes it within 72, and every step is audited." />
    <FleetSupport />
  </div>;
}
