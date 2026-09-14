"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { draftSchema, financeViewSchema, payoutSchema, subscriptionPreviewSchema, type FinanceSettings, type FinanceView } from "@/lib/finance-contract";

async function api(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/admin/finance/${path}`, {method: body === undefined ? "GET" : "POST", cache: "no-store",
    ...(body === undefined ? {} : {headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)})});
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({detail: z.string().optional(), code: z.string().optional()}).safeParse(data);
    throw new Error(error.success ? error.data.detail || error.data.code || "Finance request failed" : "Finance request failed");
  }
  return data;
}
const numericFields: {key: keyof FinanceSettings; label: string; integer?: boolean}[] = [
  {key: "automaticPayoutDelayHours", label: "Automatic payout delay, hours after delivery", integer: true},
  {key: "manualAvailabilityDelayHours", label: "Manual availability delay, hours after delivery", integer: true},
  {key: "customerCancellationSeconds", label: "Customer cancellation window, seconds", integer: true},
  {key: "chefFeePercent", label: "Chef service fee, percent"},
  {key: "restaurantGstPercent", label: "Qualifying restaurant food GST, percent"},
  {key: "deliveryGstPercent", label: "Separately classified delivery GST, percent"},
  {key: "platformGstPercent", label: "Platform fee GST, percent"},
  {key: "chefFeeGstPercent", label: "GST on chef service fee, percent"},
  {key: "platformFee", label: "Platform fee per subscription purchase, INR"},
];
const switches: {key: keyof FinanceSettings; label: string}[] = [
  {key: "ledgerEnabled", label: "Ledger posting policy"}, {key: "automaticPayoutsEnabled", label: "Automatic payout queue"},
  {key: "manualWithdrawalsEnabled", label: "Chef withdrawal requests"}, {key: "subscriptionQuotesEnabled", label: "Subscription quote policy"},
];
const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950";
const buttonClass = "rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40";

export function FinanceControlCenter() {
  const [view, setView] = useState<FinanceView | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [draft, setDraft] = useState<z.infer<typeof draftSchema> | null>(null);
  const [payouts, setPayouts] = useState<z.infer<typeof payoutSchema>[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("Loading verified finance configuration…");
  const [busy, setBusy] = useState(false);
  const [chefId, setChefId] = useState("");
  const [foodBase, setFoodBase] = useState("369.00");
  const [customerFood, setCustomerFood] = useState("369.00");
  const [delivery, setDelivery] = useState("39.00");
  const [mealCount, setMealCount] = useState(1);
  const [preview, setPreview] = useState<z.infer<typeof subscriptionPreviewSchema> | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([api("settings"), api("payouts")]).then(([raw, rows]) => {
      const next = financeViewSchema.parse(raw);const items = z.array(payoutSchema).parse(rows);
      if (active) {setView(next);setSettings(next.settings);setPayouts(items);setMessage("");}
    }).catch(error => {if (active) setMessage(error instanceof Error ? error.message : "Finance configuration unavailable");});
    return () => {active = false;};
  }, []);
  function edit(key: keyof FinanceSettings, value: FinanceSettings[keyof FinanceSettings]) {
    setSettings(previous => previous ? {...previous, [key]: value} : previous);setDraft(null);setPreview(null);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);setMessage("");
    try {await action();} catch (error) {setMessage(error instanceof Error ? error.message : "Finance operation unavailable");}
    finally {setBusy(false);}
  }
  return <div className="space-y-6 text-slate-900">
    <header><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Craves finance</p><h1 className="mt-2 text-3xl font-bold">Finance control center</h1>
      <p className="mt-3 max-w-3xl text-sm text-slate-600">Versioned settings, payout controls and tax-inclusive quote previews. Bank verification is automated separately through Razorpay; these controls never replace provider evidence.</p></header>
    {message && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4">{message}</p>}
    {!settings || !view ? <button type="button" className={buttonClass} onClick={() => window.location.reload()}>Reload finance configuration</button> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Recorded policy status</h2>
        <p className="mt-2 text-sm">Revision {view.revision} · {view.releaseStatus.replaceAll("_", " ")}</p>
        <p className="mt-2 text-sm">Requested ledger start: {view.settings.ledgerStartDate}, 00:00 Asia/Kolkata. This date does not prove production posting.</p>
        <p className="mt-2 text-sm">One accepted manual withdrawal per chef per India calendar day. Submitted or uncertain money remains reserved.</p>
        {view.activationBlockers.length > 0 && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm"><h3 className="font-semibold">Release checks</h3>{view.activationBlockers.map(item => <p className="mt-2" key={item}>{item.replaceAll("_", " ")}</p>)}</div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Edit a new policy version</h2>
        <p className="mt-2 text-sm text-slate-600">Draft values do not rewrite accepted orders or settled earnings. Pausing submissions must not stop reconciliation of transfers already sent.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">{switches.map(field => <label key={field.key} className="flex items-center justify-between gap-4 rounded-xl border p-4"><span>{field.label}</span><input aria-label={field.label} type="checkbox" checked={settings[field.key] === true} onChange={event => edit(field.key, event.target.checked)} className="h-5 w-5" /></label>)}</div>
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium">Ledger start date, India time<input className={inputClass} type="date" value={settings.ledgerStartDate} onChange={event => edit("ledgerStartDate", event.target.value)} /></label>
          {numericFields.map(field => <label className="text-sm font-medium" key={field.key}>{field.label}<input className={inputClass} type="number" min="0" step={field.integer ? "1" : "0.01"} value={String(settings[field.key])} onChange={event => edit(field.key, field.integer ? event.target.valueAsNumber : event.target.value)} /></label>)}
          <label className="text-sm font-medium">GST treatment of chef fee<select className={inputClass} value={settings.chefFeeTaxTreatment} onChange={event => edit("chefFeeTaxTreatment", event.target.value as FinanceSettings["chefFeeTaxTreatment"])}><option value="UNCONFIRMED">Unconfirmed — block activation</option><option value="INCLUSIVE">GST within advertised fee</option><option value="EXCLUSIVE">GST added to advertised fee</option></select></label>
          <label className="text-sm font-medium">Finance tax classification reference<input className={inputClass} maxLength={240} value={settings.taxApprovalReference || ""} onChange={event => edit("taxApprovalReference", event.target.value.trim() || null)} /></label>
        </div>
        <label className="mt-5 block text-sm font-medium">Reason and approval evidence<textarea className={inputClass} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={buttonClass} disabled={busy || !reason.trim()} onClick={() => void run(async () => {setDraft(draftSchema.parse(await api("policies", {settings, reason})));setMessage("Draft saved. Review values before activation.");})}>Save immutable draft</button>
          <button type="button" className={buttonClass} disabled={busy || !draft || !reason.trim()} onClick={() => void run(async () => {if (!draft) return;const next = financeViewSchema.parse(await api(`policies/${draft.id}/activate`, {expectedRevision: view.revision, expectedHash: draft.contentHash, reason}));setView(next);setSettings(next.settings);setDraft(null);setMessage("Policy version recorded. Runtime release checks still apply.");})}>Activate reviewed version</button>
        </div>{draft && <p className="mt-3 break-all font-mono text-xs">Content hash: {draft.contentHash}</p>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Subscription price simulation</h2><p className="mt-2 text-sm text-slate-600">Use a chef quote per occurrence and delivery estimate before GST. Platform fee is collected once and allocated exactly. This does not purchase meals or create payable earnings.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-4"><label>Chef food base<input className={inputClass} value={foodBase} onChange={event => setFoodBase(event.target.value)} inputMode="decimal" /></label><label>Customer food price<input className={inputClass} value={customerFood} onChange={event => setCustomerFood(event.target.value)} inputMode="decimal" /></label><label>Delivery before GST<input className={inputClass} value={delivery} onChange={event => setDelivery(event.target.value)} inputMode="decimal" /></label><label>Explicit meal count<input className={inputClass} type="number" min="1" max="60" value={mealCount} onChange={event => setMealCount(event.target.valueAsNumber)} /></label></div>
        <button type="button" className={`${buttonClass} mt-4`} disabled={busy || !Number.isInteger(mealCount) || mealCount < 1 || mealCount > 60} onClick={() => void run(async () => {setPreview(subscriptionPreviewSchema.parse(await api("subscription-preview", {settings, occurrences: Array.from({length: mealCount}, (_, i) => ({occurrenceId: `preview-meal-${i + 1}`, chefFoodBase: foodBase, customerFoodPrice: customerFood, deliveryEstimate: delivery}))})));})}>Calculate total including taxes</button>
        {preview && <div className="mt-5 rounded-xl bg-slate-50 p-5"><p className="text-2xl font-bold">₹{preview.total} total</p><p className="mt-2 text-sm">{preview.notice}</p><details className="mt-3"><summary className="cursor-pointer font-semibold">Component and occurrence breakdown</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(preview.occurrences, null, 2)}</pre></details></div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Operational payout holds</h2>
        <p className="mt-2 text-sm text-slate-600">Bank enrollment and recipient creation are automatic. Use these controls only for an independent financial or operational hold. Releasing one cannot bypass bank validation, unresolved refunds or source conflicts.</p>
        <label className="mt-4 block text-sm">Chef identity UUID<input className={inputClass} value={chefId} onChange={event => setChefId(event.target.value)} /></label>
        <p className="mt-3 text-sm">The reason above is recorded for every action.</p><div className="mt-4 flex flex-wrap gap-3">
          {[true, false].map(onHold => <button type="button" key={String(onHold)} className={buttonClass} disabled={busy || !reason.trim() || !z.string().uuid().safeParse(chefId).success} onClick={() => void run(async () => {await api(`chefs/${chefId}/hold`, {onHold, reason});setMessage(onHold ? "Operational payout hold applied." : "Operational hold released; independent bank and financial checks still apply.");})}>{onHold ? "Hold payouts" : "Release operational hold"}</button>)}</div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Recent payout instructions</h2><button type="button" className="rounded-lg border px-3 py-2" disabled={busy} onClick={() => void run(async () => {setPayouts(z.array(payoutSchema).parse(await api("payouts")));})}>Refresh</button></div>
        <p className="mt-2 text-sm text-slate-600">Latest 100. Reserved or processing is not confirmed bank payment. Unknown outcomes must not be bypassed with a fresh transfer.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Instruction</th><th className="p-2">Amount</th><th className="p-2">Mode</th><th className="p-2">State</th><th className="p-2">Transfer evidence</th></tr></thead><tbody>{payouts.map(row => <tr key={row.id} className="border-t"><td className="p-2 font-mono text-xs">{row.id}</td><td className="p-2">₹{row.amount}</td><td className="p-2">{row.mode}</td><td className="p-2">{row.status}</td><td className="p-2">{row.transferReference || "Not confirmed"}</td></tr>)}</tbody></table>{payouts.length === 0 && <p className="py-4 text-sm">No new-engine payout instructions returned.</p>}</div>
      </section>
    </>}
  </div>;
}
