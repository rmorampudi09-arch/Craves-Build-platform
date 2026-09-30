"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { financeErrorMessage } from "@/lib/finance-operation-feedback";
import { canonicalFinanceId, sourceStatusSchema, taxProfileRequestSchema, taxProfileVersionSchema, type ChefTaxProfile } from "@/lib/finance-source-contract";
const chefList = z.array(z.object({identityId: canonicalFinanceId, displayName: z.string().max(250)})).max(2000);
const control = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950";
const button = "rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40";
function initialProfile(): ChefTaxProfile {
  const today = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date());
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0);
  return {stateCode: "36", supplyRegime: "RESTAURANT_ECO_9_5", registrationStatus: "UNREGISTERED", gstin: null,
    declaredAggregateTurnover: "0.00", financialYear: `${year}-${String(year + 1).slice(-2)}`, declarationDate: today,
    withholdingRate: "0", withholdingEvidence: "", classificationEvidence: "", feeTermsEvidence: ""};
}
export function ChefTaxProfilePanel() {
  const [chef, setChef] = useState("");const [chefs, setChefs] = useState<z.infer<typeof chefList>>([]);
  const [chefsLoading, setChefsLoading] = useState(true);const [chefsError, setChefsError] = useState("");
  const [progress, setProgress] = useState("");
  const [profile, setProfile] = useState<ChefTaxProfile>(() => initialProfile());const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<z.infer<typeof sourceStatusSchema> | null>(null);
  useEffect(() => {let active = true;fetch("/api/admin/subscription-plans/chefs", {cache: "no-store"}).then(async response => {if (!response.ok) throw new Error(financeErrorMessage(response.status));const parsed = chefList.parse(await response.json());if (active) setChefs(parsed);}).catch(error => {if (active) setChefsError(error instanceof Error ? error.message : "Approved chef list is unavailable.");}).finally(() => {if (active) setChefsLoading(false);});return () => {active = false;};}, []);
  useEffect(() => {
    if (!canonicalFinanceId.safeParse(chef).success) return;
    let active = true;
    setBusy(true);setProgress("Loading the chef’s saved tax profile…");
    fetch(`/api/admin/finance/chefs/${chef}/tax-profile`, {cache: "no-store"}).then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? "No saved tax profile was found. Review the chef’s declaration and evidence before saving their first version." : financeErrorMessage(response.status));
      const result = taxProfileVersionSchema.parse(await response.json());
      if (active) {setProfile(result.profile);setMessage(result.registrationReview.replaceAll("_", " "));}
    }).catch(error => {if (active) setMessage(error instanceof Error ? error.message : "The chef’s tax profile is unavailable.");}).finally(() => {if (active) {setBusy(false);setProgress("");}});
    return () => {active = false;};
  }, [chef]);
  async function run(action: () => Promise<void>, label = "Loading finance data…") {if (busy) return;setBusy(true);setProgress(label);setMessage("");try {await action();} catch (error) {setMessage(error instanceof Error ? error.message : "Finance operation failed");} finally {setBusy(false);setProgress("");}}
  async function load() {
    const response = await fetch(`/api/admin/finance/chefs/${chef}/tax-profile`, {cache: "no-store"});
    if (!response.ok) throw new Error(response.status === 404 ? "No saved tax profile was found. Review the chef’s declaration and evidence before saving their first version." : financeErrorMessage(response.status));
    const result = taxProfileVersionSchema.parse(await response.json());setProfile(result.profile);setMessage(result.registrationReview.replaceAll("_", " "));
  }
  async function save() {
    const request = taxProfileRequestSchema.parse({profile, reason});
    const response = await fetch(`/api/admin/finance/chefs/${chef}/tax-profile`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request)});
    if (!response.ok) throw new Error(financeErrorMessage(response.status));
    const result = taxProfileVersionSchema.parse(await response.json());setProfile(result.profile);setMessage(`Version ${result.id} saved. ${result.registrationReview.replaceAll("_", " ")}. Existing orders retain their original profile and fee snapshot.`);
  }
  const checked = taxProfileRequestSchema.safeParse({profile, reason});
  const requiredProfileFields = [["withholdingEvidence", "withholding assessment reference"], ["classificationEvidence", "restaurant and registration assessment reference"], ["feeTermsEvidence", "accepted fee terms reference"]] as const;
  const validation = !canonicalFinanceId.safeParse(chef).success ? "Select an approved chef before saving." : !reason.trim() ? "Enter a review reason before saving." : requiredProfileFields.some(([key]) => !profile[key].trim()) ? `Add the ${requiredProfileFields.find(([key]) => !profile[key].trim())?.[1]}.` : !checked.success ? "Check the GSTIN, turnover, financial year, declaration date and withholding rate before saving." : "The reviewed profile will be saved as a new version; existing order snapshots remain unchanged.";
  return <section className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900" aria-busy={busy || chefsLoading}>
    <h2 className="text-xl font-semibold">Chef tax classification and fee terms</h2>
    <p className="text-sm text-slate-600">This launch profile covers reviewed Telangana restaurant supplies through Craves. Customer food GST is paid by Craves as the e-commerce operator; it is not deducted again from chef food earnings. GST on Craves’ service fee is a separate charge governed by the accepted fee terms. Income-tax withholding is separate again.</p>
    {chefsLoading && <p role="status" className="finance-progress"><span className="finance-spinner" aria-hidden="true" />Loading approved chefs…</p>}{chefsError && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">{chefsError}</p>}{!chefsLoading && !chefsError && chefs.length === 0 && <p className="text-sm text-slate-500">No approved chefs were returned.</p>}
    <label className="block text-sm font-medium">Approved chef<select className={control} value={chefs.some(item => item.identityId === chef) ? chef : ""} disabled={busy || chefsLoading} onChange={event => {setChef(event.target.value);setProfile(initialProfile());setReason("");setMessage("");}}><option value="">Select a chef</option>{chefs.map(item => <option key={item.identityId} value={item.identityId}>{item.displayName}</option>)}</select></label>
    <details><summary className="cursor-pointer text-sm text-slate-500">Use a chef identity reference</summary><label className="mt-3 block text-sm font-medium">Chef identity reference<input className={control} value={chef} disabled={busy} onChange={event => {setChef(event.target.value.trim());setProfile(initialProfile());setReason("");setMessage("");}} /></label></details>
    <button className={button} disabled={busy || !canonicalFinanceId.safeParse(chef).success} onClick={() => void run(load, "Loading the chef’s saved tax profile…")}>{busy ? "Loading…" : "Refresh existing profile"}</button>
    {progress && <p role="status" className="finance-progress"><span className="finance-spinner" aria-hidden="true" />{progress}</p>}
    <fieldset disabled={busy || !canonicalFinanceId.safeParse(chef).success} className="m-0 min-w-0 space-y-5 border-0 p-0">
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm font-medium">GST registration<select className={control} value={profile.registrationStatus} onChange={event => setProfile({...profile, registrationStatus: event.target.value as ChefTaxProfile["registrationStatus"], gstin: null})}><option value="UNREGISTERED">Unregistered — supported restaurant regime</option><option value="REGISTERED">Registered</option></select></label>
      <label className="text-sm font-medium">GSTIN, when registered<input className={control} disabled={profile.registrationStatus !== "REGISTERED"} value={profile.gstin || ""} maxLength={15} onChange={event => setProfile({...profile, gstin: event.target.value.toUpperCase() || null})} /></label>
      <label className="text-sm font-medium">Declared aggregate annual turnover, INR<input className={control} inputMode="decimal" value={profile.declaredAggregateTurnover} onChange={event => setProfile({...profile, declaredAggregateTurnover: event.target.value})} /></label>
      <label className="text-sm font-medium">Financial year<input className={control} value={profile.financialYear} onChange={event => setProfile({...profile, financialYear: event.target.value})} placeholder="2026-27" /></label>
      <label className="text-sm font-medium">Declaration date<input className={control} type="date" value={profile.declarationDate} onChange={event => setProfile({...profile, declarationDate: event.target.value})} /></label>
      <label className="text-sm font-medium">Separately reviewed income-tax withholding, percent<input className={control} inputMode="decimal" value={profile.withholdingRate} onChange={event => setProfile({...profile, withholdingRate: event.target.value})} /></label>
      {([['withholdingEvidence', 'Withholding assessment reference, including an approved zero'], ['classificationEvidence', 'Restaurant and registration assessment reference'], ['feeTermsEvidence', 'Accepted Craves fee and fee-GST terms reference']] as const).map(([key, label]) => <label key={key} className="text-sm font-medium">{label}<input className={control} value={profile[key]} maxLength={240} onChange={event => setProfile({...profile, [key]: event.target.value})} /></label>)}
    </div>
    <p className="text-sm text-slate-600">Use aggregate turnover across relevant channels, not just Craves receipts. The ₹20 lakh review threshold in this Telangana service profile is not a government verification or an exemption from GST on purchased platform services. No tax is deducted solely because a turnover number crosses a threshold.</p>
    <label className="block text-sm font-medium">Review reason<textarea className={control} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></label>
    <button className={button} disabled={busy || !canonicalFinanceId.safeParse(chef).success || !checked.success} onClick={() => void run(save, "Saving the reviewed chef tax profile…")}>{busy ? "Saving…" : "Save reviewed tax profile"}</button><p className="finance-field-help">{validation}</p></fieldset>
    {message && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
    <div className="border-t pt-5"><h3 className="font-semibold">Order-to-ledger runtime evidence</h3><button className={`${button} mt-3`} disabled={busy} onClick={() => void run(async () => {const response = await fetch("/api/admin/finance/source-status", {cache: "no-store"});if (!response.ok) throw new Error("Source status is unavailable. Retry loading its recorded counters.");setStatus(sourceStatusSchema.parse(await response.json()));})}>Refresh source counters</button>
      {status && <div className="mt-4 space-y-2 text-sm"><p>Finalization worker: {status.finalizationEnabled ? "enabled" : "disabled"}. Captured checkouts: {status.capturedCheckouts}. Posted chef earnings: {status.postedEarnings}.</p><p>{status.activationNotice}</p>{status.states.map(row => <p key={`${row.state}/${row.lastResult}`}>{row.state} · {row.lastResult} · {row.count}</p>)}{status.exceptions.map((row, index) => <p key={`${row.chefOrderId}/${index}`} className="break-all text-red-800">{row.chefOrderId}: {row.reason}</p>)}</div>}
    </div>
  </section>;
}
