"use client";

import { useEffect, useState } from "react";
import { bankControlsSchema, type BankControls } from "@/features/admin/finance/lib/bank-onboarding-contract";

export function BankAutomationAdminPanel() {
  const [data, setData] = useState<BankControls | null>(null);
  const [submissions, setSubmissions] = useState(false);
  const [validation, setValidation] = useState(false);
  const [maximum, setMaximum] = useState(3);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function apply(value: BankControls) {setData(value);setSubmissions(value.submissionsEnabled);setValidation(value.validationEnabled);setMaximum(value.maximumRequestsPerDay);}
  async function load() {
    const response = await fetch("/api/admin/finance/bank-onboarding", {cache: "no-store"});
    if (!response.ok) throw new Error("The bank-check settings couldn’t be loaded, or your account isn’t allowed to see them.");
    return bankControlsSchema.parse(await response.json());
  }
  useEffect(() => {let active = true;load().then(value => {if (active) apply(value);}).catch(error => {if (active) setMessage(error.message);});return () => {active = false;};}, []);
  async function save() {
    if (!data || busy) return;setBusy(true);setMessage("");
    try {
      const response = await fetch("/api/admin/finance/bank-onboarding", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({
        expectedRevision: data.revision, submissionsEnabled: submissions, validationEnabled: validation, maximumRequestsPerDay: maximum, reason,
      })});
      if (!response.ok) throw new Error("The settings weren’t saved. Something they depend on isn’t ready, or someone changed them first. Refresh and try again.");
      apply(bankControlsSchema.parse(await response.json()));setMessage("Saved. The change and your reason are on record.");
    } catch (error) {setMessage(error instanceof Error ? error.message : "The settings couldn’t be saved. Try again.");} finally {setBusy(false);}
  }
  return <section className="mb-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h2 className="text-xl font-semibold">Checking chefs’ bank accounts</h2>
    <p className="text-sm text-slate-600">Chefs enter their bank details when they register. Razorpay checks the account and reports back, and an account that passes is switched on by itself. Nobody approves bank details by hand.</p>
    {message && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
    {data && <><div className="rounded-xl bg-slate-50 p-4 text-sm"><p>Secure storage: {data.encryptionReady ? "ready" : "not ready"} · Razorpay connection: {data.providerReady ? "ready" : "not ready"} · Background checker: {data.workerDeployed ? "running" : "not running"}</p>
      <p className="mt-2">“Ready” means the setup is in place. It does not mean Razorpay has approved the Craves account for these checks, or that any bank account has been checked. Razorpay may charge for each check, even one that sends no test rupee.</p></div>
      <div className="grid gap-4 md:grid-cols-3"><label className="flex items-center gap-3 rounded-xl border p-4"><input type="checkbox" checked={submissions} onChange={event => setSubmissions(event.target.checked)} disabled={busy} />Let chefs submit bank details</label>
        <label className="flex items-center gap-3 rounded-xl border p-4"><input type="checkbox" checked={validation} onChange={event => setValidation(event.target.checked)} disabled={busy} />Check accounts automatically</label>
        <label className="rounded-xl border p-4 text-sm">Times a chef may change bank details in 24 hours<input type="number" min={1} max={10} value={maximum} disabled={busy} onChange={event => setMaximum(event.target.valueAsNumber)} className="mt-2 w-full rounded-lg border p-2" /></label></div>
      <label className="block text-sm">Why this is being changed (kept in the record)<textarea className="mt-2 w-full rounded-xl border p-3" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></label>
      <button type="button" disabled={busy || !reason.trim() || !Number.isInteger(maximum) || maximum < 1 || maximum > 10} onClick={() => void save()} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40">Save these settings</button>
      <h3 className="text-lg font-semibold">Bank details submitted most recently</h3><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Chef ID</th><th className="p-2">Account ending</th><th className="p-2">Status</th><th className="p-2">What happened</th></tr></thead><tbody>{data.recent.map(row => <tr className="border-t" key={row.chefId}><td className="p-2 font-mono text-xs">{row.chefId}</td><td className="p-2">{row.bank.lastFour || "—"}</td><td className="p-2">{row.bank.state.replaceAll("_", " ").toLowerCase()}</td><td className="p-2">{row.bank.message}</td></tr>)}</tbody></table></div>
      {data.recent.length === 0 && <p className="text-sm">No chef has submitted bank details yet.</p>}
    </>}
    <button type="button" disabled={busy} onClick={() => {setBusy(true);void load().then(apply).catch(error => setMessage(error.message)).finally(() => setBusy(false));}} className="rounded-xl border px-4 py-2 text-sm">Refresh</button>
  </section>;
}
