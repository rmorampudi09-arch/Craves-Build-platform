"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarX2, ChevronRight, Clock3, History, Pause, Play } from "lucide-react";
import {
  indiaBusinessDate,
  parsePublicSubscriptionPlans,
  type CustomerSubscription,
} from "@/features/meal-plans/lib/subscription-contract";
import type { SubscriptionOccurrence, SubscriptionPlanPolicy } from "@/features/meal-plans/lib/subscription-lifecycle-contract";
import {
  isPastSubscription,
  MEAL_PLAN_STATUS,
  nextMealLine,
  pauseDaysLine,
  pauseInfo,
  planActions,
  planDay,
  resumeDateFor,
  type PlanAction,
} from "@/features/meal-plans/lib/meal-plan-copy";
import { billingPeriodLabel } from "@/features/meal-plans/lib/meal-plan-schedule";
import { SubscriptionPlanBrowser } from "@/features/meal-plans/components/subscription-plan-browser";
import { PlanPhoto } from "@/features/meal-plans/components/plan-photo";
import { getPlanCover } from "@/features/meal-plans/api/plan-cover";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { EmptyState } from "@/shared/ui/feedback/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/navigation/tabs";

const LOAD_FAILED = "Check your connection and try again.";
const rowLink =
  "flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30";
const tabClass =
  "min-h-12 flex-1 rounded-none border-b-2 border-transparent text-base font-bold text-[#6B6B6B] data-[state=active]:border-[#F62E18] data-[state=active]:text-[#1A1A1A] data-[state=active]:shadow-none";

type Tab = "mine" | "explore";

const ACTIONS: Record<PlanAction, { label: string; icon: typeof Pause }> = {
  pause: { label: "Pause", icon: Pause },
  resume: { label: "Resume", icon: Play },
  skip: { label: "Skip a meal", icon: CalendarX2 },
};
const cardAction =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 text-sm font-bold text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]";

/**
 * A running plan's next meal and its quick actions, from the same reads as the plan page: the meals,
 * the plan's schedule (cached with its cover) and its rules. Any failure only leaves them out.
 */
function useRunningPlan(item: CustomerSubscription): { nextMeal: string | null; actions: PlanAction[] } | null {
  const [running, setRunning] = useState<{ nextMeal: string | null; actions: PlanAction[] } | null>(null);
  const live = item.status === "ACTIVE" || item.status === "PAUSED";
  useEffect(() => {
    if (!live) return;
    let active = true;
    void Promise.all([
      getPlanCover(item.planId).catch(() => null),
      fetch(`/api/subscriptions/plans/${item.planId}/policy`, { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<SubscriptionPlanPolicy>) : null))
        .catch(() => null),
      sessionFetch(`/api/subscriptions/${item.id}/occurrences?limit=100`, { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<SubscriptionOccurrence[]>) : []))
        .catch(() => []),
    ]).then(([cover, policy, occurrences]) => {
      if (!active) return;
      const items = cover?.schedule?.items ?? [];
      const now = new Date();
      const resumeDate = resumeDateFor(now, policy?.resumeLeadMinutes ?? 0, items.map((entry) => entry.serviceTime).sort()[0] ?? null);
      setRunning({
        nextMeal: nextMealLine(occurrences, new Map(items.map((entry) => [entry.menuItemId, entry.itemName ?? "Meal item"])), now),
        actions: planActions(item, policy, resumeDate, indiaBusinessDate(now)),
      });
    });
    return () => {
      active = false;
    };
  }, [item, live]);
  return live ? running : null;
}

