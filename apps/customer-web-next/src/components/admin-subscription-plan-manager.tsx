"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSubscriptionRuntimeManager } from "@/components/admin-subscription-runtime-manager";
import type {
  AdminPlanPeriod,
  AdminPlanStatus,
  AdminSubscriptionPlan,
  ApprovedChefReference,
} from "@/lib/admin-subscription-plan-contract";

const EMPTY = {
  planCode: "",
  chefIdentityId: "",
  name: "",
  description: "",
  billingPeriod: "WEEKLY" as AdminPlanPeriod,
  amount: "",
  currency: "INR",
};

function money(value: number, currency: string): string {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

export function AdminSubscriptionPlanManager() {
  const [plans, setPlans] = useState<AdminSubscriptionPlan[]>([]);
  const [chefs, setChefs] = useState<ApprovedChefReference[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState("Loading subscription plans…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [plansResponse, chefsResponse] = await Promise.all([
      fetch("/api/admin/subscription-plans", { cache: "no-store" }),
      fetch("/api/admin/subscription-plans/chefs", { cache: "no-store" }),
    ]);
    if (plansResponse.status === 401 || chefsResponse.status === 401) throw new Error("Administrator session expired.");
    if (plansResponse.status === 403 || chefsResponse.status === 403) throw new Error("Administrator access is required.");
    if (!plansResponse.ok || !chefsResponse.ok) throw new Error("Subscription plan administration is temporarily unavailable.");
    const [plansBody, chefsBody] = await Promise.all([plansResponse.json(), chefsResponse.json()]);
    setPlans(plansBody as AdminSubscriptionPlan[]); setChefs(chefsBody as ApprovedChefReference[]); setMessage("");
  }, []);

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "Subscription plans are unavailable.")); }, [load]);
  function field(name: keyof typeof EMPTY, value: string) { setForm(current => ({ ...current, [name]: value })); }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < 0) { setMessage("Enter a valid non-negative backend plan amount."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/subscription-plans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, chefIdentityId: form.chefIdentityId || null, description: form.description || null, amount, currency: form.currency.toUpperCase() }),
      });
      if (!response.ok) throw new Error("Subscription plan could not be created.");
      setForm(EMPTY); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Subscription plan could not be created."); }
    finally { setBusy(false); }
  }

  async function updateStatus(planId: string, status: AdminPlanStatus) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/subscription-plans/${planId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error(response.status === 409 ? "Plan cannot activate until an approved chef, active meal schedule and active lifecycle policy are all ready." : "Plan status could not be updated.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Plan status could not be updated."); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-7 lg:grid-cols-[0.72fr_1.28fr]">
    <form onSubmit={create} className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950">
      <h2 className="text-2xl font-bold">Create plan</h2>
      <p className="mt-2 text-sm text-slate-600">Plan content, amount, chef assignment and lifecycle rules are administrator inputs. The application does not calculate or recommend them.</p>
      <label className="mt-5 block text-sm font-bold">Plan code<input value={form.planCode} maxLength={80} onChange={event => field("planCode", event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl bg-white px-4" required /></label>
      <label className="mt-4 block text-sm font-bold">Approved chef<select value={form.chefIdentityId} onChange={event => field("chefIdentityId", event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl bg-white px-4"><option value="">Unassigned draft</option>{chefs.map(chef => <option key={chef.identityId} value={chef.identityId}>{chef.displayName} · {chef.email}</option>)}</select></label>
      <label className="mt-4 block text-sm font-bold">Name<input value={form.name} maxLength={160} onChange={event => field("name", event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl bg-white px-4" required /></label>
      <label className="mt-4 block text-sm font-bold">Description<textarea value={form.description} maxLength={2000} onChange={event => field("description", event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl bg-white p-4" /></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Billing period<select value={form.billingPeriod} onChange={event => field("billingPeriod", event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl bg-white px-4"><option value="WEEKLY">WEEKLY</option><option value="MONTHLY">MONTHLY</option></select></label><label className="text-sm font-bold">Currency<input value={form.currency} maxLength={3} onChange={event => field("currency", event.target.value.toUpperCase())} className="mt-2 min-h-12 w-full rounded-2xl bg-white px-4" required /></label></div>
      <label className="mt-4 block text-sm font-bold">Amount<input value={form.amount} type="number" min="0" step="0.01" onChange={event => field("amount", event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl bg-white px-4" required /></label>
      <button disabled={busy} className="mt-6 min-h-12 w-full rounded-2xl bg-[#6930CA] font-bold text-white disabled:opacity-50">Create draft plan</button>
    </form>
    <section>
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-2xl font-bold text-slate-950">Existing plans</h2><p className="mt-1 text-sm text-slate-600">Configure meals and customer policy before activating a plan.</p></div><button onClick={() => void load()} className="rounded-2xl border border-[#cfc4d7] bg-white px-4 py-2 font-bold text-[#5f506b]">Refresh</button></div>
      {message && <p className="mt-4 rounded-2xl bg-[#FFF8EC] p-4 text-slate-950" role="status">{message}</p>}
      <div className="mt-5 space-y-4">{plans.map(plan => <article key={plan.id} className="rounded-[26px] bg-[#FFF8EC] p-6 text-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6930CA]">{plan.status} · {plan.billingPeriod}</p><h3 className="mt-2 text-2xl font-bold">{plan.name}</h3><p className="mt-2 text-sm text-slate-600">{plan.planCode} · {plan.chefIdentityId ? "Chef-assigned" : "Chef assignment pending"}</p></div><strong className="text-xl">{money(plan.amount, plan.currency)}</strong></div>
        <p className="mt-4 text-sm leading-6 text-slate-700">{plan.description ?? "No description"}</p>
        <div className="mt-5 flex flex-wrap gap-2">{(["DRAFT", "ACTIVE", "INACTIVE"] as AdminPlanStatus[]).map(status => <button key={status} disabled={busy || plan.status === status} onClick={() => void updateStatus(plan.id, status)} className="rounded-2xl border border-[#6930CA] px-3 py-2 text-sm font-bold text-[#6930CA] disabled:opacity-40">{status}</button>)}</div>
        <AdminSubscriptionRuntimeManager plan={plan} />
      </article>)}</div>
    </section>
  </div>;
}
