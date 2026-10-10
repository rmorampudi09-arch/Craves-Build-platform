"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { CustomerSubscription } from "@/lib/subscription-contract";
import { MEAL_PLAN_STATUS, planDay } from "@/lib/meal-plan-copy";

const secondaryLink =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-[#F1F3F5] px-5 text-sm font-bold text-[#1A1A1A]";

export function SubscriptionManager() {
  const [items, setItems] = useState<CustomerSubscription[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/subscriptions", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.status === 401) throw new Error("Your session expired. Sign in again.");
    if (!response.ok) throw new Error("We couldn’t load your meal plans. Please try again.");
    setItems(body as CustomerSubscription[]);
  }, []);

  useEffect(() => {
    void load().catch(caught =>
      setError(caught instanceof Error ? caught.message : "We couldn’t load your meal plans. Please try again."),
    );
  }, [load]);

  const empty = items?.length === 0;

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/subscriptions/plans" className={empty ? "craves-primary-action" : secondaryLink}>
          Browse meal plans
        </Link>
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl bg-[#F1F3F5] p-5">
          <p className="text-sm font-medium text-[#C4200F]">{error}</p>
          <button
            type="button"
            onClick={() => void load().catch(caught => setError(caught instanceof Error ? caught.message : "We couldn’t load your meal plans. Please try again."))}
            className="mt-3 min-h-11 rounded-full !border-0 !bg-white px-5 text-sm font-bold !text-[#1A1A1A] !shadow-none"
          >
            Try again
          </button>
        </div>
      ) : items === null ? (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only" role="status">Loading your meal plans</span>
          {[0, 1].map(index => <div key={index} className="h-32 animate-pulse rounded-2xl bg-[#F1F3F5]" />)}
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-[#E5E7EB] p-8 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-[#1A1A1A]" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold">No meal plans yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#6B6B6B]">
            Pick a plan to get home-cooked meals delivered on a schedule.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(item => {
            const paymentRequired = item.status === "PENDING_PAYMENT" || item.status === "PAYMENT_FAILED";
            return (
              <li key={item.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-full bg-[#F1F3F5] px-2.5 py-1 text-xs font-bold text-[#1A1A1A]">
                      {MEAL_PLAN_STATUS[item.status]}
                    </span>
                    <h2 className="mt-2 text-lg font-bold">Meal plan</h2>
                    <p className="mt-1 text-sm text-[#6B6B6B]">
                      Starts {planDay(item.startDate)}
                      {item.nextServiceDate ? ` · Next meal ${planDay(item.nextServiceDate)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {paymentRequired ? (
                      <Link href={`/subscriptions/${item.id}/payment`} className="craves-primary-action">
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
    </section>
  );
}