/** One plan on My plans, like the app's card: the plan, its next meal, then Pause, Resume, Skip a meal and Open plan. */
function MyPlanCard({
  item,
  name,
  photo,
  today,
}: {
  item: CustomerSubscription;
  name: string;
  photo: string | null;
  today: string;
}) {
  const running = useRunningPlan(item);
  const paymentRequired = item.status === "PENDING_PAYMENT" || item.status === "PAYMENT_FAILED";
  const restart = pauseInfo(item, today, today).restartNote;
  const when =
    item.status === "ACTIVE" && item.nextBillingDate
      ? `Renews ${planDay(item.nextBillingDate)}`
      : (restart ?? `Starts ${planDay(item.startDate)}`);
  const pauseLine = pauseDaysLine(item);
  return (
    <li className="rounded-2xl border border-[#E5E7EB] bg-white p-4 sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <PlanPhoto src={photo} className="h-[72px] w-[72px]" />
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-[#F1F3F5] px-2.5 py-1 text-xs font-bold text-[#1A1A1A]">
            {MEAL_PLAN_STATUS[item.status]}
          </span>
          <h2 className="mt-2 text-lg font-bold">{name}</h2>
          <p className="mt-1 text-sm text-[#6B6B6B]">
            {[
              item.billingPeriod ? billingPeriodLabel(item.billingPeriod) : null,
              when,
              // The Next meal row below says it better, with the time and the dishes, once the meals have loaded.
              item.nextServiceDate && !restart && !running?.nextMeal ? `Next meal ${planDay(item.nextServiceDate)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {pauseLine ? <p className="mt-1 text-sm text-[#6B6B6B]">{pauseLine}</p> : null}
        </div>
      </div>

      {running?.nextMeal ? (
        <div className="mt-4 flex items-center gap-3 border-t border-[#E5E7EB] pt-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDEAE8] text-[#D92714]">
            <Clock3 className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="min-w-0">
            <span className="block text-xs font-bold text-[#6B6B6B]">Next meal</span>
            <span className="block font-semibold text-[#1A1A1A]">{running.nextMeal}</span>
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E5E7EB] pt-4">
        {paymentRequired ? (
          <Link href={`/subscriptions/${item.id}/payment`} className="craves-primary-action">
            {item.status === "PAYMENT_FAILED" ? "Try payment again" : "Pay now"}
          </Link>
        ) : null}
        {/* Each opens the plan page with that step's confirm already open, so its rules and cut-offs still apply. */}
        {running?.actions.map((action) => {
          const { label, icon: Icon } = ACTIONS[action];
          return (
            <Link key={action} href={`/subscriptions/${item.id}?action=${action}`} className={cardAction}>
              <Icon className="h-4 w-4 text-[#D92714]" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
        <Link href={`/subscriptions/${item.id}`} className={cardAction} aria-label={`Open plan: ${name}`}>
          Open plan
          <ChevronRight className="h-4 w-4 text-[#D92714]" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

export function SubscriptionManager() {
  const [items, setItems] = useState<CustomerSubscription[] | null>(null);
  const [error, setError] = useState("");
  const [planNames, setPlanNames] = useState<Map<string, string>>(() => new Map());
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const [dishPhotos, setDishPhotos] = useState<Map<string, string | null>>(() => new Map());

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await sessionFetch("/api/subscriptions", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(response.status === 401 ? "Your session expired. Sign in again." : LOAD_FAILED);
        return;
      }
      setItems(body as CustomerSubscription[]);
    } catch {
      // Never the browser's own words ("Failed to fetch").
      setError(LOAD_FAILED);
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

  // Like Explore, a plan without its own photo shows its first dish.
  useEffect(() => {
    let active = true;
    for (const item of items ?? []) {
      if (item.planImageUrl || isPastSubscription(item.status)) continue;
      void getPlanCover(item.planId).then(
        (cover) => {
          if (active)
            setDishPhotos((current) => new Map(current).set(item.planId, cover.dishImageUrl));
        },
        () => undefined,
      );
    }
    return () => {
      active = false;
    };
  }, [items]);

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
            <EmptyState illustration="loadError" title="We couldn’t load your meal plans" message={error} role="alert" compact>
              <button type="button" onClick={() => void load()} className="craves-primary-action">
                Try again
              </button>
            </EmptyState>
          ) : current.length === 0 ? (
            <EmptyState
              illustration="mealPlans"
              title="No meal plans yet"
              message="Get home food every day from a chef near you. Pick a weekly, 14-day or monthly plan."
              compact
            >
              <button type="button" onClick={() => setTab("explore")} className="craves-primary-action">
                Explore plans
              </button>
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {current.map((item) => (
                <MyPlanCard
                  key={item.id}
                  item={item}
                  name={planNames.get(item.planId) ?? item.planName ?? "Meal plan"}
                  photo={item.planImageUrl ?? dishPhotos.get(item.planId) ?? null}
                  today={today}
                />
              ))}
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
