import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefPreferences } from "@/features/chef/components/chef-preferences";

export const metadata = {
  title: "Preferences | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefPreferencesPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Preferences" back={{ href: "/chef/profile", label: "More" }} />
        <ChefPreferences />
      </ChefAccessBoundary>
    </main>
  );
}
