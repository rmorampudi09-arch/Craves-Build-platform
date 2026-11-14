"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { hidesRow, LOADING, type AttentionData, type Source } from "@/features/admin/shell/lib/admin-attention";
import { parseAdminDashboardSummary } from "@/features/admin/dashboard/lib/admin-dashboard-contract";
import { pageSchema as caseSchema } from "@/features/admin/delivery-exceptions/delivery-exception-contract";
import { overviewSchema } from "@/features/admin/finance/lib/insights-contract";
import { batchesSchema } from "@/features/admin/fleet/lib/payout-contract";
import { riderPageSchema, selfieReviewSchema } from "@/features/admin/fleet/lib/rider-contract";
import { fleetSetupSchema, rainModeSchema } from "@/features/admin/fleet/lib/setup-contract";
import { issuesSchema, sosEventsSchema } from "@/features/admin/fleet/lib/support-contract";

class Hidden extends Error {}

async function readJson(path: string): Promise<unknown> {
  const response = await adminFetch(path, { cache: "no-store" });
  // Not for this owner, or switched off: leave the row out. Any other failure shows as "couldn't check".
  const code = response.status === 404 ? await response.clone().json().then((body: { code?: unknown } | null) => body?.code, () => undefined) : undefined;
  if (hidesRow(path, response.status, code)) throw new Hidden();
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}
const fleetGet = async <T,>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>) => schema.parse(await readJson(`/api/admin/fleet/${path}`));

async function source<T>(work: () => Promise<{ value: T; more?: boolean; oldest?: string }>): Promise<Source<T>> {
  try { return { state: "ok", ...(await work()) }; }
  catch (error) { return error instanceof Hidden ? { state: "hidden" } : { state: "failed" }; }
}

const listed = z.object({ items: z.array(z.object({ status: z.string() }).passthrough()).max(500), nextCursor: z.string().nullish() });
const supportCases = z.object({ cases: z.array(z.object({ status: z.string() }).passthrough()).max(500), nextCursor: z.string().nullish() });
const plans = z.array(z.object({ status: z.string() }).passthrough()).max(2000);
/** The earliest valid time in a list, read leniently: a missing or odd field never fails the row. */
const oldest = (items: readonly unknown[], key: string): string | undefined => items
  .map(item => (item && typeof item === "object" ? (item as Record<string, unknown>)[key] : undefined))
  .filter((value): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value)))
  .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
const istDay = (offset: number) => new Date(Date.now() + offset * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10);

