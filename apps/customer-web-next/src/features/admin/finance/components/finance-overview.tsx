"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { FlowChart, ShareBars, type Share } from "@/features/admin/finance/components/finance-charts";
import { bucketDays, fromPaise, isZero, overviewSchema, paise, rupees, type Kind, type Overview } from "@/features/admin/finance/lib/insights-contract";
import { useInsights } from "@/features/admin/finance/lib/use-insights";

export type Period = { from: string; to: string };
/** Open Transactions with these filters; `days` switches the period to the last N days first. */
export type Jump = { kind?: Kind; status?: string; party?: string; from?: string; to?: string; days?: number };
const many = (count: number, one: string, more = `${one}s`) => `${count.toLocaleString("en-IN")} ${count === 1 ? one : more}`;

function Line({ label, note, amount, sign, total, onOpen }: { label: string; note?: string; amount: string; sign?: "" | "-"; total?: boolean; onOpen?: () => void }) {
  const body = <><span>{label}{note && <small>{note}</small>}</span><span className="fn-num">{rupees(amount, sign)}</span></>;
  const style = total ? "fn-line fn-total" : "fn-line";
  return onOpen ? <button type="button" className={style} onClick={onOpen}>{body}</button> : <div className={style}>{body}</div>;
}

function Attention({ overview, onJump, onPayouts }: { overview: Overview; onJump: (jump: Jump) => void; onPayouts: () => void }) {
  const { attention, recording } = overview;
  const items: { count: number; what: string; state: string; open?: () => void; href?: string }[] = [
    { count: attention.payoutsToConfirm, what: "chef payout", state: "set aside or waiting for the bank’s answer", open: onPayouts },
    { count: attention.payoutsFailed, what: "chef payout", state: "failed or came back in the last 30 days", open: () => onJump({ kind: "CHEF_PAYOUT", days: 30 }) },
    { count: attention.refundsStuck, what: "refund", state: "failed, stuck or open for over a day", open: () => onJump({ kind: "REFUND", days: 30 }) },
    { count: attention.ordersToReview, what: "order", state: "with the earning held for a check", href: "/admin/operations" },
    { count: attention.riderPayoutsOpen, what: "rider payout", state: "waiting or failed", href: "/admin/fleet-payouts" },
  ].filter(item => item.count > 0);
  const text = (item: typeof items[number]) => `${item.what}${item.count === 1 ? "" : "s"} ${item.state}`;
  return <section className="fn-card"><header><div><h2>Needs attention</h2><p className="fn-small">As of {formatAdminTimestamp(overview.generatedAt)}, whatever period is chosen.</p></div></header>
    {items.length === 0 ? <div className="fn-empty"><strong>Nothing needs you right now</strong><p className="fn-note">Failed payouts, stuck refunds and held orders are listed here when they happen.</p></div>
      : <ul className="fn-todo">{items.map(item => <li key={item.what + item.state}>{item.href
        ? <Link href={item.href}><b>{item.count}</b> <span>{text(item)}</span><ChevronRight size={16} aria-hidden="true" /></Link>
        : <button type="button" onClick={item.open}><b>{item.count}</b> <span>{text(item)}</span><ChevronRight size={16} aria-hidden="true" /></button>}</li>)}</ul>}
    {(!recording.on || recording.earningsRecorded === 0) && <p className="fn-small" style={{ marginTop: 14 }}>
      {recording.on ? "No delivered order has been recorded yet, so chef earnings and Craves' share are still empty."
        : "Recording of chef earnings is switched off. Customer payments, refunds and payouts are shown; chef earnings and Craves' share stay empty until it is switched on."}</p>}
  </section>;
}

