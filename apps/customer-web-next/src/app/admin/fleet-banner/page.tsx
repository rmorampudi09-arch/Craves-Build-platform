import { FleetBanner } from "@/features/admin/fleet/components/fleet-banner";
import { AdminPageIntro } from "@/features/admin/shell/components/admin-page-intro";

export const metadata = { title: "Rider banner | Craves Admin", robots: { index: false, follow: false } };

export default function AdminFleetBannerPage() {
  return <div className="space-y-7">
    <AdminPageIntro eyebrow="Riders & fleet" title="Zone banner" description="Set the banner every rider sees on Home." />
    <FleetBanner />
  </div>;
}
