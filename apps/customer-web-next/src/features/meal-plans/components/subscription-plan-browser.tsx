"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChefHat, Search, Star } from "lucide-react";
import { getAddress, getSession, loadSelectedAddress, recoverSessionSnapshotForNavigation } from "@/features/auth/api/cravesAuth";
import { getPlanCover, type PlanCover } from "@/features/meal-plans/api/plan-cover";
import {
  parsePublicSubscriptionPlans,
  type PublicSubscriptionPlan,
} from "@/features/meal-plans/lib/subscription-contract";
import {
  billingPeriodLabel,
  billingUnit,
  mealsAndDays,
  type BillingUnit,
  type MealPlanFoodType,
} from "@/features/meal-plans/lib/meal-plan-schedule";
import { formatMoney } from "@/features/meal-plans/lib/meal-plan-copy";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { ProgressiveImage } from "@/shared/components/media/ProgressiveImage";

const LOAD_FAILED = "We couldn’t load meal plans. Please try again shortly.";
type Filter = "all" | BillingUnit;
const FILTERS: Array<{ key: Filter; label: string; empty: string }> = [
  { key: "all", label: "All", empty: "No meal plans near you yet" },
  { key: "week", label: "Weekly", empty: "No weekly meal plans near you yet" },
  { key: "14 days", label: "14 days", empty: "No 14-day meal plans near you yet" },
  { key: "28 days", label: "Monthly", empty: "No monthly meal plans near you yet" },
];
/**
 * The app's plan categories, matched on words in the plan's code, name and description as the app does
 * (CustomerMealPlansScreen). Veg goes by the dishes' own veg marks instead: the app's words also match "non-veg".
 * The app's "Custom" chip isn't live there either, so it is left out.
 */
type Category = "all" | "weight-loss" | "high-protein" | "veg" | "balanced";
const CATEGORIES: Array<{ key: Category; label: string; words: RegExp | null }> = [
  { key: "all", label: "All plans", words: null },
  { key: "weight-loss", label: "Weight loss", words: /(weight|light|calorie|lean)/ },
  { key: "high-protein", label: "High protein", words: /(protein|fitness|muscle)/ },
  { key: "veg", label: "Veg", words: null },
  { key: "balanced", label: "Balanced", words: /(balanced|daily|complete|regular)/ },
];

export function planInCategory(
  plan: Pick<PublicSubscriptionPlan, "planCode" | "name" | "description">,
  category: Category,
  foodType: MealPlanFoodType | null | undefined,
): boolean {
  if (category === "veg") return foodType === "VEG";
  const words = CATEGORIES.find((option) => option.key === category)?.words;
  return !words || words.test(`${plan.planCode} ${plan.name} ${plan.description ?? ""}`.toLowerCase());
}

const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-5 text-sm font-bold ${on ? "border-[#1A1A1A] bg-[#1A1A1A] text-white" : "border-[#E5E7EB] bg-white text-[#1A1A1A]"}`;

const FOOD_TYPE: Record<MealPlanFoodType, { label: string; dot: string }> = {
  VEG: { label: "Veg", dot: "bg-[#2E7D32]" },
  EGG: { label: "Egg", dot: "bg-[#D99A00]" },
  NON_VEG: { label: "Non-veg", dot: "bg-[#D92D20]" },
};

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
              <strong className="text-xl">{formatMoney(plan.amount, plan.currency)}</strong>
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
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<Category>("all");
  const [nearby, setNearby] = useState(true);

  const load = useCallback(async () => {
    setPlans(null);
    setFailed(false);
    setMessage("");
    // A fresh page load reads this before the session is back: the tab's snapshot brings it back first,
    // and a signed-in customer's saved address is read when none is chosen yet.
    const signedIn = Boolean(getSession() ?? recoverSessionSnapshotForNavigation());
    const address = getAddress() ?? (signedIn ? await loadSelectedAddress().catch(() => null) : null);
    const near = typeof address?.lat === "number" && typeof address.lng === "number" ? `?latitude=${address.lat}&longitude=${address.lng}` : "";
    setNearby(Boolean(near));
    try {
      // With an address only chefs within 10 km of it are listed; without one, every plan, as the app lists them.
      const response = await fetch(`/api/subscriptions/plans${near}`, { cache: "no-store" });
      const items = response.ok
        ? parsePublicSubscriptionPlans(await response.json().catch(() => null))
        : null;
      if (!items) throw new Error(LOAD_FAILED);
      setPlans(items);
      setMessage(items.length === 0 ? FILTERS[0].empty : "");
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
  const ofLength = (plans ?? []).filter(
    (plan) =>
      (filter === "all" || billingUnit(plan.billingPeriod) === filter) &&
      planInCategory(plan, category, covers.get(plan.id)?.summary?.foodType),
  );
  const visible = ofLength.filter(
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
          {!nearby ? (
            <p className="mb-5 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#1A1A1A]" role="status">
              Showing plans from every kitchen. Chefs deliver meal plans within 10 km.{" "}
              <Link href="/addresses" className="font-bold underline underline-offset-2">
                Set your delivery address
              </Link>{" "}
              to see the ones near you.
            </p>
          ) : null}
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Plan type">
            {CATEGORIES.map((option) => (
              <button key={option.key} type="button" aria-pressed={category === option.key} onClick={() => setCategory(option.key)} className={chip(category === option.key)}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Bill length">
            {FILTERS.map((option) => (
              <button key={option.key} type="button" aria-pressed={filter === option.key} onClick={() => setFilter(option.key)} className={chip(filter === option.key)}>
                {option.label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]" role="status">
              {ofLength.length > 0
                ? `No plans match “${search.trim()}”.`
                : category !== "all"
                  ? "No plans of this type near you yet. Try All plans."
                  : FILTERS.find((option) => option.key === filter)?.empty}
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
