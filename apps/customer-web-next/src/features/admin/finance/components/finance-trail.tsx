"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, Copy, X } from "lucide-react";
import { formatAdminTimestamp, readableAdminStatus } from "@/features/admin/shell/lib/admin-navigation";
import { KIND_LABEL, orderNumber, orderTrailSchema, payoutTrailSchema, rupees, shortId, statusOf, type Movement, type OrderTrail, type PayoutTrail } from "@/features/admin/finance/lib/insights-contract";
import { orderStops, payoutStops, type Stop } from "@/features/admin/finance/lib/trail-stops";
import { useInsights, usePaneFocus } from "@/features/admin/finance/lib/use-insights";

/** What the pane beside a list shows: one checkout's money, one chef payout, or a row with nothing more behind it. */
export type Target = { type: "order"; checkoutId: string; chefOrderId?: string | null } | { type: "payout"; id: string } | { type: "row"; row: Movement };
export function targetOf(row: Movement): Target {
  if (row.kind === "CHEF_PAYOUT") return { type: "payout", id: row.id };
  return row.kind !== "RIDER_PAYOUT" && row.checkoutId ? { type: "order", checkoutId: row.checkoutId, chefOrderId: row.chefOrderId } : { type: "row", row };
}
type Names = (chefId: string | null) => string;

function CopyId({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="fn-copy fn-ref" title={value} aria-label={`Copy ${label} ${value}`} onClick={() => {
    void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }, () => undefined);
  }}>{value.length > 22 ? shortId(value) : value}{copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}<span className="cr-sr-only" role="status">{copied ? "Copied" : ""}</span></button>;
}

function Stops({ stops, onOpen }: { stops: Stop[]; onOpen: (target: Target) => void }) {
  return <ol className="fn-trail">{stops.map(stop => <li key={stop.key} className="fn-stop" data-state={stop.state}>
    <div><strong>{stop.title}</strong>{stop.at && <small>{formatAdminTimestamp(stop.at)}</small>}</div>
    {stop.note && <p>{stop.note}</p>}
    {stop.sum && <dl className="fn-sum">{stop.sum.map(([label, amount, sign]) => <div key={label}><dt>{label}</dt><dd>{rupees(amount, sign ?? "")}</dd></div>)}</dl>}
    {stop.payoutId && <div><button type="button" className="fn-link" onClick={() => onOpen({ type: "payout", id: stop.payoutId! })}>Open this payout</button></div>}
  </li>)}</ol>;
}

function Journal({ entries }: { entries: OrderTrail["journal"] }) {
  if (entries.length === 0) return null;
  return <details className="fn-details"><summary>Accounting entries ({entries.length})</summary>
    {entries.map(entry => <div key={entry.id}><h3>{readableAdminStatus(entry.eventType)} · {formatAdminTimestamp(entry.occurredAt)}</h3>
      <table><thead><tr><th scope="col">Account</th><th scope="col">Debit</th><th scope="col">Credit</th></tr></thead>
        <tbody>{entry.lines.map((line, index) => <tr key={index}><td>{readableAdminStatus(line.account)}</td><td>{line.debit === "0.00" ? "" : rupees(line.debit)}</td><td>{line.credit === "0.00" ? "" : rupees(line.credit)}</td></tr>)}</tbody></table></div>)}
  </details>;
}

function OrderPane({ trail, focus, names, onOpen }: { trail: OrderTrail; focus?: string | null; names: Names; onOpen: (target: Target) => void }) {
  // The order the row belongs to comes first; a checkout from several kitchens shows each one's trail.
  const orders = [...trail.orders].sort((a, b) => Number(b.chefOrderId === focus) - Number(a.chefOrderId === focus));
  const paid = trail.payments.find(payment => payment.status === "PAID");
  return <>
    <dl className="fn-facts">
      <div><dt>Checkout ID</dt><dd><CopyId value={trail.checkoutId} label="checkout ID" /></dd></div>
      {paid && <div><dt>Payment reference</dt><dd><CopyId value={paid.providerPaymentId ?? paid.reference} label="payment ID" /></dd></div>}
      {trail.customerId && <div><dt>Customer</dt><dd><Link className="fn-link" href={`/admin/search?reference=${trail.customerId}`}>Find customer {shortId(trail.customerId)}</Link></dd></div>}
    </dl>
    {orders.length === 0 && <Stops stops={orderStops(trail, null)} onOpen={onOpen} />}
    {orders.map(order => <section key={order.chefOrderId} style={{ display: "grid", gap: 12 }}>
      <h3>{order.delivery?.kitchenName ?? names(order.chefId)} · order {orderNumber(order.chefOrderId)}</h3>
      <Stops stops={orderStops(trail, order)} onOpen={onOpen} />
      <div><Link className="fn-link" href={`/admin/operations?reference=${order.chefOrderId}`}>Open the full order investigation</Link></div>
    </section>)}
    <Journal entries={trail.journal} />
  </>;
}

