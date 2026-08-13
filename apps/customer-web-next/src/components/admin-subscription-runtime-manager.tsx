"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminSubscriptionPolicyManager } from "@/components/admin-subscription-policy-manager";
import { AdminSubscriptionScheduleManager } from "@/components/admin-subscription-schedule-manager";
import type { AdminSubscriptionPlan } from "@/lib/admin-subscription-plan-contract";
import type { AdminSubscriptionReadiness } from "@/lib/admin-subscription-runtime-contract";

export function AdminSubscriptionRuntimeManager({ plan }: { plan: AdminSubscriptionPlan }) {
  const [expanded, setExpanded] = useState(false);
  const [readiness, setReadiness] = useState<AdminSubscriptionReadiness | null>(null);
  const [message, setMessage] = useState("");

  const loadReadiness = useCallback(async () => {
    const response = await fetch(`/api/admin/subscription-plans/${plan.id}/readiness`, { cache: "no-store" });
    if (response.status === 401) throw new Error("Administrator session expired.");
    if (response.status === 403) throw new Error("Subscription administrator access is required.");
    if (!response.ok) throw new Error("Plan readiness is unavailable.");
    setReadiness(await response.json() as AdminSubscriptionReadiness);
  }, [plan.id]);

  useEffect(() => {
    if (!expanded) return;
    void loadReadiness().catch(error => setMessage(error instanceof Error ? error.message : "Plan readiness is unavailable."));
  }, [expanded, loadReadiness]);

  const checks = useMemo(() => readiness ? [
    ["Chef assigned", readiness.chefAssigned],
    ["Approved meal schedule", readiness.activeSchedule],
    ["Platform policy", readiness.activePolicy],
    ["Customer-ready", readiness.readyForActivation],
  ] as const : [], [readiness]);

  return <div className="mt-5 border-t border-[#eadfd0] pt-5">
    <button type="button" onClick={() => setExpanded(value => !value)} className="rounded-2xl border border-[#6930CA] px-4 py-2 text-sm font-bold text-[#6930CA]">
      {expanded ? "Hide review details" : "Review meals & policy"}
    </button>
    {expanded && <div className="mt-5 space-y-5">
      {message && <p role="status" className="rounded-2xl bg-white p-4 text-sm text-slate-700">{message}</p>}
      {readiness && <div className="grid gap-2 sm:grid-cols-4">{checks.map(([label, ready]) => <div key={label} className="rounded-2xl bg-white p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 font-bold ${ready ? "text-emerald-700" : "text-amber-700"}`}>{ready ? "Ready" : "Pending"}</p></div>)}</div>}
      <AdminSubscriptionScheduleManager plan={plan} />
      <div>
        <p className="mb-2 text-xs leading-5 text-slate-500">Meal content above is Chef-owned and read-only. Subscription lifecycle policy remains a platform safeguard managed by authorized administrators.</p>
        <AdminSubscriptionPolicyManager plan={plan} onChanged={loadReadiness} />
      </div>
    </div>}
  </div>;
}
