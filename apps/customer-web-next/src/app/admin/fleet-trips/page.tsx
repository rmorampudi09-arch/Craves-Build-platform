import { FleetTrips } from "@/features/admin/fleet/components/fleet-trips";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Fleet trips | Craves Admin", robots: { index: false, follow: false } };

export default function AdminFleetTripsPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Riders & fleet" title="Trips and dispatch" description="Orders go to a Craves rider first, then Borzo, then Pidge, then this queue. A reassign releases the current courier first, so every trip has exactly one." />
    <FleetTrips />
  </div>;
}
