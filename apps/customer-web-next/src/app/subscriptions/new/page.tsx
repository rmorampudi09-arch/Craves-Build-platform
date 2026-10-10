import Link from "next/link";
import { SubscriptionEnrollmentForm } from "@/components/subscription-enrollment-form";
import { isUuid } from "@/lib/server-api";
import { MealPlanPage } from "../meal-plan-page";

export const metadata = { title: "Start a meal plan | Craves", robots: { index: false, follow: false } };

export default async function NewSubscriptionPage({ searchParams }: { searchParams: Promise<{ planId?: string }> }) {
  const { planId } = await searchParams;
  return (
    <MealPlanPage
      title="Start your meal plan"
      intro="Choose where to deliver and when to start. You’ll pay on the next step."
      back="/subscriptions/plans"
      backLabel="Back to meal plans"
    >
      {planId && isUuid(planId) ? (
        <SubscriptionEnrollmentForm planId={planId} />
      ) : (
        <p className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">
          Choose a meal plan first.{" "}
          <Link href="/subscriptions/plans" className="font-bold underline underline-offset-2">
            See meal plans
          </Link>
        </p>
      )}
    </MealPlanPage>
  );
}
