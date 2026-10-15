"use client";
// Browser calls for the chef's meal plans. Failures throw ChefError; its ref is FEATURE_NOT_AVAILABLE
// when the backend route isn't live yet (show Coming soon).
import { sessionFetch } from "@/shared/lib/session-fetch";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { CHEF_ERROR_MESSAGES, chefApiError, ChefError } from "@/features/chef/lib/chef-errors";
import { parseChefMenuItems } from "@/features/chef/lib/chef-menu-contract";
import {
  parseChefMealPlan,
  parseChefMealPlans,
  parseChefMealSchedule,
  type ChefMealPlanInput,
  type ChefMealScheduleInput,
} from "@/features/chef/lib/chef-subscription-plan-contract";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function call<T>(
  path: string,
  parse: (value: unknown) => T | null,
  fallback: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await sessionFetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw chefApiError(response, body, fallback);
  const parsed = parse(body);
  if (parsed === null)
    throw new ChefError(
      CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE,
      "UNEXPECTED_RESPONSE",
      response.status,
    );
  return parsed;
}

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});
const plan = (planId: string) => `/api/chef/subscription-plans/${encodeURIComponent(planId)}`;

export const isComingSoon = (error: unknown) =>
  error instanceof ChefError && error.ref === FEATURE_NOT_AVAILABLE;

export const loadMealPlans = () =>
  call("/api/chef/subscription-plans", parseChefMealPlans, "Your meal plans couldn’t load.");

/** null while the plan has no meals yet (the server answers 404). */
export async function loadMealSchedule(planId: string) {
  try {
    return await call(
      `${plan(planId)}/schedule`,
      parseChefMealSchedule,
      "This meal plan’s meals couldn’t load.",
    );
  } catch (error) {
    if (error instanceof ChefError && error.status === 404 && !isComingSoon(error)) return null;
    throw error;
  }
}

export const loadChefMenu = () =>
  call("/api/chef/menu", parseChefMenuItems, "Your menu couldn’t load.");

export const saveMealPlan = (planId: string | null, input: ChefMealPlanInput) =>
  call(
    planId ? plan(planId) : "/api/chef/subscription-plans",
    parseChefMealPlan,
    "The meal plan could not be saved. Try again.",
    send(planId ? "PUT" : "POST", input),
  );

export const saveMealSchedule = (planId: string, input: ChefMealScheduleInput) =>
  call(
    `${plan(planId)}/schedule`,
    parseChefMealSchedule,
    "The meals could not be saved. Try again.",
    send("PUT", input),
  );

export function uploadMealPlanPhoto(planId: string, file: File) {
  const form = new FormData();
  form.set("file", file, file.name);
  return call(
    `${plan(planId)}/image`,
    parseChefMealPlan,
    "Photo couldn’t be uploaded. Try again.",
    { method: "PUT", body: form },
  );
}

export const setAcceptingSubscribers = (planId: string, acceptingSubscribers: boolean) =>
  call(
    `${plan(planId)}/accepting-subscribers`,
    parseChefMealPlan,
    "That didn’t save. Try again.",
    send("PATCH", { acceptingSubscribers }),
  );

export const submitMealPlan = (planId: string, note: string) =>
  call(
    `${plan(planId)}/submit`,
    parseChefMealPlan,
    "The meal plan could not be sent. Try again.",
    send("POST", { note: note.trim() || null }),
  );
