"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock3, History } from "lucide-react";
import {
  indiaBusinessDate,
  parsePublicSubscriptionPlans,
  type CustomerSubscription,
} from "@/features/meal-plans/lib/subscription-contract";
import {
  isPastSubscription,
  MEAL_PLAN_STATUS,
  pauseDaysLine,
  pauseInfo,
  planDay,
} from "@/features/meal-plans/lib/meal-plan-copy";
import { billingPeriodLabel } from "@/features/meal-plans/lib/meal-plan-schedule";
import { SubscriptionPlanBrowser } from "@/features/meal-plans/components/subscription-plan-browser";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/navigation/tabs";

const LOAD_FAILED = "We couldn’t load your meal plans. Please try again.";
const secondaryLink =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-[#F1F3F5] px-5 text-sm font-bold text-[#1A1A1A]";
const rowLink =
  "flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30";
const tabClass =
  "min-h-12 flex-1 rounded-none border-b-2 border-transparent text-base font-bold text-[#6B6B6B] data-[state=active]:border-[#F62E18] data-[state=active]:text-[#1A1A1A] data-[state=active]:shadow-none";

type Tab = "mine" | "explore";

export function SubscriptionManager() {
  const [items, setItems] = useState<CustomerSubscription[] | null>(null);
  const [error, setError] = useState("");
  const [planNames, setPlanNames] = useState<Map<string, string>>(() => new Map());
  const [chosenTab, setTab] = useState<Tab | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await sessionFetch("/api/subscriptions", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (response.status === 401) throw new Error("Your session expired. Sign in again.");
      if (!response.ok) throw new Error(LOAD_FAILED);
      setItems(body as CustomerSubscription[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : LOAD_FAILED);
    }
  }, []);

  // The plan list gives the name; the subscription's own planName covers plans no longer listed.
  useEffect(() => {
    void fetch("/api/subscriptions/plans", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        const plans = parsePublicSubscriptionPlans(body);
        if (plans) setPlanNames(new Map(plans.map((plan) => [plan.id, plan.name])));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (items === null && !error)
    return <CustomerSectionSkeleton variant="plans" label="Loading your meal plans" />;

  const current = (items ?? []).filter((item) => !isPastSubscription(item.status));
  const pastCount = (items?.length ?? 0) - current.length;
  // Until the customer picks a tab: My plans when a plan is running, else Explore.
  const tab =
    chosenTab ??
    (current.some((item) => item.status === "ACTIVE" || item.status === "PAUSED")
      ? "mine"
      : "explore");
  const today = indiaBusinessDate();

  return (
    <section>
      <Link href="/subscriptions/how-it-works" className={`${rowLink} mb-4 bg-[#F1F3F5]`}>
        <Clock3 className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">How meal plans work</span>
          <span className="block text-sm text-[#6B6B6B]">Pause, skip, cancel and chef timings</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" />
      </Link>

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList
          aria-label="Meal plan sections"
          className="h-auto w-full rounded-none border-b border-[#E5E7EB] bg-transparent p-0"
        >
          <TabsTrigger value="mine" className={tabClass}>
            My plans
          </TabsTrigger>
          <TabsTrigger value="explore" className={tabClass}>
            Explore plans
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-5">
          {error ? (
            <div role="alert" className="rounded-2xl bg-[#F1F3F5] p-5">
              <p className="text-sm font-medium text-[#C4200F]">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 min-h-11 rounded-full !border-0 !bg-white px-5 text-sm font-bold !text-[#1A1A1A] !shadow-none"
              >
                Try again
              </button>
            </div>
          ) : current.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E5E7EB] p-8 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-[#1A1A1A]" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-bold">No meal plans yet</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#6B6B6B]">
                Pick a weekly, 14-day or monthly plan from a home chef near you.
              </p>
              <button
                type="button"
                onClick={() => setTab("explore")}
                className="craves-primary-action mt-4"
              >
                Explore plans
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {current.map((item) => {
                const paymentRequired =
                  item.status === "PENDING_PAYMENT" || item.status === "PAYMENT_FAILED";
                const restart = pauseInfo(item, today, today).restartNote;
                const when =
                  item.status === "ACTIVE" && item.nextBillingDate
                    ? `Renews ${planDay(item.nextBillingDate)}`
                    : (restart ?? `Starts ${planDay(item.startDate)}`);
                const pauseLine = pauseDaysLine(item);
                return (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-[#E5E7EB] bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span className="inline-flex rounded-full bg-[#F1F3F5] px-2.5 py-1 text-xs font-bold text-[#1A1A1A]">
                          {MEAL_PLAN_STATUS[item.status]}
                        </span>
                        <h2 className="mt-2 text-lg font-bold">
                          {planNames.get(item.planId) ?? item.planName ?? "Meal plan"}
                        </h2>
                        <p className="mt-1 text-sm text-[#6B6B6B]">
                          {[
                            item.billingPeriod ? billingPeriodLabel(item.billingPeriod) : null,
                            when,
                            item.nextServiceDate && !restart
                              ? `Next meal ${planDay(item.nextServiceDate)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {pauseLine ? (
                          <p className="mt-1 text-sm text-[#6B6B6B]">{pauseLine}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {paymentRequired ? (
                          <Link
                            href={`/subscriptions/${item.id}/payment`}
                            className="craves-primary-action"
                          >
                            {item.status === "PAYMENT_FAILED" ? "Try payment again" : "Pay now"}
                          </Link>
                        ) : null}
                        <Link href={`/subscriptions/${item.id}`} className={secondaryLink}>
                          Manage
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {pastCount > 0 ? (
            <Link
              href="/subscriptions/history"
              className={`${rowLink} mt-4 border border-[#E5E7EB] bg-white`}
            >
              <History className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">History</span>
                <span className="block text-sm text-[#6B6B6B]">
                  Ended and cancelled plans · {pastCount}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
            </Link>
          ) : null}
        </TabsContent>

        <TabsContent value="explore" className="mt-5">
          <SubscriptionPlanBrowser />
        </TabsContent>
      </Tabs>
    </section>
  );
}
