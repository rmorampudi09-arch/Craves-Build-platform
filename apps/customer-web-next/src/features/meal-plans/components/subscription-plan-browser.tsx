"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChefHat, Search, Star } from "lucide-react";
import { getAddress } from "@/features/auth/api/cravesAuth";
import { getPlanCover, type PlanCover } from "@/features/meal-plans/api/plan-cover";
import {
  parsePublicSubscriptionPlans,
  type PublicSubscriptionPlan,
} from "@/features/meal-plans/lib/subscription-contract";
import {
  billingPeriodLabel,
  billingUnit,
  mealsAndDays,
  type MealPlanFoodType,
} from "@/features/meal-plans/lib/meal-plan-schedule";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { ProgressiveImage } from "@/shared/components/media/ProgressiveImage";

const LOAD_FAILED = "We couldn’t load meal plans. Please try again shortly.";
const FOOD_TYPE: Record<MealPlanFoodType, { label: string; dot: string }> = {
  VEG: { label: "Veg", dot: "bg-[#2E7D32]" },
  EGG: { label: "Egg", dot: "bg-[#D99A00]" },
  NON_VEG: { label: "Non-veg", dot: "bg-[#D92D20]" },
};

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function PlanCard({ plan, cover }: { plan: PublicSubscriptionPlan; cover: PlanCover | undefined }) {
  const unit = billingUnit(plan.billingPeriod);
  const photo = plan.imageUrl ?? cover?.dishImageUrl ?? null;
  const food = cover?.summary?.foodType ? FOOD_TYPE[cover.summary.foodType] : null;
  const meta = [
    cover?.kitchenName ? `By ${cover.kitchenName}` : null,
    cover?.summary ? mealsAndDays(cover.summary, unit) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const rating = cover?.rating;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
      <div className="relative flex aspect-[16/9] items-center justify-center bg-[#F1F3F5]">
        {photo ? (
          <ProgressiveImage
            src={photo}
            alt=""
            fill
            sizes="(min-width: 1280px) 30vw, (min-width: 768px) 48vw, calc(100vw - 32px)"
            fallbackLabel="Plan photo unavailable"
            className="object-cover"
          />
        ) : (
          <ChefHat className="h-10 w-10 text-[#6B6B6B]" aria-hidden="true" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6B6B6B]">
          {billingPeriodLabel(plan.billingPeriod)}
        </p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-[#1A1A1A]">{plan.name}</h2>
          {food ? (
            <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#F1F3F5] px-2.5 py-1 text-xs font-bold text-[#1A1A1A]">
              <span className={`h-2 w-2 rounded-full ${food.dot}`} aria-hidden="true" />
              {food.label}
            </span>
          ) : null}
        </div>
        {meta ? <p className="mt-1 text-sm font-semibold text-[#6B6B6B]">{meta}</p> : null}
        <p className="mt-2 flex-1 text-sm leading-6 text-[#6B6B6B]">
          {plan.description ?? "Home-cooked meals from a local chef."}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[#1A1A1A]">
              <strong className="text-xl">{money(plan.amount, plan.currency)}</strong>
              <span className="text-sm text-[#6B6B6B]"> / {unit}</span>
            </p>
            {rating ? (
              <p
                className="mt-0.5 inline-flex items-center gap-1 text-sm font-bold text-[#1A1A1A]"
                aria-label={`Rated ${rating.average.toFixed(1)} from ${rating.count} reviews`}
              >
                <Star className="h-4 w-4 fill-[#D99A00] text-[#D99A00]" aria-hidden="true" />
                {rating.average.toFixed(1)}
                <span className="font-medium text-[#6B6B6B]">({rating.count})</span>
              </p>
            ) : null}
          </div>
          <Link
            href={`/subscriptions/new?planId=${encodeURIComponent(plan.id)}`}
            className="craves-primary-action"
            aria-label={`Choose plan: ${plan.name}`}
          >
            Choose plan
          </Link>
        </div>
      </div>
    </article>
  );
}

export function SubscriptionPlanBrowser() {
  const [plans, setPlans] = useState<PublicSubscriptionPlan[] | null>(null);
  const [covers, setCovers] = useState<ReadonlyMap<string, PlanCover>>(() => new Map());
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const address = getAddress();
    if (typeof address?.lat !== "number" || typeof address.lng !== "number") {
      setPlans([]);
      setMessage("Choose a delivery address to see meal plans from chefs near you.");
      return;
    }
    setPlans(null);
    setFailed(false);
    setMessage("");
    try {
      // Only chefs within 10 km of this address are listed.
      const response = await fetch(
        `/api/subscriptions/plans?latitude=${address.lat}&longitude=${address.lng}`,
        { cache: "no-store" },
      );
      const items = response.ok
        ? parsePublicSubscriptionPlans(await response.json().catch(() => null))
        : null;
      if (!items) throw new Error(LOAD_FAILED);
      setPlans(items);
      setMessage(items.length === 0 ? "No meal plans are available near you yet." : "");
    } catch {
      setPlans([]);
      setFailed(true);
      setMessage(LOAD_FAILED);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    for (const plan of plans ?? []) {
      void getPlanCover(plan.id).then(
        (cover) => {
          if (active) setCovers((current) => new Map(current).set(plan.id, cover));
        },
        () => undefined,
      );
    }
    return () => {
      active = false;
    };
  }, [plans]);

  const query = search.trim().toLowerCase();
  // Matches the plan name or the kitchen; a kitchen name still loading simply doesn't match yet.
  const visible = (plans ?? []).filter(
    (plan) =>
      !query ||
      `${plan.name}\n${covers.get(plan.id)?.kitchenName ?? ""}`.toLowerCase().includes(query),
  );

  return (
    <section>
      {plans === null ? (
        <CustomerSectionSkeleton variant="plans" label="Loading meal plans" />
      ) : null}
      {message ? (
        <div className="rounded-2xl bg-[#F1F3F5] p-5" role="status">
          <p className="text-sm text-[#1A1A1A]">{message}</p>
          {failed ? (
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 min-h-11 rounded-full !border-0 !bg-white px-5 text-sm font-bold !text-[#1A1A1A] !shadow-none"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {plans && plans.length > 0 ? (
        <>
          <label className="relative mb-5 block">
            <span className="sr-only">Search meal plans or chefs</span>
            <Search
              className="pointer-events-none absolute inset-y-0 left-4 my-auto h-5 w-5 text-[#6B6B6B]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search meal plans or chefs"
              className="min-h-12 w-full rounded-full border border-[#E5E7EB] bg-white pl-12 pr-4 text-base text-[#1A1A1A]"
            />
          </label>
          {visible.length === 0 ? (
            <p className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]" role="status">
              No plans match “{search.trim()}”.
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((plan) => (
              <PlanCard key={plan.id} plan={plan} cover={covers.get(plan.id)} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
