"use client";

import { adminFetch } from "@/lib/admin-renewal";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminSubscriptionRuntimeManager } from "@/components/admin-subscription-runtime-manager";
import { parseAdminSubscriptionPlans, type AdminSubscriptionPlan, type ApprovedChefReference } from "@/lib/admin-subscription-plan-contract";

function money(value: number, currency: string): string {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

function label(status: AdminSubscriptionPlan["status"]): string {
  if (status === "PENDING_APPROVAL") return "Waiting for approval";
  if (status === "REJECTED") return "Changes requested";
  if (status === "ACTIVE") return "Approved & live";
  if (status === "INACTIVE") return "Inactive";
  return "Chef draft";
}

export function AdminSubscriptionPlanManager() {
  const [plans, setPlans] = useState<AdminSubscriptionPlan[]>([]);
  const [chefs, setChefs] = useState<ApprovedChefReference[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("Loading Chef meal plans…");
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const requestId = useRef(0);
  const actionInFlight = useRef(false);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const [plansResult, chefsResult] = await Promise.allSettled([
        adminFetch("/api/admin/subscription-plans", { cache: "no-store" }),
        adminFetch("/api/admin/subscription-plans/chefs", { cache: "no-store" }),
      ]);
      if (plansResult.status === "rejected") throw new Error("Meal plan review queue could not be loaded. Please retry.");
      const plansResponse = plansResult.value;
      if (plansResponse.status === 401) throw new Error("Administrator session expired.");
      if (plansResponse.status === 403) throw new Error("Subscription administrator access is required.");
      if (!plansResponse.ok) throw new Error("Meal plan review queue is temporarily unavailable.");
      const parsedPlans = parseAdminSubscriptionPlans(await plansResponse.json().catch(() => null));
      if (!parsedPlans) throw new Error("Craves returned an invalid meal plan review queue.");
      if (currentRequest !== requestId.current) return "";
      setPlans(parsedPlans); setLoaded(true); setUnavailable(false);

      const chefsBody = chefsResult.status === "fulfilled" && chefsResult.value.ok
        ? await chefsResult.value.json().catch(() => null) : null;
      const namesAvailable = Array.isArray(chefsBody) && chefsBody.every(chef => chef && typeof chef.identityId === "string" && typeof chef.displayName === "string");
      const warning = namesAvailable ? "" : "Meal plans are available. Chef names could not be loaded; use the Chef identity shown on each plan.";
      if (currentRequest !== requestId.current) return "";
      setChefs(namesAvailable ? chefsBody as ApprovedChefReference[] : []);
      setMessage(warning);
      return warning;
    } catch (error) {
      if (currentRequest === requestId.current) {
        setUnavailable(true);
        setMessage(error instanceof Error ? error.message : "Meal plan review queue is unavailable.");
      }
      throw error;
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requests = requestId;
    void load().catch(() => undefined);
    return () => { requests.current++; };
  }, [load]);

  const refreshPlans = useCallback(async () => { await load(); }, [load]);

  const chefNames = useMemo(() => new Map(chefs.map(chef => [chef.identityId, chef.displayName])), [chefs]);
  const orderedPlans = useMemo(() => [...plans].sort((a, b) => {
    const priority = (status: AdminSubscriptionPlan["status"]) => status === "PENDING_APPROVAL" ? 0 : status === "ACTIVE" ? 1 : status === "REJECTED" ? 2 : status === "DRAFT" ? 3 : 4;
    return priority(a.status) - priority(b.status) || b.updatedAt.localeCompare(a.updatedAt);
  }), [plans]);
  const pendingCount = plans.filter(plan => plan.status === "PENDING_APPROVAL").length;

  async function review(plan: AdminSubscriptionPlan, decision: "APPROVE" | "REJECT") {
    if (actionInFlight.current || loading || unavailable) return;
    const reason = (reasons[plan.id] ?? "").trim();
    if (reason.length < 3) { setMessage("Enter a short review reason before approving or rejecting the plan."); return; }
    actionInFlight.current = true;
    setBusyPlanId(plan.id); setMessage("");
    try {
      const response = await adminFetch(`/api/admin/subscription-plans/${plan.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      const body = await response.json().catch(() => null) as { code?: string; details?: { message?: string } } | null;
      if (!response.ok) {
        const detail = body?.details?.message;
        throw new Error(body?.code === "SESSION_RENEWED_RETRY_REQUIRED" ? "Your session was renewed. Review the plan and click the review action again." : detail || (response.status === 409
          ? "Plan is not ready. Missing capacity is automatic now; check the comparison dashboard for an explicit Chef limit, closed slot, operations freeze, or unavailable dish."
          : "Meal plan review failed."));
      }
      setReasons(current => ({ ...current, [plan.id]: "" }));
      const success = decision === "APPROVE" ? "Meal plan approved. It is now eligible for customer discovery." : "Meal plan returned to the Chef with your review reason.";
      try { const warning = await load(); setMessage([success, warning].filter(Boolean).join(" ")); }
      catch { setMessage(`${success} The review queue could not be refreshed. Refresh before another action.`); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Meal plan review failed.");
    } finally {
      actionInFlight.current = false;
      setBusyPlanId(null);
    }
  }

  async function deactivate(plan: AdminSubscriptionPlan) {
    if (actionInFlight.current || loading || unavailable) return;
    actionInFlight.current = true;
    setBusyPlanId(plan.id); setMessage("");
    try {
      const response = await adminFetch(`/api/admin/subscription-plans/${plan.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "INACTIVE" }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.code === "SESSION_RENEWED_RETRY_REQUIRED" ? "Your session was renewed. Review the plan and click Deactivate plan again." : "Plan could not be deactivated.");
      }
      try { const warning = await load(); setMessage(["Plan deactivated and removed from customer discovery.", warning].filter(Boolean).join(" ")); }
      catch { setMessage("Plan deactivated. The review queue could not be refreshed. Refresh before another action."); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plan could not be deactivated.");
    } finally {
      actionInFlight.current = false;
      setBusyPlanId(null);
    }
  }

  return <div className="space-y-6">
    <section className="rounded-[28px] bg-[#FFF8EC] p-6 text-slate-950">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6930CA]">Chef-authored meal plans</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-2xl font-bold">Approval queue</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Chefs choose their dishes and schedule. Missing subscription capacity is filled automatically by Craves using safe defaults; Admin reviews the plan, comparison bars and any explicit Chef restrictions before approval.</p></div>
        <div className="rounded-2xl bg-white px-5 py-3 text-center"><p className="text-xs font-bold uppercase text-slate-500">Waiting</p><p className="text-3xl font-bold text-[#6930CA]">{pendingCount}</p></div>
      </div>
    </section>

    <div className="flex justify-end"><button type="button" disabled={loading || busyPlanId !== null} onClick={() => void load().catch(() => undefined)} className="rounded-2xl border border-[#cfc4d7] bg-white px-4 py-2 font-bold text-[#5f506b] disabled:opacity-50">{loading ? "Refreshing…" : "Refresh"}</button></div>
    {message && <p className="rounded-2xl bg-[#FFF8EC] p-4 text-slate-950" role="status">{message}</p>}

    <div className="space-y-4">
      {loaded && !loading && !unavailable && orderedPlans.length === 0 && <div className="rounded-[26px] border border-dashed border-[#d9cdbd] bg-white p-8 text-center text-slate-600">No Chef meal plans have been created yet.</div>}
      {orderedPlans.map(plan => {
        const chef = plan.chefIdentityId ? chefNames.get(plan.chefIdentityId) : null;
        const pending = plan.status === "PENDING_APPROVAL";
        const busy = busyPlanId !== null || loading || unavailable;
        const reviewing = busyPlanId === plan.id;
        return <article key={plan.id} className="rounded-[26px] bg-[#FFF8EC] p-6 text-slate-950">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6930CA]">{label(plan.status)} · {plan.billingPeriod}</p>
              <h3 className="mt-2 text-2xl font-bold">{plan.name}</h3>
              <p className="mt-2 text-sm text-slate-600">Chef: {chef ?? plan.chefIdentityId ?? "Unassigned"} · {plan.planCode}</p>
            </div>
            <strong className="text-xl">{money(plan.amount, plan.currency)}</strong>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-700">{plan.description ?? "No description provided."}</p>

          <AdminSubscriptionRuntimeManager plan={plan} onChanged={refreshPlans} />

          {pending && <div className="mt-5 rounded-2xl bg-white p-4">
            <label className="block text-sm font-bold">Review reason
              <textarea disabled={busy} value={reasons[plan.id] ?? ""} onChange={event => setReasons(current => ({ ...current, [plan.id]: event.target.value }))} maxLength={1000} placeholder="Approval note or clear changes required for the Chef" className="mt-2 min-h-20 w-full rounded-xl border border-[#d9cdbd] p-3 text-sm" />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void review(plan, "APPROVE")} className="rounded-xl bg-[#6930CA] px-5 py-2.5 font-bold text-white disabled:opacity-50">{reviewing ? "Submitting…" : "Approve plan"}</button>
              <button type="button" disabled={busy} onClick={() => void review(plan, "REJECT")} className="rounded-xl border border-[#6930CA] px-5 py-2.5 font-bold text-[#6930CA] disabled:opacity-50">{reviewing ? "Submitting…" : "Request changes"}</button>
            </div>
          </div>}

          {plan.status === "ACTIVE" && <div className="mt-5"><button type="button" disabled={busy} onClick={() => void deactivate(plan)} className="rounded-xl border border-slate-400 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">{reviewing ? "Deactivating…" : "Deactivate plan"}</button></div>}
        </article>;
      })}
    </div>
  </div>;
}
