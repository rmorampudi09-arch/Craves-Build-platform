"use client";

import Link from "next/link";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { orderStatusWords, type OrderFlow } from "@/features/admin/shell/lib/admin-attention";
import { useAdminAttention } from "@/features/admin/shell/lib/use-admin-attention";
import { explorerHref } from "@/features/admin/explorer/lib/admin-explorer";

const GROUPS: ReadonlyArray<{ statuses: readonly string[]; title: string; note: string; tone: "bad" | "warn" | "muted" }> = [
  { statuses: ["REFUND_FAILED"], title: "Refunds that failed", note: "The kitchen declined or the order was cancelled, and the refund didn't reach the customer. Check it in Cashfree, then tell the customer.", tone: "bad" },
  { statuses: ["READY_FOR_PICKUP"], title: "In Ready for pickup", note: "Normal for a few minutes while a rider comes. If one has waited long, call the kitchen: was the food collected?", tone: "warn" },
  { statuses: ["CHEF_ACCEPTANCE_PENDING", "PREPARING", "OUT_FOR_DELIVERY"], title: "Other orders in progress", note: "Look one up if it has been in the same step for too long.", tone: "muted" },
  { statuses: ["REFUND_PENDING", "CHEF_REJECTED", "CANCELLED"], title: "Declined, cancelled or refund on its way", note: "Nothing to do unless the customer gets in touch.", tone: "muted" },
];

function OrderRows({ items, tone }: { items: OrderFlow["recent"]; tone: string }) {
  // Explicit roles keep the table readable as a table when phones restack its rows.
  return <table className="ad-table ad-table-stack" role="table">
    <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Order</th><th role="columnheader" scope="col">Status</th><th role="columnheader" scope="col"><span className="cr-sr-only">Action</span></th></tr></thead>
    <tbody role="rowgroup">{items.map(item => {
      const short = item.orderId.slice(0, 8).toUpperCase();
      return <tr role="row" key={item.orderId}>
        <td role="cell"><b>#{short}</b><span className="ad-sub">{item.kitchenName ?? "Kitchen not recorded"}</span></td>
        <td role="cell"><span className="ad-pill" data-tone={tone}>{orderStatusWords(item.status)}</span><span className="ad-sub">Changed {formatAdminTimestamp(item.updatedAt)}</span></td>
        <td role="cell"><Link className="cr-button" href={`/admin/operations?reference=${item.orderId}`}>Look up<span className="cr-sr-only"> order {short}</span></Link></td>
      </tr>;
    })}</tbody>
  </table>;
}

/** Orders › Needs attention: the recent orders the summary flags, grouped by what to do. */
export function AdminOrdersAttention() {
  const { data, checking, refresh } = useAdminAttention(true, "/admin/orders");
  const flow = data.orders.state === "ok" ? data.orders.value : null;
  if (!flow) return <div className="ad-empty" role="status" aria-busy={data.orders.state === "loading"}>
    <b>{data.orders.state === "failed" ? "Couldn't load the orders that need attention." : "Loading the orders that need attention…"}</b>
    {data.orders.state === "failed" && <><span>Some may be waiting. Try again in a minute.</span><button type="button" className="cr-button" onClick={() => void refresh()} disabled={checking}>{checking ? "Checking…" : "Try again"}</button></>}
  </div>;
  const totals: Record<string, number> = { REFUND_FAILED: flow.refundFailed, READY_FOR_PICKUP: flow.readyForPickup };
  return <div className="ad-grid">
    {GROUPS.map(group => {
      const items = flow.recent.filter(item => group.statuses.includes(item.status));
      const total = group.statuses.reduce((sum, status) => sum + (totals[status] ?? 0), 0);
      if (!items.length && !total) return null;
      return <section className="ad-panel" key={group.title} aria-labelledby={`ad-group-${group.statuses[0]}`}>
        <div className="ad-panel-h"><div><h2 id={`ad-group-${group.statuses[0]}`}>{group.title} {total > 0 && <span className="ad-count" data-urgent={group.tone === "bad" || undefined}>{total}</span>}</h2><p>{group.note}</p></div></div>
        {items.length ? <OrderRows items={items} tone={group.tone}/> : <p className="ad-panel-b cr-muted">None of the {total} {total === 1 ? "order is" : "orders are"} in the recent list. Find them in <Link href={explorerHref("orders", { status: group.statuses[0] })}>All orders</Link>.</p>}
        {total > items.length && items.length > 0 && <p className="ad-panel-b cr-muted">Showing {items.length} of {total}, the most recently changed. See every one in <Link href={explorerHref("orders", { status: group.statuses[0] })}>All orders</Link>.</p>}
      </section>;
    })}
    {!flow.recent.length && !flow.refundFailed && !flow.readyForPickup && <div className="ad-empty"><b>No orders need you right now.</b><span>Failed refunds and orders stuck in one step show here.</span></div>}
    <p className="cr-muted">Each lookup asks why you&apos;re opening the order, and your reason is recorded.</p>
  </div>;
}
