"use client";

import { useState } from "react";
import { z } from "zod";
import { payoutReconcileRequestSchema, payoutReconcileResponseSchema } from "@/lib/finance-reconciliation-contract";
import { financeErrorMessage } from "@/lib/finance-operation-feedback";

export function FinanceReconciliationPanel() {
  const [instructionId, setInstructionId] = useState("");
  const [providerPayoutId, setProviderPayoutId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const valid = z.string().uuid().safeParse(instructionId).success && payoutReconcileRequestSchema.safeParse({providerPayoutId, reason}).success;
  async function reconcile() {
    if (busy || !valid) return;
    setBusy(true);setMessage("");
    try {
      const response = await fetch(`/api/admin/finance/payouts/${instructionId}/reconcile`, {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({providerPayoutId, reason}),
      });
      if (!response.ok) {const error = z.object({code: z.string().optional()}).safeParse(await response.json().catch(() => null));throw new Error(financeErrorMessage(response.status, error.success ? error.data.code : undefined));}
      const result = payoutReconcileResponseSchema.parse(await response.json());
      if (result.instructionId !== instructionId) throw new Error("Reconciliation response did not match the selected instruction.");
      setMessage(`${result.status}: ${result.notice}`);
    } catch (error) {setMessage(error instanceof Error ? error.message : "Reconciliation unavailable; original funds remain protected.");}
    finally {setBusy(false);}
  }
  const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950";
  return <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900" aria-busy={busy}><details>
    <summary className="cursor-pointer text-lg font-semibold">Advanced · check an existing RazorpayX payout</summary><div className="mt-4 space-y-4">
    <p className="text-sm text-slate-600">Use the original RazorpayX payout ID from verified provider evidence. This action fetches its status; it never creates a new transfer. A confirmed reversal creates a linked correction and keeps the chef on hold before any replacement payout.</p>
    <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Craves instruction UUID<input className={input} disabled={busy} value={instructionId} onChange={event => setInstructionId(event.target.value.trim())} /></label>
      <label className="text-sm font-medium">Existing RazorpayX payout ID<input className={input} disabled={busy} value={providerPayoutId} onChange={event => setProviderPayoutId(event.target.value.trim())} placeholder="pout_…" /></label></div>
    <label className="block text-sm font-medium">Reason and verification evidence<textarea className={input} maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>
    <button type="button" disabled={busy || !valid} onClick={() => void reconcile()} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40">{busy ? "Checking original payout…" : "Fetch and reconcile original payout"}</button><p className="finance-field-help">{!valid ? "Enter a valid Craves instruction UUID, the original pout_ provider reference and a verification reason." : "This checks only the original payout. It does not activate RazorpayX or create a new transfer."}</p>
    {message && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">{message}</p>}
  </div></details></section>;
}
