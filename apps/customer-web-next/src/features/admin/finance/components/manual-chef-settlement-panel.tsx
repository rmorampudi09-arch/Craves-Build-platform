"use client";
import { ChefAccountingBreakdown } from "@/features/chef/components/chef-accounting-breakdown";

import { useEffect, useRef, useState } from "react";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { rupees, statusOf } from "@/features/admin/finance/lib/insights-contract";
import { manualActionSchema, manualBalanceSchema, manualInstructionSchema, manualReservationSchema, type ManualAction, type ManualBalance, type ManualInstruction } from "@/features/admin/finance/lib/manual-settlement-contract";

const labels: Record<ManualAction["action"], string> = {
  AUTHORIZE_TRANSFER: "Approve the bank transfer", CONFIRM_PAID: "Record that the bank paid it",
  MARK_UNKNOWN: "Record that the outcome isn't known yet", CANCEL_RESERVATION: "Cancel and release the money",
  CONFIRM_NOT_SENT: "Record that no money left the bank", CONFIRM_REVERSED: "Record that the bank returned the money",
};
const next = (status: ManualInstruction["status"]): ManualAction["action"] => status === "RESERVED" ? "AUTHORIZE_TRANSFER" : status === "PAID" ? "CONFIRM_REVERSED" : "CONFIRM_PAID";

/**
 * Paying one chef by bank transfer. This screen never sends money: an admin sets the amount aside, pays from the Craves bank
 * account, then records what the bank did. Every write keeps one request key until its fields change, so a retry cannot
 * record the same step twice.
 */
