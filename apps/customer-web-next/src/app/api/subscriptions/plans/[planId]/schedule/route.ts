import { boundedFetch } from "@/shared/lib/bounded-fetch";
import { NextResponse } from "next/server";
import { parsePublicSubscriptionSchedule } from "@/features/meal-plans/lib/subscription-schedule-contract";
import { apiBaseUrl, isUuid } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

type Dish = { itemName: string | null; foodType: "VEG" | "NON_VEG" | "EGG" | null; imageUrl: string | null; kitchenId: string | null };

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
}

/** Name, diet, first photo and kitchen of one dish; anything the catalog doesn't give stays null. */
function parseDish(value: unknown, menuItemId: string): Dish | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.id !== menuItemId) return null;
  const name = typeof raw.itemName === "string" ? raw.itemName.trim() : "";
  const images = Array.isArray(raw.images) ? raw.images.slice(0, 30) as Array<Record<string, unknown> | null> : [];
  const cover = images.find(image => image?.primary === true) ?? [...images].sort((a, b) => Number(a?.sortOrder ?? 1e4) - Number(b?.sortOrder ?? 1e4))[0];
  return {
    itemName: name && name.length <= 200 ? name : null,
    foodType: raw.foodType === "VEG" || raw.foodType === "NON_VEG" || raw.foodType === "EGG" ? raw.foodType : null,
    imageUrl: httpsUrl(cover?.publicUrl),
    kitchenId: typeof raw.kitchenId === "string" && isUuid(raw.kitchenId) ? raw.kitchenId : null,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ planId: string }> }) {
  const { planId } = await context.params;
  if (!isUuid(planId)) return NextResponse.json({ code: "INVALID_PLAN_ID" }, { status: 400 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await boundedFetch(`${apiBaseUrl()}/subscriptions/plans/${planId}/schedule`, {
      headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal,
    }, 40_000);
    if (!upstream.ok) return NextResponse.json({ code: "SUBSCRIPTION_SCHEDULE_UNAVAILABLE" }, { status: upstream.status });
    const schedule = parsePublicSubscriptionSchedule(await upstream.json().catch(() => null));
    if (!schedule) return NextResponse.json({ code: "INVALID_SUBSCRIPTION_SCHEDULE_RESPONSE" }, { status: 502 });

    const uniqueMenuIds = [...new Set(schedule.items.map(item => item.menuItemId))];
    const dishes = new Map<string, Dish>();
    await Promise.all(uniqueMenuIds.map(async menuItemId => {
      try {
        const response = await boundedFetch(`${apiBaseUrl()}/catalog/menu-items/${menuItemId}`, {
          headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal,
        }, 40_000);
        if (!response.ok) return;
        const dish = parseDish(await response.json().catch(() => null), menuItemId);
        if (dish) dishes.set(menuItemId, dish);
      } catch {
        // Schedule remains usable even when optional display enrichment is temporarily unavailable.
      }
    }));

    return NextResponse.json({
      ...schedule,
      kitchenId: [...dishes.values()].find(dish => dish.kitchenId)?.kitchenId ?? null,
      items: schedule.items.map(item => {
        const dish = dishes.get(item.menuItemId);
        return { ...item, itemName: dish?.itemName ?? null, foodType: dish?.foodType ?? null, imageUrl: dish?.imageUrl ?? null };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ code: timedOut ? "SUBSCRIPTION_SCHEDULE_TIMEOUT" : "SUBSCRIPTION_SCHEDULE_UNAVAILABLE" }, { status: timedOut ? 504 : 503 });
  } finally {
    clearTimeout(timeout);
  }
}
