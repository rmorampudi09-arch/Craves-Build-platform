"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import type { CustomerSubscription } from "@/features/meal-plans/lib/subscription-contract";
import {
  isPastSubscription,
  MEAL_PLAN_STATUS,
  planDay,
} from "@/features/meal-plans/lib/meal-plan-copy";
import { billingPeriodLabel } from "@/features/meal-plans/lib/meal-plan-schedule";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { sessionFetch } from "@/shared/lib/session-fetch";

type Filter = "all" | "EXPIRED" | "CANCELLED";

const LOAD_FAILED = "Your plans could not be loaded. Check your connection and try again.";
const FILTERS: Array<{ key: Filter; label: string; empty: string }> = [
  { key: "all", label: "All", empty: "No past plans yet" },
  { key: "EXPIRED", label: "Completed", empty: "No completed plans yet" },
  { key: "CANCELLED", label: "Cancelled", empty: "No cancelled plans yet" },
];

/** Ended and cancelled plans; each opens its plan page, which has no controls for them. */
export function MealPlanHistory() {
  const [items, setItems] = useState<CustomerSubscription[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await sessionFetch("/api/subscriptions", { cache: "no-store" });
      if (response.status === 401) throw new Error("Your session expired. Sign in again.");
      if (!response.ok) throw new Error(LOAD_FAILED);
      setItems((await response.json()) as CustomerSubscription[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : LOAD_FAILED);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const past = (items ?? [])
    .filter(
      (item) => isPastSubscription(item.status) && (filter === "all" || item.status === filter),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <section>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Show plans">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={filter === option.key}
            onClick={() => setFilter(option.key)}
            className={`min-h-11 rounded-full border px-5 text-sm font-bold ${filter === option.key ? "border-[#1A1A1A] bg-[#1A1A1A] text-white" : "border-[#E5E7EB] bg-white text-[#1A1A1A]"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
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
      ) : items === null ? (
        <CustomerSectionSkeleton variant="plans" label="Loading your past meal plans" />
      ) : past.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-[#E5E7EB] p-8 text-center"
          role="status"
        >
          <CalendarDays className="mx-auto h-8 w-8 text-[#1A1A1A]" aria-hidden="true" />
          <p className="mt-3 text-lg font-bold">
            {FILTERS.find((option) => option.key === filter)?.empty}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#E5E7EB] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          {past.map((item) => (
            <li key={item.id}>
              <Link
                href={`/subscriptions/${item.id}`}
                className="flex min-h-[72px] items-center gap-3 px-4 py-3 hover:bg-[#F1F3F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1A1A1A]/30"
              >
                <CalendarDays className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[#1A1A1A]">
                    {item.planName ?? "Meal plan"}
                  </span>
                  <span className="block text-sm text-[#6B6B6B]">
                    {[
                      item.billingPeriod ? billingPeriodLabel(item.billingPeriod) : null,
                      `Started ${planDay(item.startDate)}`,
                      item.endDate ? `Ended ${planDay(item.endDate)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-[#F1F3F5] px-2.5 py-1 text-xs font-bold text-[#1A1A1A]">
                  {MEAL_PLAN_STATUS[item.status]}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 text-sm text-[#6B6B6B]">
        Tap a plan to see its meals. To order from the same chef again, use{" "}
        <Link
          href="/subscriptions/plans"
          className="font-bold text-[#1A1A1A] underline underline-offset-2"
        >
          Explore plans
        </Link>
        .
      </p>
    </section>
  );
}
