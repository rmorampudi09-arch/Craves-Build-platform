import { SubscriptionRazorpayPayment } from "@/components/subscription-razorpay-payment";
import { isUuid } from "@/lib/server-api";
import { MealPlanPage } from "../../meal-plan-page";

export const metadata = {
  title: "Pay for your meal plan | Craves",
  robots: { index: false, follow: false },
};

export default async function SubscriptionPaymentPage({
  params,
}: {
  params: Promise<{ subscriptionId: string }>;
}) {
  const { subscriptionId } = await params;

  return (
    <MealPlanPage
      title="Pay for your meal plan"
      intro="You’ll pay securely with Razorpay. Your plan starts as soon as we confirm the payment."
      back="/subscriptions"
      backLabel="Back to your meal plans"
    >
      {isUuid(subscriptionId) ? (
        <SubscriptionRazorpayPayment subscriptionId={subscriptionId} />
      ) : (
        <p className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">
          We couldn’t find this meal plan.
        </p>
      )}
    </MealPlanPage>
  );
}
