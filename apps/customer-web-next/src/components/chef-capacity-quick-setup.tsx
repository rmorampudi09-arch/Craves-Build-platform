"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Gauge, RefreshCw } from "lucide-react";
import {
  parseChefCapacitySummary,
  type ChefCapacitySummary,
  type ChefCapacitySlotRule,
} from "@/lib/chef-subscription-capacity-contract";

const DAYS = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [7, "Sunday"],
] as const;

const MEAL_SLOTS = [
  ["BREAKFAST", "Breakfast"],
  ["LUNCH", "Lunch"],
  ["DINNER", "Dinner"],
  ["SNACK", "Snack"],
] as const;

type ApplyMode = "ALL_DAYS" | "ONE_DAY";

function nonNegativeInteger(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100000 ? parsed : null;
}

function responseMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const raw = body as Record<string, unknown>;
  if (typeof raw.message === "string" && raw.message.trim()) return raw.message;
  if (raw.details && typeof raw.details === "object") {
    const details = raw.details as Record<string, unknown>;
    if (typeof details.message === "string" && details.message.trim()) return details.message;
  }
  return fallback;
}

function ruleStatus(rule: ChefCapacitySlotRule | undefined): { label: string; ready: boolean; detail: string } {
  if (!rule) return { label: "Not configured", ready: false, detail: "Add this weekday before a monthly plan can be approved." };
  if (!rule.salesEnabled) return { label: "Sales closed", ready: false, detail: "Turn on subscription sales for this slot." };
  if (rule.recurringDeficitUnits > 0) return { label: "Over capacity", ready: false, detail: `${rule.recurringDeficitUnits} unit(s) above the current limit.` };
  return {
    label: "Ready",
    ready: true,
    detail: `${rule.recurringAvailableUnits} subscription unit(s) currently available.`,
  };
}

