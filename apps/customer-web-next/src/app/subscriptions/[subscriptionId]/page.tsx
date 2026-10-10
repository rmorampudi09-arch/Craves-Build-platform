import { SubscriptionDetails } from "@/components/subscription-details";
import { isUuid } from "@/lib/server-api";
import { MealPlanPage } from "../meal-plan-page";

export const metadata = { title: "Your meal plan | Craves", robots: { index: false, follow: false } };

export default async function SubscriptionDetailsPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  return (
    <MealPlanPage title="Your meal plan" back="/subscriptions" backLabel="Back to your meal plans">
      {isUuid(subscriptionId) ? (
        <SubscriptionDetails subscriptionId={subscriptionId} />
      ) : (
        <p className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">
          We couldn’t find this meal plan.
        </p>
      )}
    </MealPlanPage>
  );
}
