import { ChefModeDashboard } from "@/components/chef-mode-dashboard";
import { ChefAccessBoundary } from "@/components/chef-access-boundary";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Chef mode | Craves",
  robots: { index: false, follow: false },
};

export default function ChefModePage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <ChefAccessBoundary><ChefModeDashboard /></ChefAccessBoundary>
    </main>
  );
}