export function ChefCapacityQuickSetup() {
  const [summary, setSummary] = useState<ChefCapacitySummary | null>(null);
  const [slot, setSlot] = useState("LUNCH");
  const [mode, setMode] = useState<ApplyMode>("ALL_DAYS");
  const [day, setDay] = useState("1");
  const [total, setTotal] = useState("");
  const [subscription, setSubscription] = useState("");
  const [salesEnabled, setSalesEnabled] = useState(true);
  const [reason, setReason] = useState("Initial subscription capacity setup");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading your current capacity…");

  const load = useCallback(async () => {
    const response = await fetch("/api/chef/subscription-capacity", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(responseMessage(body, "Subscription capacity could not be loaded."));
    const parsed = parseChefCapacitySummary(body);
    if (!parsed) throw new Error("Craves returned an invalid capacity response.");
    setSummary(parsed);
    setMessage("");
  }, []);

  useEffect(() => {
    void load().catch(error => setMessage(error instanceof Error ? error.message : "Capacity is unavailable."));
  }, [load]);

  const selectedRules = useMemo(
    () => DAYS.map(([dayValue, dayLabel]) => ({
      dayValue,
      dayLabel,
      rule: summary?.slotRules.find(rule => rule.isoDayOfWeek === dayValue && rule.mealSlotCode === slot),
    })),
    [summary, slot],
  );

  const readyDays = selectedRules.filter(entry => ruleStatus(entry.rule).ready).length;

  async function saveRule(dayValue: number) {
    const totalCapacityUnits = nonNegativeInteger(total);
    const subscriptionCapacityUnits = nonNegativeInteger(subscription);
    if (totalCapacityUnits === null || subscriptionCapacityUnits === null || subscriptionCapacityUnits > totalCapacityUnits) {
      throw new Error("Enter valid capacity numbers. Subscription capacity cannot be greater than total kitchen capacity.");
    }
    if (!reason.trim()) throw new Error("Enter a short reason for this capacity setup.");

    const response = await fetch("/api/chef/subscription-capacity/rules/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        isoDayOfWeek: dayValue,
        mealSlotCode: slot,
        totalCapacityUnits,
        subscriptionCapacityUnits,
        salesEnabled,
        reason: reason.trim(),
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(responseMessage(body, "Capacity rule could not be saved."));
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const targetDays = mode === "ALL_DAYS" ? DAYS : DAYS.filter(([value]) => value === Number(day));
      const failures: string[] = [];
      for (const [dayValue, dayLabel] of targetDays) {
        try {
          await saveRule(dayValue);
        } catch (error) {
          failures.push(`${dayLabel}: ${error instanceof Error ? error.message : "save failed"}`);
        }
      }
      await load();
      if (failures.length > 0) {
        setMessage(`Some days could not be saved. ${failures.join(" | ")}`);
      } else {
        setMessage(mode === "ALL_DAYS"
          ? `${slot} capacity applied to all 7 weekdays. Monthly meal plans using this slot can now pass the weekday-capacity check, subject to available units.`
          : `${slot} capacity saved for ${DAYS.find(([value]) => value === Number(day))?.[1] ?? "the selected day"}.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="craves-overline text-primary">Quick setup</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink">Make a meal slot ready for subscriptions</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Pick the same meal slot you use in your meal plan. <strong className="text-ink">Monthly plans should use “All 7 days”</strong>
            because the same date of the month can fall on a different weekday each month.
          </p>
        </div>
        <button type="button" disabled={busy} onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-ink disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-secondary p-4">
          <label className="text-sm font-semibold text-ink">Meal slot
            <select value={slot} onChange={event => setSlot(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-border bg-white px-4">
              {MEAL_SLOTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Use the same Breakfast / Lunch / Dinner / Snack choice that appears in the meal-plan schedule.</p>
        </div>

        <div className="rounded-2xl bg-secondary p-4">
          <p className="text-sm font-semibold text-ink">Apply this capacity to</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-xl border p-3 ${mode === "ALL_DAYS" ? "border-primary bg-white" : "border-border bg-white/70"}`}>
              <input type="radio" className="mr-2" checked={mode === "ALL_DAYS"} onChange={() => setMode("ALL_DAYS")} />
              <strong>All 7 days</strong>
              <span className="mt-1 block text-xs text-muted-foreground">Recommended for monthly plans</span>
            </label>
            <label className={`cursor-pointer rounded-xl border p-3 ${mode === "ONE_DAY" ? "border-primary bg-white" : "border-border bg-white/70"}`}>
              <input type="radio" className="mr-2" checked={mode === "ONE_DAY"} onChange={() => setMode("ONE_DAY")} />
              <strong>One weekday</strong>
              <span className="mt-1 block text-xs text-muted-foreground">Useful for weekly plans</span>
            </label>
          </div>
          {mode === "ONE_DAY" && <select value={day} onChange={event => setDay(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-border bg-white px-3">
            {DAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-semibold text-ink">Meals you can prepare in this slot
          <input value={total} onChange={event => setTotal(event.target.value)} type="number" min="0" placeholder="e.g. 20" className="mt-2 min-h-11 w-full rounded-xl border border-border px-3" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Your total kitchen capacity for this slot.</span>
        </label>
        <label className="text-sm font-semibold text-ink">Meals available to subscriptions
          <input value={subscription} onChange={event => setSubscription(event.target.value)} type="number" min="0" placeholder="e.g. 10" className="mt-2 min-h-11 w-full rounded-xl border border-border px-3" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Must be less than or equal to total capacity.</span>
        </label>
        <label className="flex min-h-11 items-center gap-3 self-start rounded-xl border border-border px-4 py-3 text-sm font-semibold text-ink md:mt-7">
          <input type="checkbox" checked={salesEnabled} onChange={event => setSalesEnabled(event.target.checked)} />
          Accept new subscription sales
        </label>
        <button type="button" disabled={busy} onClick={() => void save()} className="btn-primary self-start disabled:opacity-50 md:mt-7">
          {busy ? "Saving…" : mode === "ALL_DAYS" ? "Apply to all 7 days" : "Save weekday capacity"}
        </button>
      </div>

      <label className="mt-4 block text-sm font-semibold text-ink">Reason
        <input value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} className="mt-2 min-h-11 w-full rounded-xl border border-border px-3" />
      </label>

      {message && <p role="status" className="mt-4 rounded-xl border border-border bg-white p-4 text-sm text-ink">{message}</p>}

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">{MEAL_SLOTS.find(([value]) => value === slot)?.[1} readiness</h3>
            <p className="mt-1 text-xs text-muted-foreground">{readyDays}/7 weekdays currently configured and open for subscription sales.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${readyDays === 7 ? "bg-success/10 text-success" : "bg-amber-50 text-amber-800"}`}>
            {readyDays === 7 ? "Ready for monthly plans" : `${7 - readyDays} day(s) need attention`}
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {selectedRules.map(({ dayValue, dayLabel, rule }) => {
            const state = ruleStatus(rule);
            return <div key={dayValue} className={`rounded-xl border p-3 ${state.ready ? "border-success/20 bg-success/5" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center gap-2">
                {state.ready ? <CheckCircle2 className="h-4 w-4 text-success" /> : <CircleAlert className="h-4 w-4 text-amber-700" />}
                <strong className="text-sm text-ink">{dayLabel.slice(0, 3)}</strong>
              </div>
              <p className={`mt-2 text-xs font-bold ${state.ready ? "text-success" : "text-amber-800"}`}>{state.label}</p>
              {rule && <p className="mt-1 text-xs text-muted-foreground">{rule.subscriptionCapacityUnits} limit · {rule.recurringAvailableUnits} free</p>}
            </div>;
          })}
        </div>
      </div>

      {summary?.adminSalesFrozen && <div className="mt-4 flex gap-3 rounded-xl border border-error/25 bg-error/5 p-4 text-sm text-error">
        <Gauge className="mt-0.5 h-5 w-5 shrink-0" />
        <div><strong>Subscription sales are frozen by Craves operations.</strong><p className="mt-1">{summary.freezeReason ?? "Contact support before accepting new subscriptions."}</p></div>
      </div>}
    </section>
  );
}
