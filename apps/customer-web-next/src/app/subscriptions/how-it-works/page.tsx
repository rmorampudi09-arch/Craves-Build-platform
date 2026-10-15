import { MealPlanHowItWorks } from "@/features/meal-plans/components/meal-plan-how-it-works";
import { MealPlanPage } from "../meal-plan-page";

export const metadata = {
  title: "How meal plans work | Craves",
  description: "Pause, skip, cancel, chef timings and billing for Craves homemade meal plans.",
  robots: { index: true, follow: true },
};

export default function MealPlanHowItWorksPage() {
  return (
    <MealPlanPage title="How meal plans work" back="/subscriptions" backLabel="Back to your meal plans">
      <MealPlanHowItWorks />
    </MealPlanPage>
  );
}
