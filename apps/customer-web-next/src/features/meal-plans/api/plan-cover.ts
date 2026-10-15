"use client";

import { getKitchenProfile } from "@/shared/lib/kitchen-profile-client";
import {
  summarizeSchedule,
  type PlanScheduleSummary,
} from "@/features/meal-plans/lib/meal-plan-schedule";
import type { PublicSubscriptionSchedule } from "@/features/meal-plans/lib/subscription-schedule-contract";

export type PlanCover = {
  /** The first dish's https photo. */
  dishImageUrl: string | null;
  kitchenName: string | null;
  summary: PlanScheduleSummary | null;
  rating: { average: number; count: number } | null;
};

const covers = new Map<string, Promise<PlanCover>>();

async function json(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  return response.status === 200 ? response.json() : null;
}

async function rating(kitchenId: string): Promise<PlanCover["rating"]> {
  const body = (await json(`/api/reviews/kitchens/${kitchenId}/summary`).catch(() => null)) as {
    reviewCount?: unknown;
    overallAverage?: unknown;
  } | null;
  return typeof body?.reviewCount === "number" &&
    body.reviewCount > 0 &&
    typeof body.overallAverage === "number"
    ? { average: body.overallAverage, count: body.reviewCount }
    : null;
}

/** The first dish's https photo: what a plan without its own photo shows. */
export function firstDishPhoto(items: PublicSubscriptionSchedule["items"]): string | null {
  const cover = items.length > 0 ? summarizeSchedule(items).coverMenuItemId : null;
  return items.find((item) => item.menuItemId === cover)?.imageUrl ?? null;
}

async function load(planId: string): Promise<PlanCover> {
  const schedule = (await json(`/api/subscriptions/plans/${planId}/schedule`).catch(
    () => null,
  )) as PublicSubscriptionSchedule | null;
  const items = schedule?.items ?? [];
  // An empty or failed schedule has no meal line to show.
  const summary = items.length > 0 ? summarizeSchedule(items) : null;
  const kitchenId = schedule?.kitchenId ?? null;
  const [profile, stars] = kitchenId
    ? await Promise.all([getKitchenProfile(kitchenId).catch(() => null), rating(kitchenId)])
    : [null, null];
  return {
    dishImageUrl: firstDishPhoto(items),
    kitchenName: profile?.displayName?.trim() || profile?.kitchenName || null,
    summary,
    rating: stars,
  };
}

/** What the plan list shows beside a plan's own fields; any failure only leaves a gap. Cached per page load. */
export function getPlanCover(planId: string): Promise<PlanCover> {
  let cover = covers.get(planId);
  if (!cover) {
    cover = load(planId);
    covers.set(planId, cover);
  }
  return cover;
}
