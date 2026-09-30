"use client";

import { useEffect, useState } from "react";
import { bankControlsSchema, type BankControls } from "@/lib/bank-onboarding-contract";
import { financeErrorMessage } from "@/lib/finance-operation-feedback";

export function BankAutomationAdminPanel() {
  const [data, setData] = useState<BankControls | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  async function load() {
    const response = await fetch("/api/admin/finance/bank-onboarding", {cache: "no-store"});
    if (!response.ok) throw new Error(financeErrorMessage(response.status));
    return bankControlsSchema.parse(await response.json());
  }
  useEffect(() => {let active = true;load().then(value => {if (active) setData(value);}).catch(error => {if (active) setMessage(error instanceof Error ? error.message : "Bank status is unavailable.");}).finally(() => {if (active) setBusy(false);});return () => {active = false;};}, []);
  async function refresh() {
    if (busy) return;setBusy(true);setMessage("");
    try {setData(await load());} catch (error) {setMessage(error instanceof Error ? error.message : "Bank status is unavailable.");} finally {setBusy(false);}
  }
  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900" aria-busy={busy}>
    <div className="finance-section-heading"><h2 className="text-xl font-semibold">Chef bank onboarding</h2><span className="finance-vendor-pending">Disabled · vendor approval pending</span></div>
    <p className="text-sm text-slate-600">RazorpayX activation is pending with the vendor. Bank automation settings are read-only until approval. Continue using the approved manual Craves payment workflow.</p>
    {busy && <p role="status" className="finance-progress"><span className="finance-spinner" aria-hidden="true" />Loading recorded bank status…</p>}
    {message && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
    {data && <>
      <div className="grid gap-3 md:grid-cols-3">{([
        ["Accept bank submissions", data.submissionsEnabled ? "Recorded as enabled" : "Paused"],
        ["Automatic bank validation", data.validationEnabled ? "Recorded as enabled" : "Paused"],
        ["Daily bank changes", `${data.maximumRequestsPerDay} per rolling 24 hours`],
      ] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>)}</div>
      {(data.submissionsEnabled || data.validationEnabled) && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">The service reports enabled bank controls. Vendor approval is still pending; this screen does not activate or confirm the provider. Check the deployed service configuration before using automation.</p>}
      <details className="rounded-xl bg-slate-50 p-4 text-sm"><summary className="cursor-pointer font-semibold">Technical readiness · revision {data.revision}</summary><div className="mt-3 space-y-2"><p>Encrypted storage: {data.encryptionReady ? "configured" : "not configured"}</p><p>Provider adapter: {data.providerReady ? "configured" : "not configured"}</p><p>Worker deployed: {data.workerDeployed ? "yes" : "no"}</p><p className="text-slate-600">Configuration readiness does not confirm merchant entitlement or a completed bank validation.</p></div></details>
      <h3 className="text-lg font-semibold">Existing bank enrollments</h3><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Chef identity</th><th className="p-2">Account ending</th><th className="p-2">Status</th><th className="p-2">Outcome</th></tr></thead><tbody>{data.recent.map(row => <tr className="border-t" key={row.chefId}><td className="p-2 font-mono text-xs">{row.chefId}</td><td className="p-2">{row.bank.lastFour || "—"}</td><td className="p-2"><span className="finance-status-badge">{row.bank.state.replaceAll("_", " ")}</span></td><td className="p-2">{row.bank.message}</td></tr>)}</tbody></table></div>
      {data.recent.length === 0 && <p className="text-sm text-slate-500">No bank enrollments were returned by the service.</p>}
    </>}
    <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40">{busy ? "Loading status…" : "Refresh bank status"}</button>
  </section>;
}
