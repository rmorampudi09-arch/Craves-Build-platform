import { SubscriptionDetails } from "@/features/meal-plans/components/subscription-details";
import { isUuid } from "@/shared/lib/server-api";
import { MealPlanPage } from "../meal-plan-page";

export const metadata = { title: "Your meal plan | Craves", robots: { index: false, follow: false } };

export default async function SubscriptionDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ action?: string | string[] }>;
}) {
  const [{ subscriptionId }, { action }] = await Promise.all([params, searchParams]);
  // A My plans card's Pause, Resume or Skip a meal: the page opens that step's confirm.
  const openAction = action === "pause" || action === "resume" || action === "skip" ? action : undefined;
  return (
    <MealPlanPage title="Your meal plan" back="/subscriptions" backLabel="Back to your meal plans">
      {isUuid(subscriptionId) ? (
        <SubscriptionDetails subscriptionId={subscriptionId} openAction={openAction} />
      ) : (
        <p className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">
          We couldn’t find this meal plan.
        </p>
      )}
    </MealPlanPage>
  );
}
