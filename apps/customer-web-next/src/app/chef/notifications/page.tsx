import { ChefAccessBoundary } from "@/components/chef-access-boundary";
import { ContextualBackBoundary } from "@/components/navigation/ContextualBackBoundary";
import NotificationsPage from "@/screens/Notifications/Notifications";

export const metadata = {
  title: "Chef notifications | Craves",
  robots: { index: false, follow: false },
};

/** The shared notifications screen inside Chef Mode; its back arrow returns to the chef home. */
export default function ChefNotificationsPage() {
  return (
    <div className="chef-notifications">
      <ChefAccessBoundary>
        <ContextualBackBoundary destination="/chef/notifications" fallback="/chef">
          <NotificationsPage />
        </ContextualBackBoundary>
      </ChefAccessBoundary>
    </div>
  );
}
