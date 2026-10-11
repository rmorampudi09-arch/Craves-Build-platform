import { SubscriptionPlanBrowser } from "@/features/meal-plans/components/subscription-plan-browser";
import { MealPlanPage } from "../meal-plan-page";

export const metadata = {
  title: "Meal plans | Craves",
  robots: { index: true, follow: true },
};

export default function SubscriptionPlansPage() {
  return (
    <MealPlanPage
      title="Meal plans"
      intro="Regular home-cooked meals from local chefs, billed weekly or monthly."
      back="/subscriptions"
      backLabel="Back to your meal plans"
    >
      <SubscriptionPlanBrowser />
    </MealPlanPage>
  );
}
