"use client";

import { useState } from "react";
import { AdminSubscriptionScheduleManager } from "@/components/admin-subscription-schedule-manager";
import type { AdminSubscriptionPlan } from "@/lib/admin-subscription-plan-contract";

export function AdminSubscriptionRuntimeManager({ plan }: { plan: AdminSubscriptionPlan }) {
  const [expanded, setExpanded] = useState(false);

  return <div className="mt-5 border-t border-[#eadfd0] pt-5">
    <button type="button" onClick={() => setExpanded(value => !value)} className="rounded-2xl border border-[#6930CA] px-4 py-2 text-sm font-bold text-[#6930CA]">
      {expanded ? "Hide Chef meals" : "Review Chef meals"}
    </button>
    {expanded && <div className="mt-5 space-y-4">
      <p className="rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600">
        Meal content is owned by the Chef and is read-only here. Craves automatically applies the safe platform lifecycle default; approval revalidates every selected dish and Chef subscription capacity before the plan becomes customer-visible.
      </p>
      <AdminSubscriptionScheduleManager plan={plan} />
    </div>}
  </div>;
}
