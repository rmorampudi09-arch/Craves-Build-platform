import { ChefModeDashboard } from "@/features/chef/components/chef-mode-dashboard";
import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Chef mode | Craves",
  robots: { index: false, follow: false },
};

export default function ChefModePage() {
  return (
    <main className="chef-page">
      <ChefAccessBoundary><ChefModeDashboard /></ChefAccessBoundary>
    </main>
  );
}
