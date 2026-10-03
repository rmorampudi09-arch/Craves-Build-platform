import { ChefModeDashboard } from "@/components/chef-mode-dashboard";

export const metadata = {
  title: "Chef mode | Craves",
  robots: { index: false, follow: false },
};

export default function ChefModePage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <ChefModeDashboard />
    </main>
  );
}
