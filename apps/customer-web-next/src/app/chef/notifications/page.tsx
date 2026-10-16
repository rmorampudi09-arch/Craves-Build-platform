import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import ChefNotifications from "@/features/notifications/screens/ChefNotifications";

export const metadata = {
  title: "Notifications | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefNotificationsPage() {
  return (
    <div className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHeader title="Notifications" back={{ href: "/chef", label: "Home" }} />
        <ChefNotifications />
      </ChefAccessBoundary>
    </div>
  );
}
