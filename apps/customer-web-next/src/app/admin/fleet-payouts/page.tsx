import { FleetPayouts } from "@/features/admin/fleet/components/fleet-payouts";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Rider payouts | Craves Admin", robots: { index: false, follow: false } };

export default function AdminFleetPayoutsPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Riders & fleet" title="Rider payouts" description="Payouts are manual: create the IMPS file, a second payments admin approves it, upload it to the bank, then record each UTR. A failed payout keeps the money in the rider's balance." />
    <FleetPayouts />
  </div>;
}