function PayoutPane({ trail, names, onOpen }: { trail: PayoutTrail; names: Names; onOpen: (target: Target) => void }) {
  const { payout } = trail;
  return <>
    <dl className="fn-facts">
      <div><dt>Chef</dt><dd>{names(payout.chefId)}</dd></div>
      <div><dt>How it is paid</dt><dd>{payout.channel === "CRAVES_MANUAL" ? "Bank transfer recorded by an admin" : "RazorpayX"}</dd></div>
      {payout.reference && <div><dt>Bank reference (UTR)</dt><dd><CopyId value={payout.reference} label="bank reference" /></dd></div>}
      {payout.providerId && <div><dt>RazorpayX payout</dt><dd><CopyId value={payout.providerId} label="RazorpayX payout ID" /></dd></div>}
      <div><dt>Payout ID</dt><dd><CopyId value={payout.id} label="payout ID" /></dd></div>
    </dl>
    <Stops stops={payoutStops(trail)} onOpen={onOpen} />
    <section style={{ display: "grid", gap: 8 }}><h3>Orders in this payout ({trail.orders.length})</h3>
      {trail.orders.length === 0 ? <p className="fn-small">No order earnings are attached to this payout.</p>
        : <table className="fn-table"><tbody>{trail.orders.map(order => <tr key={order.chefOrderId} onClick={() => order.checkoutId && onOpen({ type: "order", checkoutId: order.checkoutId, chefOrderId: order.chefOrderId })}>
          <td><button type="button" className="fn-rowbtn" disabled={!order.checkoutId}>Order {orderNumber(order.chefOrderId)}<small>Delivered {formatAdminTimestamp(order.deliveredAt)}{order.counted ? "" : " · no longer counted in this payout"}</small></button></td>
          <td className="fn-amount fn-num">{rupees(order.amount)}</td></tr>)}</tbody></table>}
      {trail.referralRewards !== "0.00" && <p className="fn-small">Also includes {rupees(trail.referralRewards)} of referral rewards.</p>}
    </section>
    {trail.events.length > 0 && <details className="fn-details"><summary>What was done, and by whom ({trail.events.length})</summary>
      <table><thead><tr><th scope="col">Step</th><th scope="col">By</th><th scope="col">When</th></tr></thead>
        <tbody>{trail.events.map((event, index) => <tr key={index}><td>{readableAdminStatus(event.action)}<br /><small className="fn-small">{event.evidence}</small></td>
          <td>{/^[0-9a-f-]{36}$/.test(event.actor) ? `Admin ${shortId(event.actor)}` : event.actor}</td><td>{formatAdminTimestamp(event.at)}</td></tr>)}</tbody></table></details>}
    <Journal entries={trail.journal} />
  </>;
}

/** The pane beside a list. It loads one trail at a time and keeps the last one on screen while the next loads. */
export function FinanceTrail({ target, names, onOpen, onClose }: { target: Target; names: Names; onOpen: (target: Target) => void; onClose: () => void }) {
  const order = useInsights(target.type === "order" ? `view=order&id=${target.checkoutId}` : null, orderTrailSchema, "No money records were found for this order.");
  const payout = useInsights(target.type === "payout" ? `view=payout&id=${target.id}` : null, payoutTrailSchema, "This payout was not found.");
  const active = target.type === "order" ? order : payout;
  const pane = usePaneFocus(target);
  const row = target.type === "row" ? target.row : null;
  const paid = order.data?.payments.find(payment => payment.status === "PAID");
  const status = row ? statusOf(row.kind, row.status) : payout.data ? statusOf("CHEF_PAYOUT", payout.data.payout.status) : null;
  return <aside ref={pane} tabIndex={-1} className="fn-pane" aria-label="Money trail" aria-busy={active.loading && target.type !== "row"}>
    <header><div>
      <p className="fn-small">{row ? KIND_LABEL[row.kind] : target.type === "order" ? "Money trail of one order" : "Chef payout"}</p>
      <p className="fn-figure fn-num">{row ? rupees(row.amount) : target.type === "payout" ? (payout.data ? rupees(payout.data.payout.amount) : "…")
        : paid ? rupees(paid.amount) : order.data ? "Not paid" : "…"}</p>
      {status && <span className="fn-status" data-tone={status.tone}>{status.label}</span>}
    </div><button type="button" className="cr-icon-button" onClick={onClose} aria-label="Close the money trail"><X size={18} aria-hidden="true" /></button></header>
    {target.type !== "row" && active.error && <div className="fn-alert" role="alert" data-tone="danger"><AlertTriangle size={18} aria-hidden="true" /><span>{active.error}</span>
      <button type="button" className="cr-button" onClick={active.reload}>Try again</button></div>}
    {target.type !== "row" && !active.data && !active.error && <div className="fn-skeleton" role="status" aria-label="Loading the money trail">{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</div>}
    <div className={active.loading ? "fn-stale" : undefined} style={{ display: "grid", gap: 18 }}>
      {target.type === "order" && order.data && <OrderPane trail={order.data} focus={target.chefOrderId} names={names} onOpen={onOpen} />}
      {target.type === "payout" && payout.data && <PayoutPane trail={payout.data} names={names} onOpen={onOpen} />}
      {row && <>
        <dl className="fn-facts">
          <div><dt>When</dt><dd>{formatAdminTimestamp(row.at)}</dd></div>
          <div><dt>{row.partyType === "RIDER" ? "Rider" : row.partyType === "CHEF" ? "Chef" : "Customer"}</dt><dd>{row.partyName ?? (row.partyType === "CHEF" ? names(row.partyId) : row.partyId ? shortId(row.partyId) : "Not recorded")}</dd></div>
          {row.reference && <div><dt>{row.kind === "RIDER_PAYOUT" ? "Bank reference (UTR)" : "Reference"}</dt><dd><CopyId value={row.reference} label="reference" /></dd></div>}
          <div><dt>Record ID</dt><dd><CopyId value={row.id} label="record ID" /></dd></div>
        </dl>
        {row.kind === "RIDER_PAYOUT" ? <p className="fn-note">Rider payouts are prepared, approved and marked paid on the <Link className="fn-link" href="/admin/fleet-payouts">Rider payouts</Link> page.</p>
          : <p className="fn-note">This record is not linked to an order, so there is no trail to follow from it.</p>}
      </>}
    </div>
  </aside>;
}
