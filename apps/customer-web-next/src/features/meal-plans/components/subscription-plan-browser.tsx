"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAddress } from "@/features/auth/api/cravesAuth";
import type { PublicSubscriptionPlan } from "@/features/meal-plans/lib/subscription-contract";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function SubscriptionPlanBrowser() {
  const [plans, setPlans] = useState<PublicSubscriptionPlan[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const address = getAddress();
    if (typeof address?.lat !== "number" || typeof address.lng !== "number") {
      setMessage("Choose a delivery address to see meal plans from chefs near you.");
      setLoading(false);
      return;
    }
    // Only chefs within 10 km of this address are listed.
    fetch(`/api/subscriptions/plans?latitude=${address.lat}&longitude=${address.lng}`, { cache: "no-store" })
      .then(async response => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) throw new Error("We couldn’t load meal plans. Please try again shortly.");
        const items = body as PublicSubscriptionPlan[];
        setPlans(items);
        setMessage(items.length === 0 ? "No meal plans are available near you yet." : "");
      })
      .catch(error => active && setMessage(error instanceof Error ? error.message : "We couldn’t load meal plans. Please try again shortly."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return <section>
    {loading ? <CustomerSectionSkeleton variant="plans" label="Loading meal plans" /> : null}
    {message && <p className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]" role="status">{message}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {plans.map(plan => <article key={plan.id} className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6B6B6B]">{plan.billingPeriod === "WEEKLY" ? "Weekly" : "Monthly"}</p>
        <h2 className="mt-2 text-xl font-bold text-[#1A1A1A]">{plan.name}</h2>
        <p className="mt-2 flex-1 text-sm leading-6 text-[#6B6B6B]">{plan.description ?? "Home-cooked meals from a local chef."}</p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[#1A1A1A]">
            <strong className="text-xl">{money(plan.amount, plan.currency)}</strong>
            <span className="text-sm text-[#6B6B6B]"> / {plan.billingPeriod === "WEEKLY" ? "week" : "month"}</span>
          </p>
          <Link href={`/subscriptions/new?planId=${encodeURIComponent(plan.id)}`} className="craves-primary-action">
            Choose plan
          </Link>
        </div>
      </article>)}
    </div>
  </section>;
}