export function ManualChefSettlementPanel({ chefId, onChanged }: { chefId: string; onChanged?: () => void }) {
  const [balance, setBalance] = useState<ManualBalance | null>(null);
  const [selected, setSelected] = useState<ManualInstruction | null>(null);
  const [action, setAction] = useState<ManualAction["action"]>("AUTHORIZE_TRANSFER");
  const [reason, setReason] = useState("");const [destination, setDestination] = useState("");
  const [evidence, setEvidence] = useState("");const [bankReference, setBankReference] = useState("");
  const [paidAt, setPaidAt] = useState("");const [amount, setAmount] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);const [busy, setBusy] = useState(false);const [message, setMessage] = useState("");
  const pending = useRef<{path: string; body: unknown} | null>(null);
  function edit(update: () => void) {pending.current = null;setAcknowledged(false);update();}
  async function load() {
    const response = await fetch(`/api/admin/finance/chefs/${chefId}/manual-settlement`, {cache: "no-store"});
    if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again." : response.status === 403 ? "Your account can't record chef payments." : "This chef's balance couldn't be loaded.");
    const fresh = manualBalanceSchema.parse(await response.json());setBalance(fresh);
    setSelected(previous => previous ? fresh.recent.find(row => row.id === previous.id) || null : null);
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true);setMessage("");try {await operation();} catch (error) {setMessage(error instanceof Error ? error.message : "The step wasn't confirmed. Refresh before trying again.");} finally {setBusy(false);}
  }
  async function post(path: string, body: unknown) {
    if (!pending.current) pending.current = {path, body};
    const request = pending.current;
    const response = await fetch(`/api/admin/finance/${request.path}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(request.body)});
    if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again." : "The step wasn't confirmed. Refresh and check where this payout stands. Trying again with the same details is safe: it can't be recorded twice.");
    const result = manualInstructionSchema.parse(await response.json());pending.current = null;setSelected(result);setAction(next(result.status));setAmount(result.amount);setAcknowledged(false);await load();
    setMessage(`Recorded: ${statusOf("CHEF_PAYOUT", result.status).label.toLowerCase()}. This screen does not send money.`);onChanged?.();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per chef; the parent remounts this panel for another chef
  useEffect(() => {void run(load);}, [chefId]);
  const money = action === "CONFIRM_PAID" || action === "CONFIRM_REVERSED";
  const allowed = selected ? selected.status === "RESERVED" ? ["AUTHORIZE_TRANSFER", "CANCEL_RESERVATION"]
    : selected.status === "SUBMITTING" ? ["CONFIRM_PAID", "MARK_UNKNOWN", "CONFIRM_NOT_SENT"]
    : ["UNKNOWN", "REVIEW_REQUIRED"].includes(selected.status) ? ["CONFIRM_PAID", "CONFIRM_NOT_SENT"]
    : selected.status === "PAID" ? ["CONFIRM_REVERSED"] : [] : [];
  function pick(row: ManualInstruction) {edit(() => {setSelected(row);setAction(next(row.status));setAmount(row.amount);setPaidAt("");setEvidence("");setBankReference("");setDestination("");});}
  const stepOpen = selected !== null && allowed.length > 0;
  const note = message && <p role="status" className="fn-small" style={{ color: "var(--fn-ink)" }}>{message}</p>;
  const blocked = !balance ? "" : !balance.enabled ? "Paying chefs by bank transfer is switched off in Settings." : balance.onHold ? "This chef's money is on hold, so nothing can be set aside."
    : balance.manualRequestUsedToday ? "This chef already had today's payout set aside. One is allowed per chef per day." : balance.available === "0.00" ? "Nothing is ready to pay to this chef right now." : "";
  return <section className="fn-form" aria-busy={busy}>
    <h3>Pay by bank transfer</h3>
    <p className="fn-small">This screen never sends money or checks a bank account. Set the amount aside, pay the chef from the Craves bank account, then record here what the bank did.</p>
    {!balance && !message && <div className="fn-skeleton" role="status" aria-label="Loading this chef's balance"><span /><span /><span /></div>}
    {!balance && message && <>{note}<div><button type="button" className="cr-button" disabled={busy} onClick={() => void run(load)}>Try again</button></div></>}
    {balance && <>
      <dl className="fn-sum"><div><dt>Ready to pay now</dt><dd>{rupees(balance.available)}</dd></div></dl>
      <label className="fn-field">Why this step is being taken (kept in the record)<textarea maxLength={1000} value={reason} disabled={busy} onChange={event => edit(() => setReason(event.target.value))} /></label>
      {blocked ? <p className="fn-small" role="status">{blocked}</p> : <button type="button" className="cr-button cr-primary" disabled={busy} onClick={() => void run(async () => {
        const body = manualReservationSchema.safeParse({requestKey: crypto.randomUUID(), expectedAvailableAmount: balance.available, reason});
        if (!body.success) throw new Error("First write why this payout is being made, in the box above.");
        await post(`chefs/${chefId}/manual-settlements`, body.data);
      })}>Set aside {rupees(balance.available)} for this chef</button>}
      {!stepOpen && note}
      {balance.recent.length > 0 && <div><h3>This chef’s bank payouts</h3><table className="fn-table"><tbody>{balance.recent.map(row => {
        const status = statusOf("CHEF_PAYOUT", row.status);
        return <tr key={row.id} data-selected={selected?.id === row.id ? "true" : undefined} onClick={() => !busy && pick(row)}>
          <td><button type="button" className="fn-rowbtn" disabled={busy} aria-pressed={selected?.id === row.id}><strong className="fn-num">{rupees(row.amount)}</strong>
            <small>{formatAdminTimestamp(row.paidAt ?? row.createdAt)}{row.bankReference ? ` · ${row.bankReference}` : ""}</small></button></td>
          <td><span className="fn-status" data-tone={status.tone}>{status.label}</span></td></tr>;
      })}</tbody></table></div>}
      <details className="fn-details"><summary>Earnings and payments so far, as the chef sees them</summary><div style={{ marginTop: 10 }}><ChefAccountingBreakdown accounting={balance.accounting} /></div></details>
    </>}
    {selected && stepOpen && <div className="fn-form" style={{ borderTop: "1px solid var(--fn-line)", paddingTop: 14 }}>
      <h3>Next step for the {rupees(selected.amount)} payout</h3>
      <label className="fn-field">What happened<select value={action} disabled={busy} onChange={event => edit(() => setAction(event.target.value as ManualAction["action"]))}>{allowed.map(value => <option key={value} value={value}>{labels[value as ManualAction["action"]]}</option>)}</select></label>
      {action === "AUTHORIZE_TRANSFER" && <label className="fn-field">Where the chef’s bank details were checked<input maxLength={240} value={destination} disabled={busy} onChange={event => edit(() => setDestination(event.target.value))} />
        <span>Name the record or ticket that confirms this chef and account. Never type a bank account number here.</span></label>}
      {(money || action === "CONFIRM_NOT_SENT") && <label className="fn-field">Where the bank proof is kept<input maxLength={240} value={evidence} disabled={busy} onChange={event => edit(() => setEvidence(event.target.value))} />
        <span>For example the bank statement entry or the file name of the receipt.</span></label>}
      {money && <>
        <label className="fn-field">Amount the bank moved, in rupees<input inputMode="decimal" value={amount} disabled={busy} onChange={event => edit(() => setAmount(event.target.value))} /></label>
        <label className="fn-field">When the bank did it (India time)<input type="datetime-local" value={paidAt} disabled={busy} onChange={event => edit(() => setPaidAt(event.target.value))} /></label>
        <label className="fn-field">Bank reference (UTR), if the bank gave one<input value={bankReference} maxLength={160} disabled={busy} onChange={event => edit(() => setBankReference(event.target.value))} /></label>
      </>}
      <label style={{ display: "flex", alignItems: "start", gap: 10, fontSize: 13 }}><input type="checkbox" style={{ marginTop: 3 }} checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} />
        <span>I checked the chef, the exact amount and the bank’s own record. Not being sure is not the same as a failed payment.</span></label>
      <button type="button" className="cr-button cr-primary" disabled={busy || !acknowledged || !allowed.includes(action)} onClick={() => void run(async () => {
        if (!reason.trim()) throw new Error("First write why this step is being taken, in the box at the top.");
        const body = manualActionSchema.safeParse({actionKey: crypto.randomUUID(), expectedVersion: selected.version, action, reason,
          destinationReference: action === "AUTHORIZE_TRANSFER" ? destination : null,
          evidenceReference: money || action === "CONFIRM_NOT_SENT" ? evidence : null,
          // The picker gives India wall-clock time without a zone; the record needs the +05:30 offset spelled out.
          bankReference: money && bankReference.trim() ? bankReference : null, amount: money ? amount : null,
          paidAt: money ? `${paidAt.length === 16 ? `${paidAt}:00` : paidAt}+05:30` : null});
        if (!body.success) throw new Error("Something is missing or not in the right form. Fill in every field for this step; the amount needs two decimals, like 338.52.");
        await post(`manual-settlements/${selected.id}/actions`, body.data);
      })}>{labels[action]}</button>
      {note}
    </div>}
  </section>;
}
