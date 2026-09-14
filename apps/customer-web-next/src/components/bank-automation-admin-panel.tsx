"use client";

import { useEffect, useState } from "react";
import { bankControlsSchema, type BankControls } from "@/lib/bank-onboarding-contract";

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
    if (!response.ok) throw new Error("Bank automation status is unavailable or your role is not authorized.");
    return bankControlsSchema.parse(await response.json());
  }
  useEffect(() => {let active = true;load().then(value => {if (active) apply(value);}).catch(error => {if (active) setMessage(error.message);});return () => {active = false;};}, []);
  async function save() {
    if (!data || busy) return;setBusy(true);setMessage("");
    try {
      const response = await fetch("/api/admin/finance/bank-onboarding", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({
        expectedRevision: data.revision, submissionsEnabled: submissions, validationEnabled: validation, maximumRequestsPerDay: maximum, reason,
      })});
      if (!response.ok) throw new Error("Settings were not activated. Check runtime/provider prerequisites and refresh the current revision.");
      apply(bankControlsSchema.parse(await response.json()));setMessage("Bank automation settings saved with an audit record.");
    } catch (error) {setMessage(error instanceof Error ? error.message : "Configuration unavailable");} finally {setBusy(false);}
  }
  return <section className="mb-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h2 className="text-2xl font-bold">Automatic chef bank onboarding</h2>
    <p className="text-sm text-slate-600">Chefs enter their bank details in registration. Razorpay creates the recipient, validates the account and supplies the result. Matching successful validations activate automatically. There is no routine manual bank-verification queue.</p>
    {message && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
    {data && <><div className="rounded-xl bg-slate-50 p-4 text-sm"><p>Encrypted storage: {data.encryptionReady ? "configured" : "not configured"} · Provider adapter: {data.providerReady ? "configured" : "not configured"} · Worker deployed: {data.workerDeployed ? "yes" : "no"}</p>
      <p className="mt-2">Configuration readiness is not proof of merchant entitlement or a completed bank validation. Live validation may incur Razorpay fees. Penniless mode does not make an account-credit transfer; the provider can still charge for the service.</p></div>
      <div className="grid gap-4 md:grid-cols-3"><label className="flex items-center gap-3 rounded-xl border p-4"><input type="checkbox" checked={submissions} onChange={event => setSubmissions(event.target.checked)} disabled={busy} />Accept bank submissions</label>
        <label className="flex items-center gap-3 rounded-xl border p-4"><input type="checkbox" checked={validation} onChange={event => setValidation(event.target.checked)} disabled={busy} />Run automatic validation</label>
        <label className="rounded-xl border p-4 text-sm">New bank versions per rolling 24 hours<input type="number" min={1} max={10} value={maximum} disabled={busy} onChange={event => setMaximum(event.target.valueAsNumber)} className="mt-2 w-full rounded-lg border p-2" /></label></div>
      <label className="block text-sm">Reason for configuration change<textarea className="mt-2 w-full rounded-xl border p-3" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></label>
      <button type="button" disabled={busy || !reason.trim() || !Number.isInteger(maximum) || maximum < 1 || maximum > 10} onClick={() => void save()} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40">Save automation settings</button>
      <h3 className="text-lg font-semibold">Latest bank enrollments</h3><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Chef identity</th><th className="p-2">Account ending</th><th className="p-2">Status</th><th className="p-2">Outcome</th></tr></thead><tbody>{data.recent.map(row => <tr className="border-t" key={row.chefId}><td className="p-2 font-mono text-xs">{row.chefId}</td><td className="p-2">{row.bank.lastFour || "—"}</td><td className="p-2">{row.bank.state}</td><td className="p-2">{row.bank.message}</td></tr>)}</tbody></table></div>
      {data.recent.length === 0 && <p className="text-sm">No submitted bank enrollments returned.</p>}
    </>}
    <button type="button" disabled={busy} onClick={() => {setBusy(true);void load().then(apply).catch(error => setMessage(error.message)).finally(() => setBusy(false));}} className="rounded-xl border px-4 py-2 text-sm">Refresh automation status</button>
  </section>;
}
