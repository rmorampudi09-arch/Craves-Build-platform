"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { draftSchema, financeSettingsSchema, financeViewSchema, subscriptionPreviewSchema, type FinanceSettings, type FinanceView } from "@/features/admin/finance/lib/finance-contract";
import { DeliveryTariffEditor } from "@/features/admin/finance/components/delivery-tariff-editor";
import { reviewedPolicyMatches } from "@/features/admin/finance/lib/finance-policy-review";

async function api(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/admin/finance/${path}`, {method: body === undefined ? "GET" : "POST", cache: "no-store",
    ...(body === undefined ? {} : {headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)})});
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({detail: z.string().optional(), code: z.string().optional()}).safeParse(data);
    throw new Error(error.success ? error.data.detail || error.data.code || "That didn’t go through. Try again." : "That didn’t go through. Try again.");
  }
  return data;
}
const numericFields: {key: keyof FinanceSettings; label: string; integer?: boolean}[] = [
  {key: "automaticPayoutDelayHours", label: "Hours after delivery before an automatic payout", integer: true},
  {key: "manualAvailabilityDelayHours", label: "Hours after delivery before an earning can be paid on request", integer: true},
  {key: "customerCancellationSeconds", label: "Seconds a customer has to cancel after ordering", integer: true},
  {key: "chefFeePercent", label: "Chef service fee, percent"},
  {key: "restaurantGstPercent", label: "GST on restaurant food, percent"},
  {key: "deliveryGstPercent", label: "GST on delivery charges, percent"},
  {key: "platformGstPercent", label: "GST on the platform fee, percent"},
  {key: "chefFeeGstPercent", label: "GST on the chef service fee, percent"},
  {key: "platformFee", label: "Platform fee per order or meal-plan purchase, in rupees"},
];
const switches: {key: keyof FinanceSettings; label: string}[] = [
  {key: "ledgerEnabled", label: "Record order money and chef earnings"}, {key: "automaticPayoutsEnabled", label: "Pay chefs automatically through RazorpayX"},
  {key: "manualWithdrawalsEnabled", label: "Pay chefs on request, including by bank transfer"}, {key: "subscriptionQuotesEnabled", label: "Meal-plan price quotes"},
];
/** The backend's reasons these settings do not fully apply yet, in plain words. An unknown reason is shown as it came. */
const notReady: Record<string, string> = {
  AUTHORITATIVE_ORDER_SNAPSHOT_AND_CAPTURE_WIRING_NOT_CERTIFIED: "Order money is not yet recorded from confirmed payments. That is switched on in the Craves technical setup, not on this page.",
  JOURNAL_POSTING_DISABLED: "Writing to the books is switched off in the Craves technical setup.",
  DISTANCE_TARIFF_CHECKOUT_WIRING_NOT_CERTIFIED: "Checkout does not use the delivery price by distance yet.",
  VERIFIED_ROAD_ROUTE_DISTANCE_NOT_CONNECTED: "Road distance is not connected, so a delivery price by road distance cannot be used.",
  COMMISSION_GST_TREATMENT_AND_TAX_CLASSIFICATION_UNCONFIRMED: "Decide how GST applies to the chef service fee, and write down where that decision is recorded.",
  RAZORPAYX_ACCOUNT_PAYOUT_PERMISSION_NOT_CERTIFIED: "Automatic payouts through RazorpayX are not set up for the Craves account yet.",
  MANUAL_SETTLEMENT_RUNTIME_NOT_CERTIFIED: "Paying chefs by bank transfer is not switched on in the Craves technical setup yet.",
};
const longDate = (day: string) => new Intl.DateTimeFormat("en-IN", {day: "numeric", month: "long", year: "numeric", timeZone: "UTC"}).format(new Date(`${day}T00:00:00Z`));
const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950";
const buttonClass = "rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40";

/** Fees, taxes and payout rules, on the Finance Settings tab. Paying and holding a chef live on the Payouts tab. */
export function FinanceControlCenter() {
  const [view, setView] = useState<FinanceView | null>(null);
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [draft, setDraft] = useState<z.infer<typeof draftSchema> | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("Loading the finance settings…");
  const [busy, setBusy] = useState(false);
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
    }).catch(error => {if (active) setMessage(error instanceof Error ? error.message : "The finance settings couldn’t be loaded.");});
    return () => {active = false;};
  }, []);
  function edit(key: keyof FinanceSettings, value: FinanceSettings[keyof FinanceSettings]) {
    setSettings(previous => previous ? {...previous, [key]: value} : previous);setDraft(null);setPreview(null);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);setMessage("");
    try {await action();} catch (error) {setMessage(error instanceof Error ? error.message : "That didn’t go through. Try again.");}
    finally {setBusy(false);}
  }
  return <div className="space-y-6 text-slate-900">
    {message && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4">{message}</p>}
    {!settings || !view ? <button type="button" className={buttonClass} onClick={() => window.location.reload()}>Load the settings again</button> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Settings in use now</h2>
        <p className="mt-2 text-sm">Version {view.revision}. {view.releaseStatus === "NOT_ACTIVATED" ? "Recording of order money and chef earnings is switched off in these settings."
          : `Recording is switched on in these settings for orders from ${longDate(view.settings.ledgerStartDate)}, India time. That alone does not prove it is running: the Overview tab shows whether earnings are being recorded.`}</p>
        <p className="mt-2 text-sm">A chef can have one payout set aside per day, India time. Money that was sent, or whose outcome isn’t known, stays set aside until the bank’s answer is recorded.</p>
        {view.activationBlockers.length > 0 && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm"><h3 className="font-semibold">Not ready yet</h3>{view.activationBlockers.map(item => <p className="mt-2" key={item}>{notReady[item] ?? item.replaceAll("_", " ").toLowerCase()}</p>)}</div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Change the settings</h2>
        <p className="mt-2 text-sm text-slate-600">A change applies to new orders only: orders already accepted and earnings already recorded keep their numbers. Switching payouts off never stops the checking of transfers already sent.</p>
        <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
        <div className="mt-5 grid gap-4 md:grid-cols-2">{switches.map(field => <label key={field.key} className="flex items-center justify-between gap-4 rounded-xl border p-4"><span>{field.label}</span><input aria-label={field.label} type="checkbox" checked={settings[field.key] === true} onChange={event => edit(field.key, event.target.checked)} className="h-5 w-5" /></label>)}</div>
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium">Record earnings for orders from, India date<input className={inputClass} type="date" value={settings.ledgerStartDate} onChange={event => edit("ledgerStartDate", event.target.value)} /></label>
          {numericFields.map(field => <label className="text-sm font-medium" key={field.key}>{field.label}<input className={inputClass} type="number" min="0" step={field.integer ? "1" : "0.01"} value={String(settings[field.key])} onChange={event => edit(field.key, field.integer ? event.target.valueAsNumber : event.target.value)} /></label>)}
          <label className="text-sm font-medium">How GST applies to the chef service fee<select className={inputClass} value={settings.chefFeeTaxTreatment} onChange={event => edit("chefFeeTaxTreatment", event.target.value as FinanceSettings["chefFeeTaxTreatment"])}><option value="UNCONFIRMED">Not decided yet (these settings can’t be switched on)</option><option value="INCLUSIVE">GST is inside the service fee</option><option value="EXCLUSIVE">GST is added on top of the service fee</option></select></label>
          <label className="text-sm font-medium">Where the tax decision is written down<input className={inputClass} maxLength={240} value={settings.taxApprovalReference || ""} onChange={event => edit("taxApprovalReference", event.target.value.trim() || null)} /></label>
        </div>
        <p className="mt-4 text-sm">{settings.chefFeeTaxTreatment === "INCLUSIVE" ? `Chefs are charged ${settings.chefFeePercent}% in all, with GST inside it. Nothing is added on top. Tax held back from a chef (TDS) is separate from this fee.` : `Choose “GST is inside the service fee” to keep everything a chef is charged within ${settings.chefFeePercent}%.`}</p>
        <DeliveryTariffEditor value={settings.deliveryTariff} gstRate={settings.deliveryGstPercent} disabled={busy} onChange={value => edit("deliveryTariff", value)} />
        <label className="mt-5 block text-sm font-medium">Why this change is being made, and who approved it<textarea className={inputClass} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={buttonClass} disabled={busy || !reason.trim()} onClick={() => void run(async () => {
          setDraft(null);
          const checked=financeSettingsSchema.safeParse(settings);
          if(!checked.success)throw new Error("Fill in every rate, charge and delivery price before saving. Charges need two decimals, like 21.21.");
          const saved=draftSchema.parse(await api("policies", {settings: checked.data, reason}));
          if(!reviewedPolicyMatches(checked.data,saved.settings))throw new Error("What was saved does not match what you entered, so it can’t be switched on. Load this page again and check the values.");
          setDraft(saved);setMessage("Draft saved. Check the values, then switch them on.");
        })}>Save as a draft</button>
          <button type="button" className={buttonClass} disabled={busy || !draft || !reason.trim()} onClick={() => void run(async () => {if (!draft) return;const next = financeViewSchema.parse(await api(`policies/${draft.id}/activate`, {expectedRevision: view.revision, expectedHash: draft.contentHash, reason}));setView(next);setSettings(next.settings);setDraft(null);setMessage("The new settings are recorded. Anything listed under “Not ready yet” still has to be done before they fully apply.");})}>Switch these settings on</button>
        </div>{draft && <p className="mt-3 break-all font-mono text-xs">Draft reference: {draft.contentHash}</p>}
        </fieldset>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Try a meal-plan price</h2><p className="mt-2 text-sm text-slate-600">Enter a chef’s price per meal and the delivery charge before GST to see what a customer would pay in total. The platform fee is charged once per purchase. Nothing is bought and no earning is created.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-4"><label>Chef’s price per meal<input className={inputClass} value={foodBase} onChange={event => setFoodBase(event.target.value)} inputMode="decimal" /></label><label>Menu price per meal<input className={inputClass} value={customerFood} onChange={event => setCustomerFood(event.target.value)} inputMode="decimal" /></label><label>Delivery per meal, before GST<input className={inputClass} value={delivery} onChange={event => setDelivery(event.target.value)} inputMode="decimal" /></label><label>Number of meals<input className={inputClass} type="number" min="1" max="60" value={mealCount} onChange={event => setMealCount(event.target.valueAsNumber)} /></label></div>
        <button type="button" className={`${buttonClass} mt-4`} disabled={busy || !Number.isInteger(mealCount) || mealCount < 1 || mealCount > 60} onClick={() => void run(async () => {setPreview(subscriptionPreviewSchema.parse(await api("subscription-preview", {settings, occurrences: Array.from({length: mealCount}, (_, i) => ({occurrenceId: `preview-meal-${i + 1}`, chefFoodBase: foodBase, customerFoodPrice: customerFood, deliveryEstimate: delivery}))})));})}>Work out the total, taxes included</button>
        {preview && <div className="mt-5 rounded-xl bg-slate-50 p-5"><p className="text-2xl font-bold">₹{preview.total} in total</p><p className="mt-2 text-sm">{preview.notice}</p><details className="mt-3"><summary className="cursor-pointer font-semibold">Meal-by-meal working</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(preview.occurrences, null, 2)}</pre></details></div>}
      </section>
    </>}
  </div>;
}
