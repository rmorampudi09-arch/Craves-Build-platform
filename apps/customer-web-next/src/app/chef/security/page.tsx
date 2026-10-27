import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import { ChefSecurity } from "@/features/chef/components/chef-security";

export const metadata = {
  title: "Login & security | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefSecurityPage() {
  return (
    <main className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Login & security" back={{ href: "/chef/profile", label: "Profile" }} />
        <ChefSecurity />
      </ChefAccessBoundary>
    </main>
  );
}
