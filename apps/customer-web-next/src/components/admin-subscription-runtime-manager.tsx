"use client";

import { useId, useState } from "react";
import { AdminSubscriptionCapacityBars } from "@/components/admin-subscription-capacity-bars";
import { AdminSubscriptionScheduleManager } from "@/components/admin-subscription-schedule-manager";
import { AdminSubscriptionPolicyManager } from "@/components/admin-subscription-policy-manager";
import type { AdminSubscriptionPlan } from "@/lib/admin-subscription-plan-contract";

export function AdminSubscriptionRuntimeManager({ plan, onChanged }: { plan: AdminSubscriptionPlan; onChanged: () => Promise<void> }) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);

  return <div className="mt-5 border-t border-[#eadfd0] pt-5">
    <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)} className="rounded-2xl border border-[#6930CA] px-4 py-2 text-sm font-bold text-[#6930CA]">
      {expanded ? "Hide plan controls" : "Review plan, capacity & policy"}
    </button>
    {expanded && <div id={panelId} className="mt-5 space-y-4">
      <p className="rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600">
        Admin does not edit the Chef&apos;s meals here. Compare what the plan needs against reserved, available and maximum subscription capacity. Missing capacity is filled automatically by the server using the safe 5-units-per-dish default; explicit Chef limits remain authoritative.
      </p>
      <AdminSubscriptionCapacityBars plan={plan} />
      <AdminSubscriptionScheduleManager plan={plan} />
      <AdminSubscriptionPolicyManager plan={plan} onChanged={onChanged} />
    </div>}
  </div>;
}
