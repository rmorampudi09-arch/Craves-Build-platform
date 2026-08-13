"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminSubscriptionPlan } from "@/lib/admin-subscription-plan-contract";
import type { AdminSubscriptionSchedule } from "@/lib/admin-subscription-runtime-contract";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function AdminSubscriptionScheduleManager({ plan }: { plan: AdminSubscriptionPlan; onChanged?: () => Promise<void> }) {
  const [schedule, setSchedule] = useState<AdminSubscriptionSchedule | null>(null);
  const [message, setMessage] = useState("Loading Chef meal schedule…");

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/subscription-plans/${plan.id}/schedule`, { cache: "no-store" });
    if (response.status === 404) { setSchedule(null); setMessage("Chef has not saved a meal schedule yet."); return; }
    if (response.status === 401) throw new Error("Administrator session expired.");
    if (response.status === 403) throw new Error("Subscription administrator access is required.");
    if (!response.ok) throw new Error("Chef meal schedule is unavailable.");
    setSchedule(await response.json() as AdminSubscriptionSchedule);
    setMessage("");
  }, [plan.id]);

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "Chef meal schedule is unavailable.")); }, [load]);

  return <section className="rounded-[24px] bg-white p-5 text-slate-950">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="text-lg font-bold">Chef meal schedule</h4>
        <p className="mt-1 text-xs text-slate-500">Review-only. Meal content is authored by the Chef and revalidated against their live menu during approval.</p>
      </div>
      {schedule && <span className="rounded-full bg-[#FFF8EC] px-3 py-1 text-xs font-bold text-[#6930CA]">{schedule.status} · v{schedule.version}</span>}
    </div>
    {message && <p className="mt-4 rounded-xl bg-[#FFF8EC] p-3 text-sm text-slate-600" role="status">{message}</p>}
    {schedule && <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-[#FFF8EC] p-3"><p className="text-xs font-bold uppercase text-slate-500">Frequency</p><p className="mt-1 font-bold">{schedule.recurrenceType}</p></div>
        <div className="rounded-xl bg-[#FFF8EC] p-3"><p className="text-xs font-bold uppercase text-slate-500">Timezone</p><p className="mt-1 font-bold">{schedule.timezone}</p></div>
        <div className="rounded-xl bg-[#FFF8EC] p-3"><p className="text-xs font-bold uppercase text-slate-500">Meals</p><p className="mt-1 font-bold">{schedule.items.length}</p></div>
      </div>
      <div className="mt-4 space-y-2">
        {schedule.items.map(item => {
          const day = schedule.recurrenceType === "WEEKLY"
            ? WEEKDAYS[(item.isoDayOfWeek ?? 1) - 1]
            : `Day ${item.dayOfMonth}`;
          return <div key={item.id} className="grid gap-2 rounded-2xl border border-[#eadfd0] p-3 text-sm sm:grid-cols-[1.2fr_1fr_1fr_.6fr]">
            <div><p className="text-xs font-bold uppercase text-slate-500">When</p><p className="font-semibold">{day} · {item.serviceTime.slice(0, 5)}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-500">Meal slot</p><p className="font-semibold">{item.mealSlotCode.replaceAll("_", " ")}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-500">Menu item</p><p className="truncate font-mono text-xs" title={item.menuItemId}>{item.menuItemId}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-500">Qty</p><p className="font-semibold">{item.quantity}</p></div>
          </div>;
        })}
      </div>
    </>}
  </section>;
}
