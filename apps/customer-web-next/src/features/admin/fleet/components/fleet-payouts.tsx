"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { readableFleetValue } from "@/features/admin/fleet/lib/fleet-common";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import {
  addDays, adjustmentRequest, batchesSchema, cancelBatchSchema, cancelledBatchSchema, createBatchSchema, createHoldSchema, formatPaise,
  holdSchema, holdsSchema, istDay, PAY_COMPONENTS, payAdjustmentSchema, paiseToRupees, payoutBatchSchema, payoutSchema, releaseOnProblem,
  toCsv, utrSchema, type AdjustmentForm, type Hold, type PayComponent, type Payout, type PayoutBatch, type PayoutBatchSummary,
} from "@/features/admin/fleet/lib/payout-contract";
import { ActionMessage, fieldClass, labelClass, ReasonAction, useFleetAction } from "./fleet-action";

const KIND_LABELS = { WEEKLY: "Weekly (Monday)", DAILY_WITHDRAWAL: "Daily withdrawals" } as const;
const when = (value: string | null) => value ? formatAdminTimestamp(value) : "—";

function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

export function FleetPayouts() {
  const [batches, setBatches] = useState<PayoutBatchSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading payout batches…");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const page = await fleetGet("payout-batches", batchesSchema);
      setBatches(page.batches);
      setMessage(page.batches.length ? "" : "No payout batches yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payout batches are unavailable.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-6">
    <CreateBatch onCreated={async batch => { setNotice(""); await load(); setSelected(batch.batchId); }} />
    <section className="cr-panel" aria-labelledby="fleet-batches-title">
      <h2 id="fleet-batches-title" className="text-lg font-bold">Payout batches</h2>
      {notice && <p className="cr-feedback" role="status">{notice}</p>}
      {message && <p className="cr-empty" role="status">{message}</p>}
      {batches.length > 0 && <div className="cr-table-scroll"><table className="cr-table">
        <thead><tr><th scope="col">Pay date</th><th scope="col">Kind</th><th scope="col">Status</th><th scope="col">Total</th><th scope="col">Payouts</th><th scope="col">Created by</th><th scope="col">Approved by</th><th scope="col"><span className="cr-sr-only">Open</span></th></tr></thead>
        <tbody>{batches.map(batch => <tr key={batch.batchId}>
          <td>{batch.payoutDate}</td><td>{KIND_LABELS[batch.kind]}</td><td><span className="cr-status">{readableFleetValue(batch.status)}</span></td>
          <td>{formatPaise(batch.totalPaise)}</td><td>{batch.payoutCount}</td><td>{batch.createdBy}{batch.createdByMe ? " (you)" : ""}</td><td>{batch.approvedBy ?? "—"}</td>
          <td><button type="button" className="cr-button" aria-label={`Open the ${batch.payoutDate} ${KIND_LABELS[batch.kind]} batch`} onClick={() => setSelected(batch.batchId)}>Open</button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    {selected && <BatchDetail key={selected} batchId={selected} onChanged={load}
      onCancelled={async text => { setSelected(null); setNotice(text); await load(); }} />}
    <Holds />
    <AdjustPay />
  </div>;
}

function CreateBatch({ onCreated }: { onCreated: (batch: PayoutBatch) => Promise<void> }) {
  const [kind, setKind] = useState<"WEEKLY" | "DAILY_WITHDRAWAL">("WEEKLY");
  const [payoutDate, setPayoutDate] = useState(() => istDay());
  const action = useFleetAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createBatchSchema.safeParse({ kind, payoutDate });
    if (!parsed.success) return action.refuse(parsed.error.issues[0]?.message ?? "Check the details.");
    const batch = await action.run("POST", "payout-batches", payoutBatchSchema, parsed.data, "Payout file created. Check it below, then a second payments admin approves it.");
    if (batch) await onCreated(batch);
  }

  return <form className="cr-panel space-y-3" onSubmit={event => void submit(event)}>
    <h2 className="text-lg font-bold">Create a payout file</h2>
    <p className="cr-muted">Weekly: every rider&apos;s whole withdrawable balance, paid by IMPS on Monday, no minimum. Daily: the free once-a-day withdrawals not yet paid. Riders with no payout account or a zero or negative balance are left out; a negative balance is recovered from future earnings, never from the bank.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>Kind<select className={fieldClass} value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
        <option value="WEEKLY">{KIND_LABELS.WEEKLY}</option><option value="DAILY_WITHDRAWAL">{KIND_LABELS.DAILY_WITHDRAWAL}</option>
      </select></label>
      <label className={labelClass}>Pay date<input className={fieldClass} type="date" value={payoutDate} onChange={event => setPayoutDate(event.target.value)} /></label>
    </div>
    <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Create payout file</button>
    <ActionMessage state={action.state} />
  </form>;
}

function BatchDetail({ batchId, onChanged, onCancelled }: { batchId: string; onChanged: () => Promise<void>; onCancelled: (notice: string) => Promise<void> }) {
  const [batch, setBatch] = useState<PayoutBatch | null>(null);
  const [message, setMessage] = useState("Loading the batch…");
  const action = useFleetAction();

  const load = useCallback(async () => {
    try { setBatch(await fleetGet(`payout-batches/${batchId}`, payoutBatchSchema)); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "This batch is unavailable."); }
  }, [batchId]);
  useEffect(() => { void load(); }, [load]);

  async function step(verb: "approve" | "mark-sent", question: string, success: string) {
    if (!window.confirm(question)) return;
    const next = await action.run("POST", `payout-batches/${batchId}/${verb}`, payoutBatchSchema, undefined, success);
    if (next) { setBatch(next); await onChanged(); }
  }
  const refresh = async () => { await load(); await onChanged(); };

  if (!batch) return <p className="cr-panel" role="status">{message}</p>;
  const exportRows = () => downloadCsv(`rider-payouts-${batch.payoutDate}-${batch.kind.toLowerCase()}-status.csv`, toCsv([
    ["payoutId", "riderName", "amountRupees", "account", "status", "utr", "failureReason", "markedBy", "markedAt"],
    ...batch.payouts.map(row => [row.payoutId, row.riderName, paiseToRupees(row.amountPaise), row.maskedAccount, row.status, row.utr, row.failureReason, row.markedBy, row.markedAt]),
  ]));

  return <section className="cr-panel space-y-4" aria-labelledby="fleet-batch-title">
    <div className="flex flex-wrap items-center gap-3">
      <h2 id="fleet-batch-title" className="text-lg font-bold">{KIND_LABELS[batch.kind]} · {batch.payoutDate}</h2>
      <span className="cr-status">{readableFleetValue(batch.status)}</span>
      <span>{formatPaise(batch.totalPaise)} to {batch.payoutCount} rider{batch.payoutCount === 1 ? "" : "s"}</span>
    </div>
    <p className="cr-muted">Created by {batch.createdBy}{batch.createdByMe ? " (you)" : ""} · {when(batch.createdAt)}{batch.approvedBy ? ` · approved by ${batch.approvedBy} · ${when(batch.approvedAt)}` : ""}{batch.sentAt ? ` · sent ${when(batch.sentAt)}` : ""}</p>
    <div className="flex flex-wrap items-center gap-2">
      <a className="cr-button" href={`/api/admin/fleet/payout-batches/${batch.batchId}/file`} download>Download bank file (CSV)</a>
      <button type="button" className="cr-button" onClick={exportRows}>Export status and UTRs (CSV)</button>
      {batch.status === "CREATED" && <button type="button" className="cr-button cr-primary" disabled={action.busy || batch.createdByMe}
        onClick={() => void step("approve", `Approve ${formatPaise(batch.totalPaise)} to ${batch.payoutCount} riders as the second approver?`, "Batch approved. Upload the file to the bank, then mark it sent.")}>Approve as second approver</button>}
      {batch.status === "APPROVED" && <button type="button" className="cr-button cr-primary" disabled={action.busy}
        onClick={() => void step("mark-sent", "Mark this batch sent? Do this only after the approved file is uploaded to the bank.", "Batch marked sent. Add each UTR as the bank confirms it.")}>Mark sent to the bank</button>}
      {(batch.status === "CREATED" || batch.status === "APPROVED") && <CancelBatch batch={batch} onCancelled={onCancelled} />}
    </div>
    {batch.status === "CREATED" && batch.createdByMe && <p className="cr-alert">You created this batch, so a different payments admin must approve it.</p>}
    <ActionMessage state={action.state} />
    {message && <p className="cr-error-text" role="alert">{message}</p>}
    <div className="cr-table-scroll"><table className="cr-table">
      <thead><tr><th scope="col">Rider</th><th scope="col">Amount</th><th scope="col">Account</th><th scope="col">Status</th><th scope="col">UTR or reason</th><th scope="col">Action</th></tr></thead>
      <tbody>{batch.payouts.map(payout => <PayoutRow key={payout.payoutId} batchId={batch.batchId} payout={payout} canMark={batch.status === "SENT"} onDone={refresh} />)}</tbody>
    </table></div>
  </section>;
}

function PayoutRow({ batchId, payout, canMark, onDone }: { batchId: string; payout: Payout; canMark: boolean; onDone: () => Promise<void> }) {
  const [utr, setUtr] = useState("");
  const action = useFleetAction();
  const base = `payout-batches/${batchId}/payouts/${payout.payoutId}`;

  async function saveUtr(event: FormEvent) {
    event.preventDefault();
    const parsed = utrSchema.safeParse({ utr });
    if (!parsed.success) return action.refuse(parsed.error.issues[0]?.message ?? "Check the UTR.");
    if (await action.run("POST", `${base}/utr`, payoutSchema, parsed.data, "Marked paid.")) await onDone();
  }
  async function fail(reason: string) {
    if (await action.run("POST", `${base}/fail`, payoutSchema, { reason }, "Marked failed. The money stays in the rider's balance for the next batch.")) await onDone();
  }
  async function reverse(reason: string) {
    if (await action.run("POST", `${base}/reverse`, payoutSchema, { reason },
      "Reversal recorded. The money is back in the rider's balance; their payouts pause until ops sets the payout account again with them.")) await onDone();
  }

  return <tr>
    <td><Link className="underline" href={`/admin/riders/${payout.riderId}`}>{payout.riderName}</Link></td>
    <td>{formatPaise(payout.amountPaise)}</td><td>{payout.maskedAccount}</td>
    <td><span className="cr-status" data-tone={payout.status === "FAILED" ? "danger" : undefined}>{readableFleetValue(payout.status)}</span></td>
    <td>{payout.status === "FAILED" ? payout.failureReason ?? "—" : payout.utr ?? "—"}
      {payout.status === "FAILED" && payout.utr ? <span className="cr-muted"> · UTR {payout.utr}</span> : null}
      {payout.markedBy ? <span className="cr-muted"> · {payout.markedBy}</span> : null}</td>
    <td>{payout.status === "PENDING" && canMark ? <div className="space-y-2">
      <form className="flex flex-wrap gap-2" onSubmit={event => void saveUtr(event)}>
        <label className="cr-sr-only" htmlFor={`utr-${payout.payoutId}`}>UTR for {payout.riderName}</label>
        <input id={`utr-${payout.payoutId}`} className="rounded-lg border border-slate-300 px-2 py-1" value={utr} maxLength={22} placeholder="UTR" autoComplete="off" onChange={event => setUtr(event.target.value)} />
        <button type="submit" className="cr-button" disabled={action.busy}>Save UTR</button>
      </form>
      <ReasonAction label="Mark failed" action={action} onSubmit={reason => void fail(reason)} />
    </div> : payout.status === "PENDING" ? <span className="cr-muted">After the batch is sent</span>
      : payout.status === "PAID" ? <ReasonAction label="Record bank reversal" action={action} onSubmit={reason => void reverse(reason)} /> : null}
      <ActionMessage state={action.state} /></td>
  </tr>;
}

/** Only a file never uploaded to the bank: the admin says why and confirms it was not uploaded. */
function CancelBatch({ batch, onCancelled }: { batch: PayoutBatch; onCancelled: (notice: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notUploaded, setNotUploaded] = useState(false);
  const action = useFleetAction();
  const weekly = batch.kind === "WEEKLY";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = cancelBatchSchema.safeParse({ reason, notUploaded });
    if (!parsed.success) return action.refuse(parsed.error.issues[0]?.message ?? "Check the details.");
    const cancelled = await action.run("POST", `payout-batches/${batch.batchId}/cancel`, cancelledBatchSchema, parsed.data, "");
    if (cancelled) await onCancelled(`Cancelled the ${batch.payoutDate} ${KIND_LABELS[batch.kind]} file: ${cancelled.payoutCount} payout${cancelled.payoutCount === 1 ? "" : "s"}, ${formatPaise(cancelled.totalPaise)}. `
      + (weekly ? "Make the file again once the mistake is fixed." : "The withdrawals go in the next daily file."));
  }

  if (!open) return <button type="button" className="cr-button" disabled={action.busy} onClick={() => setOpen(true)}>Cancel this payout file</button>;
  return <form className="w-full space-y-2 rounded-xl border border-slate-200 p-3" onSubmit={event => void submit(event)}>
    <p className="text-sm">Cancel only a file that was never uploaded to the bank. {weekly
      ? "Its payouts go back to the riders' balances and this week's debt recoveries are undone, so the next weekly file pays them."
      : "The riders' withdrawals stay requested and go in the next daily file."}</p>
    <label className={labelClass}>Why cancel it<textarea className={fieldClass} value={reason} maxLength={1000} rows={2} onChange={event => setReason(event.target.value)} /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notUploaded} onChange={event => setNotUploaded(event.target.checked)} />I checked: this file was not uploaded to the bank.</label>
    <span className="cr-actions">
      <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Cancel the file</button>
      <button type="button" className="cr-button" disabled={action.busy} onClick={() => setOpen(false)}>Back</button>
    </span>
    <ActionMessage state={action.state} />
  </form>;
}

const NEW_ADJUSTMENT: AdjustmentForm = { tripId: "", component: "drop-km", direction: "TAKE_BACK", rupees: "", reason: "" };

/** A signed correction to one pay line of a trip whose pay is credited; the rider sees it with the reason. */
function AdjustPay() {
  const [form, setForm] = useState<AdjustmentForm>(NEW_ADJUSTMENT);
  const [notice, setNotice] = useState("");
  const action = useFleetAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    const request = adjustmentRequest(form);
    if (typeof request === "string") return action.refuse(request);
    const amount = request.body.amountPaise;
    const change = amount < 0 ? `take back ${formatPaise(-amount)}` : `pay ${formatPaise(amount)} more`;
    if (!window.confirm(`${PAY_COMPONENTS[request.body.component]}: ${change} on this trip? The rider sees it with your reason.`)) return;
    const adjusted = await action.run("POST", `trips/${request.tripId}/pay-adjustments`, payAdjustmentSchema, request.body, "");
    if (adjusted) {
      setForm(NEW_ADJUSTMENT);
      setNotice(`Adjusted ${PAY_COMPONENTS[request.body.component]} on ${adjusted.orderCode} by ${formatPaise(adjusted.amountPaise)}. `
        + (adjusted.amountPaise < 0 ? "The rider owes it: it comes out of future pay, at most the weekly recovery cap a week, never from their bank."
          : "It is withdrawable after 24 hours, less TDS when TDS is on."));
    }
  }

  return <form noValidate className="cr-panel grid gap-3 sm:grid-cols-2" aria-labelledby="fleet-adjust-title" onSubmit={event => void submit(event)}>
    <h2 id="fleet-adjust-title" className="text-lg font-bold sm:col-span-2">Adjust a trip&apos;s pay</h2>
    <p className="cr-muted sm:col-span-2">Correct one pay line of a trip whose pay is credited, such as a wrong drop distance. The rider sees the change and your reason on the trip. Pay taken back comes out of future pay only, at most the weekly recovery cap a week. The trip ID is on the rider&apos;s recent offers and on the support issue.</p>
    <label className={labelClass}>Trip ID<input className={fieldClass} value={form.tripId} maxLength={36} autoComplete="off" onChange={event => setForm({ ...form, tripId: event.target.value })} /></label>
    <label className={labelClass}>Pay line<select className={fieldClass} value={form.component} onChange={event => setForm({ ...form, component: event.target.value as PayComponent })}>
      {Object.entries(PAY_COMPONENTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <label className={labelClass}>Change<select className={fieldClass} value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value as AdjustmentForm["direction"] })}>
      <option value="TAKE_BACK">Take back (the rider was overpaid)</option><option value="PAY">Pay more (the rider was underpaid)</option>
    </select></label>
    <label className={labelClass}>Amount, ₹<input className={fieldClass} value={form.rupees} inputMode="decimal" maxLength={9} autoComplete="off" onChange={event => setForm({ ...form, rupees: event.target.value })} /></label>
    <label className={`${labelClass} sm:col-span-2`}>Reason (the rider sees it)<input className={fieldClass} value={form.reason} maxLength={1000} onChange={event => setForm({ ...form, reason: event.target.value })} /></label>
    <span className="sm:col-span-2"><button type="submit" className="cr-button cr-primary" disabled={action.busy}>Adjust pay</button><ActionMessage state={action.state} /></span>
    {notice && <p className="cr-feedback sm:col-span-2" role="status">{notice}</p>}
  </form>;
}

