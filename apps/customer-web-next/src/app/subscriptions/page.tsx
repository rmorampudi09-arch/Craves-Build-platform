import { ContextualBackBoundary } from "@/shared/components/navigation/ContextualBackBoundary";
import { SubscriptionManager } from "@/features/meal-plans/components/subscription-manager";
import { MealPlanPage } from "./meal-plan-page";

export const metadata = {
  title: "Your meal plans | Craves",
  robots: { index: false, follow: false },
};

export default function SubscriptionsPage() {
  return (
    <ContextualBackBoundary destination="/subscriptions" fallback="/home">
      <MealPlanPage
        title="Your meal plans"
        intro="Home-cooked meals on a schedule. Find a plan near you, then skip a day, pause or cancel here."
        back="/home"
        backLabel="Back to home"
      >
        <SubscriptionManager />
      </MealPlanPage>
    </ContextualBackBoundary>
  );
}
