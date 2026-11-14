import { FleetSetup, type SetupSection } from "@/features/admin/fleet/components/fleet-setup";

export const metadata = { title: "Riders: live, practice, rain, trial and pay rates | Craves Admin", robots: { index: false, follow: false } };

export default async function AdminFleetSetupPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  const shown: SetupSection = section === "trial" || section === "rates" ? section : "dispatch";
  return <FleetSetup key={shown} section={shown} />;
}