function Holds() {
  const [state, setState] = useState<"ACTIVE" | "RELEASED">("ACTIVE");
  const [holds, setHolds] = useState<Hold[]>([]);
  const [message, setMessage] = useState("Loading holds…");
  const [form, setForm] = useState({ tripId: "", reason: "", releaseOn: "" });
  const [notice, setNotice] = useState("");
  const create = useFleetAction();

  const load = useCallback(async () => {
    try {
      const page = await fleetGet(`holds?state=${state}`, holdsSchema);
      setHolds(page.holds);
      setMessage(page.holds.length ? "" : state === "ACTIVE" ? "No pay is on hold." : "No released holds yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Holds are unavailable.");
    }
  }, [state]);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = { tripId: form.tripId.trim(), reason: form.reason, releaseOn: form.releaseOn };
    const parsed = createHoldSchema.safeParse(input);
    if (!parsed.success) return create.refuse(parsed.error.issues[0]?.path[0] === "tripId" ? "Paste the trip ID of the order to hold." : parsed.error.issues[0]?.message ?? "Check the details.");
    const problem = releaseOnProblem(parsed.data.releaseOn);
    if (problem) return create.refuse(problem);
    if (await create.run("POST", "holds", holdSchema, parsed.data, "Hold placed. Only this trip's pay is held.")) {
      setForm({ tripId: "", reason: "", releaseOn: "" });
      await load();
    }
  }

  const exportHolds = () => downloadCsv(`rider-pay-holds-${state.toLowerCase()}-${istDay()}.csv`, toCsv([
    ["holdId", "orderCode", "riderName", "amountRupees", "reason", "releaseOn", "state", "createdBy", "releasedBy", "releasedAt"],
    ...holds.map(hold => [hold.holdId, hold.orderCode, hold.riderName, paiseToRupees(hold.amountPaise), hold.reason, hold.releaseOn, hold.state, hold.createdBy, hold.releasedBy, hold.releasedAt]),
  ]));

  return <section className="cr-panel space-y-4" aria-labelledby="fleet-holds-title">
    <h2 id="fleet-holds-title" className="text-lg font-bold">Pay holds</h2>
    <p className="cr-muted">A hold covers one trip&apos;s pay only, with a reason the rider sees, and is released by the date you set: at most 7 days.</p>
    <div className="flex flex-wrap gap-2">
      {(["ACTIVE", "RELEASED"] as const).map(value => <button key={value} type="button" aria-pressed={state === value} className={`cr-button ${state === value ? "cr-primary" : ""}`} onClick={() => setState(value)}>{readableFleetValue(value)}</button>)}
      <button type="button" className="cr-button" disabled={holds.length === 0} onClick={exportHolds}>Export holds (CSV)</button>
    </div>
    {notice && <p className="cr-feedback" role="status">{notice}</p>}
    {message && <p className="cr-empty" role="status">{message}</p>}
    {holds.length > 0 && <div className="cr-table-scroll"><table className="cr-table">
      <thead><tr><th scope="col">Order</th><th scope="col">Rider</th><th scope="col">Amount</th><th scope="col">Reason</th><th scope="col">Release on</th><th scope="col">Placed by</th><th scope="col">Action</th></tr></thead>
      <tbody>{holds.map(hold => <HoldRow key={hold.holdId} hold={hold} onDone={async text => { setNotice(text); await load(); }} />)}</tbody>
    </table></div>}
    <form noValidate className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-3" onSubmit={event => void submit(event)}>
      <h3 className="font-bold sm:col-span-3">Hold one trip&apos;s pay</h3>
      <label className={labelClass}>Trip ID<input className={fieldClass} value={form.tripId} maxLength={36} autoComplete="off" onChange={event => setForm({ ...form, tripId: event.target.value })} /></label>
      <label className={labelClass}>Release on<input className={fieldClass} type="date" min={istDay()} max={addDays(istDay(), 7)} value={form.releaseOn} onChange={event => setForm({ ...form, releaseOn: event.target.value })} /></label>
      <label className={labelClass}>Reason (the rider sees it)<input className={fieldClass} value={form.reason} maxLength={1000} onChange={event => setForm({ ...form, reason: event.target.value })} /></label>
      <span className="sm:col-span-3"><button type="submit" className="cr-button cr-primary" disabled={create.busy}>Place hold</button><ActionMessage state={create.state} /></span>
    </form>
  </section>;
}

function HoldRow({ hold, onDone }: { hold: Hold; onDone: (notice: string) => Promise<void> }) {
  const action = useFleetAction();
  async function release() {
    if (!window.confirm(`Release the hold on ${hold.orderCode}? ${formatPaise(hold.amountPaise)} becomes withdrawable.`)) return;
    if (await action.run("POST", `holds/${hold.holdId}/release`, holdSchema, undefined, "")) await onDone(`Hold on ${hold.orderCode} released.`);
  }
  return <tr>
    <td>{hold.orderCode}</td><td><Link className="underline" href={`/admin/riders/${hold.riderId}`}>{hold.riderName}</Link></td>
    <td>{formatPaise(hold.amountPaise)}</td><td>{hold.reason}</td><td>{hold.releaseOn}</td><td>{hold.createdBy}</td>
    <td>{hold.state === "ACTIVE"
      ? <button type="button" className="cr-button" disabled={action.busy} onClick={() => void release()}>Release now</button>
      : <span className="cr-muted">Released {hold.releasedBy ? `by ${hold.releasedBy}` : "on its date"} · {when(hold.releasedAt)}</span>}
      <ActionMessage state={action.state} /></td>
  </tr>;
}