async function load(): Promise<AttentionData> {
  const [dashboard, deliveryProblems, kitchens, mealPlans, chefHelp, helpRequests, riders, selfies, riderProblems, sos, riderPay, payouts, dispatch, rain] = await Promise.all([
    source(async () => {
      const parsed = parseAdminDashboardSummary(await readJson("/api/admin/dashboard/summary"));
      if (!parsed) throw new Error("summary");
      return { value: parsed };
    }),
    source(async () => { const page = caseSchema.parse(await readJson("/api/admin/delivery-exceptions?limit=30&offset=0")); return { value: page.items.length, more: page.hasMore, oldest: oldest(page.items, "createdAt") }; }),
    source(async () => { const waiting = z.array(z.unknown()).max(5000).parse(await readJson("/api/admin/chef-reviews?status=PENDING")); return { value: waiting.length, oldest: oldest(waiting, "submittedAt") }; }),
    source(async () => { const waiting = plans.parse(await readJson("/api/admin/subscription-plans")).filter(plan => plan.status === "PENDING_APPROVAL"); return { value: waiting.length, oldest: oldest(waiting, "updatedAt") }; }),
    source(async () => { const page = listed.parse(await readJson("/api/admin/chef-onboarding/help")); const open = page.items.filter(item => item.status !== "RESOLVED"); return { value: open.length, more: Boolean(page.nextCursor), oldest: oldest(open, "createdAt") }; }),
    source(async () => { const page = supportCases.parse(await readJson("/api/admin/support/cases?status=OPEN")); return { value: page.cases.length, more: Boolean(page.nextCursor), oldest: oldest(page.cases, "createdAt") }; }),
    source(async () => { const page = await fleetGet("riders?stage=REVIEW", riderPageSchema); return { value: page.counts?.REVIEW ?? page.riders.length }; }),
    source(async () => { const { items } = await fleetGet("selfie-reviews?state=PENDING", z.object({ items: z.array(selfieReviewSchema).max(200) })); return { value: items.length, oldest: oldest(items, "startedAt") }; }),
    source(async () => {
      const now = Date.now();
      const { issues } = await fleetGet("support-issues?state=OPEN", issuesSchema);
      return { value: { open: issues.length, late: issues.filter(issue => Date.parse(issue.acknowledgeBy) < now).length }, oldest: oldest(issues, "createdAt") };
    }),
    source(async () => ({ value: (await fleetGet("sos-events", sosEventsSchema)).events
      .map(event => ({ riderName: event.riderName, at: event.at, alerted: Boolean(event.alertedAt) }))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) })),
    source(async () => { const waiting = (await fleetGet("payout-batches", batchesSchema)).batches.filter(batch => batch.status === "CREATED"); return { value: waiting.length, oldest: oldest(waiting, "createdAt") }; }),
    source(async () => {
      const overview = overviewSchema.parse(await readJson(`/api/admin/finance/insights?view=overview&from=${istDay(-6)}&to=${istDay(0)}`));
      return { value: { toConfirm: overview.attention.payoutsToConfirm, failed: overview.attention.payoutsFailed, onHold: overview.position.chefsOnHold } };
    }),
    source(async () => ({ value: (await fleetGet("setup", fleetSetupSchema)).dispatchPolicy?.mode ?? null })),
    source(async () => ({ value: (await fleetGet("rain-mode", rainModeSchema)).inForce })),
  ]);
  const pick = (key: "refundFailed" | "readyForPickup"): Source<number> => dashboard.state === "ok" ? { state: "ok", value: dashboard.value.metrics[key] } : dashboard;
  // As on the old overview: when the rider queue can't be read at all (the fleet is off, or no rider role), every rider row is left out.
  const fleetOn = riders.state !== "hidden";
  const rider = <T,>(value: Source<T>): Source<T> => (fleetOn ? value : { state: "hidden" });
  return {
    checkedAt: Date.now(), refundsFailed: pick("refundFailed"), readyForPickup: pick("readyForPickup"),
    orders: dashboard.state === "ok" ? { state: "ok", value: { statusCounts: dashboard.value.statusCounts, orderTrend: dashboard.value.orderTrend,
      recent: dashboard.value.recentExceptions, refundFailed: dashboard.value.metrics.refundFailed, readyForPickup: dashboard.value.metrics.readyForPickup } } : dashboard,
    deliveryProblems, kitchens, mealPlans, chefHelp, helpRequests, payouts,
    riders, selfies: rider(selfies), riderProblems: rider(riderProblems), sos: rider(sos), riderPay: rider(riderPay), dispatch: rider(dispatch), rain: rider(rain),
  };
}

// One shared check for the menu badges, the banners and Today: at most once a minute, unless an owner asks again.
const FRESH_MS = 60_000;
let cached: { at: number; data: Promise<AttentionData> } | null = null;
const listeners = new Set<(data: AttentionData) => void>();

function check(force = false): Promise<AttentionData> {
  if (!cached || force || Date.now() - cached.at > FRESH_MS) {
    const data = load();
    cached = { at: Date.now(), data };
    void data.then(value => { if (cached?.data === data) listeners.forEach(listener => listener(value)); });
  }
  return cached.data;
}

/** The shared attention check. Moving to another page re-checks, using the last minute's answer when it is fresh. */
export function useAdminAttention(enabled: boolean, pathname?: string) {
  const [data, setData] = useState<AttentionData>(LOADING);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const listener = (value: AttentionData) => { if (live) setData(value); };
    listeners.add(listener);
    void check().then(listener);
    return () => { live = false; listeners.delete(listener); };
  }, [enabled, pathname]);
  const refresh = useCallback(async () => {
    setChecking(true);
    try { setData(await check(true)); } finally { setChecking(false); }
  }, []);
  return { data, checking, refresh };
}
