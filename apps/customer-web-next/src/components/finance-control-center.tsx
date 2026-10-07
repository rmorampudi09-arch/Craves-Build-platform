"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { draftSchema, financeSettingsSchema, financeViewSchema, moneySchema, payoutSchema, subscriptionPreviewSchema, type FinanceSettings, type FinanceView } from "@/lib/finance-contract";
import { DeliveryTariffEditor } from "@/components/delivery-tariff-editor";
import { reviewedPolicyMatches } from "@/lib/finance-policy-review";
import { financeBlockerLabel, financeErrorMessage } from "@/lib/finance-operation-feedback";

async function api(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/admin/finance/${path}`, {method: body === undefined ? "GET" : "POST", cache: "no-store",
    ...(body === undefined ? {} : {headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)})});
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({detail: z.string().optional(), code: z.string().optional()}).safeParse(data);
    throw new Error(financeErrorMessage(response.status, error.success ? error.data.code : undefined, error.success ? error.data.detail : undefined));
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
  {key: "platformFee", label: "Platform fee per checkout or subscription purchase, INR"},
];
const switches: {key: keyof FinanceSettings; label: string}[] = [
  {key: "ledgerEnabled", label: "Ledger posting policy"}, {key: "automaticPayoutsEnabled", label: "Automatic payout queue"},
  {key: "manualWithdrawalsEnabled", label: "Chef withdrawal requests"}, {key: "subscriptionQuotesEnabled", label: "Subscription quote policy"},
];
const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950";
const buttonClass = "rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40";
const previewMealSchema = z.object({occurrenceId: z.string(), chef: z.object({gross: moneySchema, serviceFee: moneySchema, serviceFeeTax: moneySchema, payable: moneySchema}), food: z.object({base: moneySchema, amount: moneySchema}), delivery: z.object({base: moneySchema, amount: moneySchema}), platform: z.object({base: moneySchema, amount: moneySchema}), total: moneySchema});

export function FinanceControlCenter({ section = "all" }: {section?: "all" | "payments" | "policy" | "preview"}) {
  const [view, setView] = useState<FinanceView | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [draft, setDraft] = useState<z.infer<typeof draftSchema> | null>(null);
  const [payouts, setPayouts] = useState<z.infer<typeof payoutSchema>[]>([]);
  const [payoutError, setPayoutError] = useState("");
  const [reason, setReason] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(true);
  const [chefId, setChefId] = useState("");
  const [foodBase, setFoodBase] = useState("369.00");
  const [customerFood, setCustomerFood] = useState("369.00");
  const [delivery, setDelivery] = useState("39.00");
  const [mealCount, setMealCount] = useState(1);
  const [preview, setPreview] = useState<z.infer<typeof subscriptionPreviewSchema> | null>(null);
  useEffect(() => {
    let active = true;
    api("settings").then(raw => {
      const next = financeViewSchema.parse(raw);
      if (active) {setView(next);setSettings(next.settings);setMessage("");}
    }).catch(error => {if (active) setMessage(error instanceof Error ? error.message : "Finance configuration unavailable");}).finally(() => {if (active) setLoading(false);});
    api("payouts").then(raw => {const items=z.array(payoutSchema).parse(raw);if(active)setPayouts(items);})
      .catch(() => {if(active)setPayoutError("Payout instructions could not be loaded. Finance settings remain available; this is not a zero balance.");}).finally(() => {if(active)setPayoutLoading(false);});
    return () => {active = false;};
  }, []);
  function edit(key: keyof FinanceSettings, value: FinanceSettings[keyof FinanceSettings]) {
    setSettings(previous => previous ? {...previous, [key]: value} : previous);setDraft(null);setPreview(null);
  }
  async function run(action: () => Promise<void>, label = "Updating finance records…") {
    if (busy) return;
    setBusy(true);setOperation(label);setMessage("");
    try {await action();} catch (error) {setMessage(error instanceof Error ? error.message : "Finance operation unavailable");}
    finally {setBusy(false);setOperation("");}
  }
  const previewAmountsValid = [foodBase, customerFood, delivery].every(value => moneySchema.safeParse(value).success);
  const previewCountValid = Number.isInteger(mealCount) && mealCount >= 1 && mealCount <= 60;
  const previewRows = preview ? z.array(previewMealSchema).safeParse(preview.occurrences) : null;
  return <div className="finance-control-sections space-y-6 text-slate-900" aria-busy={loading || busy}>
    {section === "all" && <header><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Craves finance</p><h1 className="mt-2 text-3xl font-bold">Finance control center</h1>
      <p className="mt-3 max-w-3xl text-sm text-slate-600">Versioned settings, payout controls and tax-inclusive quote previews. RazorpayX activation is pending with the vendor; provider actions remain disabled.</p></header>}
    {operation && <p role="status" className="finance-progress"><span className="finance-spinner" aria-hidden="true" />{operation}</p>}
    {message && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4">{message}</p>}
    {!settings || !view ? loading ? <div className="finance-loading" role="status"><span className="finance-spinner" aria-hidden="true" />Loading finance policy and payout records…</div> : <button type="button" className={buttonClass} onClick={() => window.location.reload()}>Retry loading finance configuration</button> : <>
      <section className="finance-policy-summary rounded-2xl border border-slate-200 bg-white p-6"><div className="finance-section-heading"><h2 className="text-xl font-semibold">Current finance policy</h2><span className="finance-status-badge">{view.settings.ledgerEnabled ? "Ledger policy enabled" : "Ledger policy paused"}</span></div>
        <p className="mt-2 text-sm">Revision {view.revision} · {view.releaseStatus.replaceAll("_", " ")}</p>
        <p className="mt-2 text-sm">Requested ledger start: {view.settings.ledgerStartDate}, 00:00 Asia/Kolkata. This date does not prove production posting.</p>
        <p className="mt-2 text-sm">One accepted manual withdrawal per chef per India calendar day. Submitted or uncertain money remains reserved.</p>
        {view.activationBlockers.length > 0 && <details className="mt-4 rounded-xl bg-amber-50 p-4 text-sm"><summary className="cursor-pointer font-semibold">{view.activationBlockers.length} checks before policy activation</summary>{view.activationBlockers.map(item => <p className="mt-2" key={item}>{financeBlockerLabel(item)}</p>)}</details>}
      </section>
      <section hidden={section !== "all" && section !== "policy"} className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Policy and rates</h2>
        <p className="mt-2 text-sm text-slate-600">Draft values do not rewrite accepted orders or settled earnings. Pausing submissions must not stop reconciliation of transfers already sent.</p>
        <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
        <div className="mt-5 grid gap-4 md:grid-cols-2">{switches.map(field => <label key={field.key} className="flex items-center justify-between gap-4 rounded-xl border p-4"><span>{field.label}</span><input aria-label={field.label} type="checkbox" checked={settings[field.key] === true} disabled={field.key === "automaticPayoutsEnabled" && !settings.automaticPayoutsEnabled} onChange={event => edit(field.key, event.target.checked)} className="h-5 w-5" /></label>)}</div>
        <p className="finance-field-help mt-3">Automatic RazorpayX payouts remain disabled while vendor approval is pending.</p>
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium">Ledger start date, India time<input className={inputClass} type="date" value={settings.ledgerStartDate} onChange={event => edit("ledgerStartDate", event.target.value)} /></label>
          {numericFields.map(field => <label className="text-sm font-medium" key={field.key}>{field.label}<input className={inputClass} type="number" min="0" step={field.integer ? "1" : "0.01"} value={String(settings[field.key])} onChange={event => edit(field.key, field.integer ? event.target.valueAsNumber : event.target.value)} /></label>)}
          <label className="text-sm font-medium">GST treatment of chef fee<select className={inputClass} value={settings.chefFeeTaxTreatment} onChange={event => edit("chefFeeTaxTreatment", event.target.value as FinanceSettings["chefFeeTaxTreatment"])}><option value="UNCONFIRMED">Unconfirmed — block activation</option><option value="INCLUSIVE">GST within advertised fee</option><option value="EXCLUSIVE">GST added to advertised fee</option></select></label>
          <label className="text-sm font-medium">Finance tax classification reference<input className={inputClass} maxLength={240} value={settings.taxApprovalReference || ""} onChange={event => edit("taxApprovalReference", event.target.value.trim() || null)} /></label>
        </div>
        <p className="mt-4 text-sm">{settings.chefFeeTaxTreatment === "INCLUSIVE" ? `The total chef service-fee deduction is ${settings.chefFeePercent}%, including its GST. GST is not added above this percentage. Separately applicable withholding is not part of this service fee.` : "Select GST within advertised fee to keep the total service-fee deduction within the advertised percentage."}</p>
        <DeliveryTariffEditor value={settings.deliveryTariff} gstRate={settings.deliveryGstPercent} disabled={busy} onChange={value => edit("deliveryTariff", value)} />
        <label className="mt-5 block text-sm font-medium">Reason and approval evidence<textarea className={inputClass} placeholder="Briefly explain this policy change and reference its approval." rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="finance-action-bar mt-5 flex flex-wrap gap-3"><button type="button" className={buttonClass} disabled={busy || !reason.trim()} onClick={() => void run(async () => {
          setDraft(null);
          const checked=financeSettingsSchema.safeParse(settings);
          if(!checked.success)throw new Error("Complete all rates, exact-paise charges and delivery tariff choices before saving.");
          if(checked.data.automaticPayoutsEnabled)throw new Error("Pause the automatic payout queue before saving. RazorpayX vendor approval is pending.");
          const saved=draftSchema.parse(await api("policies", {settings: checked.data, reason}));
          if(!reviewedPolicyMatches(checked.data,saved.settings))throw new Error("The saved policy differs from your reviewed values. Activation is blocked; reload and check the deployed finance version.");
          setDraft(saved);setMessage("Draft saved. Review values before activation.");
        }, "Saving your reviewed policy draft…")}>{busy ? "Saving…" : "Save immutable draft"}</button>
          <button type="button" className={buttonClass} disabled={busy || !draft || !reason.trim()} onClick={() => void run(async () => {if (!draft) return;const next = financeViewSchema.parse(await api(`policies/${draft.id}/activate`, {expectedRevision: view.revision, expectedHash: draft.contentHash, reason}));setView(next);setSettings(next.settings);setDraft(null);setMessage("Policy version recorded. Runtime release checks still apply.");}, "Activating the reviewed policy version…")}>Activate reviewed version</button>
        </div><p className="finance-field-help mt-3">{!reason.trim() ? "Enter a reason to save the policy. Save and review the draft before activation." : !draft ? "Save the draft first. Activation becomes available after its values are verified." : "Draft saved and verified. Activating records this version; runtime checks still apply."}</p>{draft && <details className="mt-3 text-xs"><summary className="cursor-pointer">Audit reference</summary><p className="mt-2 break-all font-mono">Content hash: {draft.contentHash}</p></details>}
        </fieldset>
      </section>
      <section hidden={section !== "all" && section !== "preview"} className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Subscription price simulation</h2><p className="mt-2 text-sm text-slate-600">Use a chef quote per occurrence and delivery estimate before GST. Platform fee is collected once and allocated exactly. This does not purchase meals or create payable earnings.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-4"><label>Chef food base<input className={inputClass} disabled={busy} value={foodBase} onChange={event => {setFoodBase(event.target.value);setPreview(null);}} inputMode="decimal" /></label><label>Customer food price<input className={inputClass} disabled={busy} value={customerFood} onChange={event => {setCustomerFood(event.target.value);setPreview(null);}} inputMode="decimal" /></label><label>Delivery before GST<input className={inputClass} disabled={busy} value={delivery} onChange={event => {setDelivery(event.target.value);setPreview(null);}} inputMode="decimal" /></label><label>Explicit meal count<input className={inputClass} disabled={busy} type="number" min="1" max="60" value={mealCount} onChange={event => {setMealCount(event.target.valueAsNumber);setPreview(null);}} /></label></div>
        <button type="button" className={`${buttonClass} mt-4`} disabled={busy || !previewAmountsValid || !previewCountValid} onClick={() => void run(async () => {setPreview(subscriptionPreviewSchema.parse(await api("subscription-preview", {settings, occurrences: Array.from({length: mealCount}, (_, i) => ({occurrenceId: `preview-meal-${i + 1}`, chefFoodBase: foodBase, customerFoodPrice: customerFood, deliveryEstimate: delivery}))})));}, "Calculating the full price and taxes…")}>{busy ? "Calculating…" : "Calculate total including taxes"}</button>
        {(!previewAmountsValid || !previewCountValid) && <p className="finance-field-help mt-3">Enter each amount with two decimal places and a whole meal count from 1 to 60.</p>}
        {preview && <div className="mt-5 rounded-xl bg-slate-50 p-5"><p className="text-2xl font-bold">₹{preview.total} total</p><p className="mt-2 text-sm">{preview.notice}</p><details className="mt-3"><summary className="cursor-pointer font-semibold">Meal and tax breakdown</summary>{previewRows?.success ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Meal</th><th className="p-2">Food + GST</th><th className="p-2">Delivery + GST</th><th className="p-2">Platform + GST</th><th className="p-2">Chef payable</th><th className="p-2">Customer total</th></tr></thead><tbody>{previewRows.data.map((row, index) => <tr key={row.occurrenceId} className="border-t"><td className="p-2">{index + 1}</td><td className="p-2">₹{row.food.base} + ₹{row.food.amount}</td><td className="p-2">₹{row.delivery.base} + ₹{row.delivery.amount}</td><td className="p-2">₹{row.platform.base} + ₹{row.platform.amount}</td><td className="p-2">₹{row.chef.payable}</td><td className="p-2 font-semibold">₹{row.total}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm">A compatible meal breakdown was not returned. Refresh before using this preview.</p>}</details></div>}
      </section>
      <section hidden={section !== "all" && section !== "payments"} className="rounded-2xl border border-slate-200 bg-white p-6"><details><summary className="cursor-pointer text-xl font-semibold">Manage an operational payout hold</summary>
        <p className="mt-2 text-sm text-slate-600">RazorpayX bank automation remains paused. Use these controls only for an independent financial or operational hold. Releasing one cannot bypass bank validation, unresolved refunds or source conflicts.</p>
        <label className="mt-4 block text-sm">Chef identity UUID<input className={inputClass} disabled={busy} value={chefId} onChange={event => setChefId(event.target.value)} /></label>
        <label className="mt-4 block text-sm">Reason for this hold or release<textarea className={inputClass} rows={2} maxLength={1000} disabled={busy} value={holdReason} onChange={event => setHoldReason(event.target.value)} placeholder="Explain the operational reason for this chef." /></label><div className="mt-4 flex flex-wrap gap-3">
          {[true, false].map(onHold => <button type="button" key={String(onHold)} className={buttonClass} disabled={busy || !holdReason.trim() || !z.string().uuid().safeParse(chefId).success} onClick={() => void run(async () => {await api(`chefs/${chefId}/hold`, {onHold, reason: holdReason});setMessage(onHold ? "Operational payout hold applied." : "Operational hold released; independent bank and financial checks still apply.");})}>{onHold ? "Hold payouts" : "Release operational hold"}</button>)}</div><p className="finance-field-help mt-3">Select a valid chef identity and enter a reason. Releasing a hold keeps the bank and financial checks in place.</p></details>
      </section>
      <section hidden={section !== "all" && section !== "payments"} className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Recent payout instructions</h2><button type="button" className="rounded-lg border px-3 py-2" disabled={busy} onClick={() => void run(async () => {setPayouts(z.array(payoutSchema).parse(await api("payouts")));setPayoutError("");})}>Refresh</button></div>
        {payoutLoading && <p role="status" className="finance-progress"><span className="finance-spinner" aria-hidden="true" />Loading payout instructions…</p>}{payoutError && <p role="alert" className="mt-3 text-sm">{payoutError}</p>}
        <p className="mt-2 text-sm text-slate-600">Latest 100. Reserved or processing is not confirmed bank payment. Unknown outcomes must not be bypassed with a fresh transfer.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Instruction</th><th className="p-2">Amount</th><th className="p-2">Channel / mode</th><th className="p-2">State</th><th className="p-2">Transfer evidence</th></tr></thead><tbody>{payouts.map(row => <tr key={row.id} className="border-t"><td className="p-2 font-mono text-xs">{row.id}</td><td className="p-2">₹{row.amount}</td><td className="p-2">{row.payoutChannel === "CRAVES_MANUAL" ? "Craves manual" : "RazorpayX"} / {row.mode.toLowerCase()}</td><td className="p-2"><span className="finance-status-badge">{row.status.replaceAll("_", " ")}</span></td><td className="p-2">{row.transferReference || "Not confirmed"}</td></tr>)}</tbody></table>{!payoutLoading && !payoutError && payouts.length === 0 && <p className="py-4 text-sm">No new-engine payout instructions returned.</p>}</div>
      </section>
    </>}
  </div>;
}
