"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { manualActionSchema, manualBalanceSchema, manualInstructionSchema, manualReservationSchema, type ManualAction, type ManualBalance, type ManualInstruction } from "@/lib/manual-settlement-contract";
const chefsSchema = z.array(z.object({identityId: z.string().uuid(), displayName: z.string().max(250)})).max(2000);
const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950";
const button = "rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-40";
const labels: Record<ManualAction["action"], string> = {
  AUTHORIZE_TRANSFER: "Authorize external bank transfer", CONFIRM_PAID: "Record confirmed bank payment",
  MARK_UNKNOWN: "Record uncertain bank outcome", CANCEL_RESERVATION: "Cancel unsent reservation",
  CONFIRM_NOT_SENT: "Record confirmed no-debit outcome", CONFIRM_REVERSED: "Record returned bank funds",
};
export function ManualChefSettlementPanel() {
  const [chefs, setChefs] = useState<z.infer<typeof chefsSchema>>([]);
  const [chef, setChef] = useState("");const [balance, setBalance] = useState<ManualBalance | null>(null);
  const [selected, setSelected] = useState<ManualInstruction | null>(null);
  const [action, setAction] = useState<ManualAction["action"]>("AUTHORIZE_TRANSFER");
  const [reason, setReason] = useState("");const [destination, setDestination] = useState("");
  const [evidence, setEvidence] = useState("");const [bankReference, setBankReference] = useState("");
  const [paidAt, setPaidAt] = useState("");const [amount, setAmount] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);const [busy, setBusy] = useState(false);const [message, setMessage] = useState("");
  const pending = useRef<{path: string; body: unknown} | null>(null);
  useEffect(() => {let active = true;fetch("/api/admin/subscription-plans/chefs", {cache: "no-store"}).then(async response => {
    if (!response.ok) throw new Error("Approved chef list is unavailable.");const rows = chefsSchema.parse(await response.json());if (active) setChefs(rows);
  }).catch(() => {if (active) setMessage("Approved chef list is unavailable. Retry after restoring your session.");});return () => {active = false;};}, []);
  function edit(update: () => void) {pending.current = null;setAcknowledged(false);update();}
  async function load() {
    const response = await fetch(`/api/admin/finance/chefs/${chef}/manual-settlement`, {cache: "no-store"});
    if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again." : "Manual settlement data is unavailable.");
    const next = manualBalanceSchema.parse(await response.json());setBalance(next);
    setSelected(previous => previous ? next.recent.find(row => row.id === previous.id) || null : null);
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true);setMessage("");try {await operation();} catch (error) {setMessage(error instanceof Error ? error.message : "Settlement outcome was not confirmed. Refresh before retrying.");} finally {setBusy(false);}
  }
  async function post(path: string, body: unknown) {
    if (!pending.current) pending.current = {path, body};
    const request = pending.current;
    const response = await fetch(`/api/admin/finance/${request.path}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request.body)});
    if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again." : "The action was not confirmed. Refresh and check the current state. Retrying unchanged fields uses the same request key.");
    const result = manualInstructionSchema.parse(await response.json());pending.current = null;setSelected(result);setAction(result.status === "RESERVED" ? "AUTHORIZE_TRANSFER" : result.status === "PAID" ? "CONFIRM_REVERSED" : "CONFIRM_PAID");setAmount(result.amount);setAcknowledged(false);await load();
    setMessage(`Settlement recorded as ${result.status.replaceAll("_", " ")}. This screen does not send bank transfers.`);
  }
  const money = action === "CONFIRM_PAID" || action === "CONFIRM_REVERSED";
  const allowed = selected ? selected.status === "RESERVED" ? ["AUTHORIZE_TRANSFER", "CANCEL_RESERVATION"]
    : selected.status === "SUBMITTING" ? ["CONFIRM_PAID", "MARK_UNKNOWN", "CONFIRM_NOT_SENT"]
    : ["UNKNOWN", "REVIEW_REQUIRED"].includes(selected.status) ? ["CONFIRM_PAID", "CONFIRM_NOT_SENT"]
    : selected.status === "PAID" ? ["CONFIRM_REVERSED"] : [] : [];
  return <section className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h2 className="text-xl font-semibold">Manual Craves chef payments</h2>
    <p className="text-sm text-slate-600">Reserve the verified payable before paying through the approved Craves bank account. Record the actual outcome and evidence here. No button on this page sends money or verifies a bank account.</p>
    <label className="block text-sm">Approved chef<select className={input} value={chef} disabled={busy} onChange={event => edit(() => {setChef(event.target.value);setBalance(null);setSelected(null);})}><option value="">Select a chef</option>{chefs.map(row => <option key={row.identityId} value={row.identityId}>{row.displayName}</option>)}</select></label>
    <button type="button" className={button} disabled={busy || !chef} onClick={() => void run(load)}>Load current balance and payments</button>
    {balance && <><p className="text-lg font-semibold">Available for manual payment: ₹{balance.available}</p>
      <p className="text-sm">{balance.onHold ? "An independent financial hold blocks a new transfer." : "No current financial hold."} {balance.enabled ? "Manual settlement is enabled." : "Manual settlement is not enabled."}</p>
      <label className="block text-sm">Operator reason<textarea className={input} maxLength={1000} value={reason} disabled={busy} onChange={event => edit(() => setReason(event.target.value))} /></label>
      <button type="button" className={button} disabled={busy || !reason.trim() || !balance.enabled || balance.onHold || balance.manualRequestUsedToday || balance.available === "0.00"} onClick={() => void run(async () => {
        const body = manualReservationSchema.parse({requestKey: crypto.randomUUID(), expectedAvailableAmount: balance.available, reason});
        await post(`chefs/${chef}/manual-settlements`, body);
      })}>Reserve ₹{balance.available} for this chef</button>
      {balance.manualRequestUsedToday && <p className="text-sm">This chef has already used today’s accepted withdrawal. Existing instructions remain available for reconciliation.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Instruction</th><th className="p-2">Amount</th><th className="p-2">State</th><th className="p-2">Bank reference</th></tr></thead><tbody>{balance.recent.map(row => <tr key={row.id} className="border-t"><td className="p-2"><button type="button" className="text-left underline" disabled={busy} onClick={() => edit(() => {setSelected(row);setAction(row.status === "RESERVED" ? "AUTHORIZE_TRANSFER" : row.status === "PAID" ? "CONFIRM_REVERSED" : "CONFIRM_PAID");setAmount(row.amount);setPaidAt("");setEvidence("");setBankReference("");setDestination("");})}>{row.id}</button></td><td className="p-2">₹{row.amount}</td><td className="p-2">{row.status}</td><td className="p-2">{row.bankReference || "Not confirmed"}</td></tr>)}</tbody></table></div>
    </>}
    {selected && allowed.length > 0 && <div className="space-y-4 border-t pt-5">
      <p className="break-all text-sm">Selected instruction: {selected.id} · ₹{selected.amount} · version {selected.version}</p>
      <label className="block text-sm">Record action<select className={input} value={action} disabled={busy} onChange={event => edit(() => setAction(event.target.value as ManualAction["action"]))}>{allowed.map(value => <option key={value} value={value}>{labels[value as ManualAction["action"]]}</option>)}</select></label>
      {action === "AUTHORIZE_TRANSFER" && <label className="block text-sm">Approved destination evidence reference<input className={input} maxLength={240} value={destination} disabled={busy} onChange={event => edit(() => setDestination(event.target.value))} /><span className="text-xs">Reference the secured record confirming this chef and destination; do not enter bank account numbers here.</span></label>}
      {(money || action === "CONFIRM_NOT_SENT") && <label className="block text-sm">Bank outcome evidence reference<input className={input} maxLength={240} value={evidence} disabled={busy} onChange={event => edit(() => setEvidence(event.target.value))} /></label>}
      {money && <div className="grid gap-4 md:grid-cols-3"><label className="text-sm">Actual amount, INR<input className={input} inputMode="decimal" value={amount} disabled={busy} onChange={event => edit(() => setAmount(event.target.value))} /></label><label className="text-sm">Actual bank timestamp, ISO 8601<input className={input} value={paidAt} disabled={busy} placeholder="YYYY-MM-DDTHH:mm:ss+05:30" onChange={event => edit(() => setPaidAt(event.target.value))} /></label><label className="text-sm">UTR / bank reference, when available<input className={input} value={bankReference} maxLength={160} disabled={busy} onChange={event => edit(() => setBankReference(event.target.value))} /></label></div>}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /><span>I checked the selected chef, exact amount and actual bank evidence. An uncertain outcome is not proof of failure, and this action records an external operation.</span></label>
      <button type="button" className={button} disabled={busy || !acknowledged || !reason.trim() || !allowed.includes(action)} onClick={() => void run(async () => {
        const body = manualActionSchema.parse({actionKey: crypto.randomUUID(), expectedVersion: selected.version, action, reason,
          destinationReference: action === "AUTHORIZE_TRANSFER" ? destination : null,
          evidenceReference: money || action === "CONFIRM_NOT_SENT" ? evidence : null,
          bankReference: money && bankReference.trim() ? bankReference : null, amount: money ? amount : null, paidAt: money ? paidAt : null});
        await post(`manual-settlements/${selected.id}/actions`, body);
      })}>{labels[action]}</button>
    </div>}
    {message && <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm">{message}</p>}
  </section>;
}