export function FinanceOverview({ period, onJump, onPayouts }: { period: Period; onJump: (jump: Jump) => void; onPayouts: () => void }) {
  const { data, error, loading, reload } = useInsights(`view=overview&from=${period.from}&to=${period.to}`, overviewSchema);
  if (!data) return error
    ? <div className="fn-alert" role="alert" data-tone="danger"><AlertTriangle size={18} aria-hidden="true" /><span>{error}</span><button type="button" className="cr-button" onClick={reload}>Try again</button></div>
    : <div className="fn-card fn-skeleton" role="status" aria-label="Loading finance figures">{Array.from({ length: 9 }, (_, index) => <span key={index} />)}</div>;
  const { totals, position, split } = data;
  const kept = fromPaise(paise(totals.customerPaid) - paise(totals.refunded));
  const paidOut = fromPaise(paise(totals.chefPaid) + paise(totals.riderPaid));
  // Everything in a delivered order that is neither the chef's nor Craves' fee: delivery charges, GST, TDS and adjustments.
  const passedOn = fromPaise(paise(split.delivered) - paise(split.chefs) - paise(split.cravesFees));
  const shares: Share[] = [
    { name: "Chefs", hint: "What chefs earned after Craves' fee", amount: split.chefs },
    { name: "Craves", hint: "Service and platform fees, before any costs", amount: split.cravesFees, own: true },
    { name: "Delivery charges", hint: "Collected from customers for delivery", amount: split.deliveryCharges },
    { name: "GST", hint: "Collected to pay to the government", amount: split.gst },
    { name: "TDS held", hint: "Tax held back from chefs", amount: split.tdsHeld },
    { name: "Other", hint: "Promotions, company shares and adjustments", amount: split.other },
  ].filter(share => share.name === "Chefs" || share.name === "Craves" || !isZero(share.amount));
  return <div className={loading ? "fn-stale" : undefined} style={{ display: "grid", gap: 20 }} aria-busy={loading}>
    {error && <div className="fn-alert" role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>{error} Showing the last figures loaded.</span><button type="button" className="cr-button" onClick={reload}>Try again</button></div>}
    <div className="fn-card fn-statement">
      <section aria-labelledby="fn-in"><h2 id="fn-in">Money in</h2>
        <Line label="Customers paid" note={many(totals.customerPayments, "payment")} amount={totals.customerPaid} onOpen={() => onJump({ kind: "CUSTOMER_PAYMENT", status: "PAID" })} />
        <Line label="Refunded to customers" note={many(totals.refunds, "refund")} amount={totals.refunded} sign="-" onOpen={() => onJump({ kind: "REFUND", status: "SUCCESS" })} />
        <Line total label="Kept after refunds" amount={kept} />
      </section>
      <section aria-labelledby="fn-out"><h2 id="fn-out">Money out</h2>
        <Line label="Paid to chefs" note={many(totals.chefPayouts, "payout")} amount={totals.chefPaid} onOpen={() => onJump({ kind: "CHEF_PAYOUT", status: "PAID" })} />
        <Line label="Paid to riders" note={many(totals.riderPayouts, "payout")} amount={totals.riderPaid} onOpen={() => onJump({ kind: "RIDER_PAYOUT", status: "PAID" })} />
        <Line total label="Paid out" amount={paidOut} />
      </section>
      <section aria-labelledby="fn-sales"><h2 id="fn-sales">From delivered orders</h2>
        <Line label="Sales delivered" note={many(totals.chefOrders, "order")} amount={split.delivered} onOpen={() => onJump({ kind: "CHEF_EARNING" })} />
        <Line label="Chefs’ share" amount={split.chefs} sign="-" />
        <Line label="Delivery charges and taxes" note="Delivery, GST and TDS" amount={passedOn} sign="-" />
        <Line total label="Craves earned" note="Fees, before any costs" amount={split.cravesFees} />
      </section>
    </div>
    <section className="fn-card" aria-labelledby="fn-owed"><header><div><h2 id="fn-owed">Owed to chefs today</h2>
      <p className="fn-small">As of now, whatever period is chosen.</p></div>
      <button type="button" className="cr-button" onClick={onPayouts}>Open payouts<ChevronRight size={15} aria-hidden="true" /></button></header>
      <dl className="fn-figures">
        <div><dt>Ready to pay</dt><dd className="fn-num">{rupees(position.readyToPay)}</dd><dd>{many(position.chefsToPay, "chef")}</dd></div>
        <div><dt>On hold</dt><dd className="fn-num">{rupees(position.onHold)}</dd><dd>{many(position.chefsOnHold, "chef")}</dd></div>
        <div><dt>Not yet due</dt><dd className="fn-num">{rupees(position.notYetDue)}</dd><dd>Still inside the waiting time</dd></div>
        <div><dt>Being paid</dt><dd className="fn-num">{rupees(position.inProgress)}</dd><dd>Set aside or with the bank</dd></div>
      </dl>
    </section>
    <div className="fn-grid">
      <section className="fn-card"><header><div><h2>Money in and out, by day</h2><p className="fn-small">Click a bar to see that day’s transactions.</p></div>
        <div className="fn-legend"><span><i className="fn-key" />In: customers paid</span><span><i className="fn-key" data-series="out" />Out: refunds and payouts</span></div></header>
        <FlowChart buckets={bucketDays(data.days)} onPick={(from, to) => onJump({ from, to })} />
      </section>
      <Attention overview={data} onJump={onJump} onPayouts={onPayouts} />
    </div>
    <section className="fn-card"><header><div><h2>Where the money from delivered orders went</h2>
      <p className="fn-small">{isZero(split.delivered) ? "No delivered order was recorded in this period."
        : `${rupees(split.delivered)} from ${many(totals.chefOrders, "delivered order")} in this period. Outside courier bills and payment gateway charges are not recorded here, so this is not profit.`}</p></div>
      <button type="button" className="cr-button" onClick={() => onJump({ kind: "CHEF_EARNING" })}>See the orders<ChevronRight size={15} aria-hidden="true" /></button></header>
      {!isZero(split.delivered) && <ShareBars shares={shares} whole={paise(split.delivered)} />}
    </section>
  </div>;
}
