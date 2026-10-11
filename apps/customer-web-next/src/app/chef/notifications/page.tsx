import { ChefAccessBoundary } from "@/features/chef/components/chef-access-boundary";
import { ChefPageHead } from "@/features/chef/components/chef-ui";
import { ContextualBackBoundary } from "@/shared/components/navigation/ContextualBackBoundary";
import NotificationsPage from "@/features/notifications/screens/Notifications";

export const metadata = {
  title: "Notifications | Craves Chef",
  robots: { index: false, follow: false },
};

/** The shared notifications list inside Chef Mode, under the chef header and title. */
export default function ChefNotificationsPage() {
  return (
    <div className="chef-page is-narrow chef-notifications">
      <ChefAccessBoundary>
        <ChefPageHead title="Notifications" back={{ href: "/chef", label: "Home" }} />
        <ContextualBackBoundary destination="/chef/notifications" fallback="/chef">
          <NotificationsPage audience="chef" />
        </ContextualBackBoundary>
      </ChefAccessBoundary>
    </div>
  );
}
