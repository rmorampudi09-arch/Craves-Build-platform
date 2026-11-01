import { MealPlanHistory } from "@/features/meal-plans/components/meal-plan-history";
import { MealPlanPage } from "../meal-plan-page";

export const metadata = { title: "Meal plan history | Craves", robots: { index: false, follow: false } };

export default function MealPlanHistoryPage() {
  return (
    <MealPlanPage title="History" intro="Ended and cancelled meal plans." back="/subscriptions" backLabel="Back to your meal plans">
      <MealPlanHistory />
    </MealPlanPage>
  );
}
