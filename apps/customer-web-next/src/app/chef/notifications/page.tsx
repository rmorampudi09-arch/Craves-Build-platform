import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHead } from "@/features/chef/components/chef-ui";
import ChefNotifications from "@/features/notifications/screens/ChefNotifications";

export const metadata = {
  title: "Notifications | Craves Chef",
  robots: { index: false, follow: false },
};

export default function ChefNotificationsPage() {
  return (
    <div className="chef-page is-narrow">
      <ChefAccessBoundary>
        <ChefPageHead title="Notifications" back={{ href: "/chef", label: "Home" }} />
        <ChefNotifications />
      </ChefAccessBoundary>
    </div>
  );
}
