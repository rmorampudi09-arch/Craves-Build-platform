"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, CreditCard, PackageSearch, RefreshCw, RotateCcw, Search, Truck, X } from "lucide-react";
import {
  parseCustomer360Response,
  type Customer360Response,
  type CustomerOrderPage,
  type CustomerPaymentPage,
  type CustomerRefundPage,
} from "@/lib/admin-customer-360-contract";
import type { AdminInvestigationResource, AdminInvestigationResult } from "@/lib/admin-investigation-contract";

type Resource = "orders" | "payments" | "refunds";

type Filters = {
  orderStatus: string;
  paymentStatus: string;
  refundStatus: string;
  provider: string;
  kitchenId: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = {
  orderStatus: "",
  paymentStatus: "",
  refundStatus: "",
  provider: "",
  kitchenId: "",
  from: "",
  to: "",
};

function money(currency: string, amount: number): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function dateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString("en-IN") : "Not recorded";
}

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function customer360Payload(
  action: "all" | Resource,
  identityId: string,
  reason: string,
  filters: Filters,
  cursor?: Record<string, string | null>,
) {
  return {
    action,
    identityId,
    reason,
    orderStatus: filters.orderStatus || undefined,
    paymentStatus: filters.paymentStatus || undefined,
    refundStatus: filters.refundStatus || undefined,
    provider: filters.provider || undefined,
    kitchenId: filters.kitchenId || undefined,
    from: toIso(filters.from),
    to: toIso(filters.to),
    limit: 50,
    ...cursor,
  };
}

function StatusPill({ value }: { value: string | null | undefined }) {
  return <span className="rounded-full bg-[#f1ebff] px-2.5 py-1 text-[10px] font-black text-[#6930ca]">{value || "UNKNOWN"}</span>;
}

function SectionError({ label, code }: { label: string; code?: string }) {
  if (!code) return null;
  return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>{label} could not be loaded.</strong><span className="ml-2 text-xs opacity-75">{code}</span></div>;
}

function EvidencePanel({ result, onClose }: { result: AdminInvestigationResult; onClose: () => void }) {
  return <section className="fixed inset-0 z-50 bg-[#0b1426]/55 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Operational evidence">
    <div className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 bg-[#0b1426] p-6 text-white"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#f6b545]">Audited evidence · {result.resource}</p><h3 className="mt-2 text-2xl font-black">{result.title}</h3><div className="mt-2 flex flex-wrap items-center gap-2"><StatusPill value={result.status}/><span className="text-xs text-slate-300">Correlation {result.correlationId}</span></div></div><button onClick={onClose} className="rounded-xl bg-white/10 p-2" aria-label="Close evidence"><X size={18}/></button></header>
      <div className="flex-1 overflow-y-auto p-5 sm:p-6"><div className="grid gap-3 sm:grid-cols-2">{result.summary.map(item => <div key={item.label} className="rounded-2xl bg-[#f8f6fa] p-4"><p className="text-[10px] font-black uppercase tracking-[.13em] text-[#8e8295]">{item.label}</p><p className="mt-2 break-words text-sm font-bold">{item.value}</p></div>)}</div><div className="mt-6"><h4 className="font-black">Timeline</h4><div className="mt-3 space-y-3">{result.timeline.length ? result.timeline.map((entry,index) => <div key={`${entry.label}-${entry.occurredAt}-${index}`} className="border-l-2 border-[#f6b545] pl-4"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{entry.label}</strong>{entry.status ? <StatusPill value={entry.status}/> : null}</div><p className="mt-1 text-xs text-[#776b7f]">{entry.detail || "No additional detail"}</p><p className="mt-1 text-[11px] text-[#9b90a1]">{dateTime(entry.occurredAt)}</p></div>) : <p className="text-sm text-[#776b7f]">No timeline events were recorded for this resource.</p>}</div></div></div>
    </div>
  </section>;
}

export function AdminCustomer360({ identityId, reason }: { identityId: string; reason: string }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [data, setData] = useState<Customer360Response>({ orders: null, payments: null, refunds: null, errors: {} });
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState<Resource | null>(null);
  const [message, setMessage] = useState("");
  const [evidence, setEvidence] = useState<AdminInvestigationResult | null>(null);
  const [evidenceBusyId, setEvidenceBusyId] = useState<string | null>(null);

  const loadJourney = useCallback(async (activeFilters: Filters) => {
    if (reason.trim().length < 10) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/customer-360", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customer360Payload("all", identityId, reason, activeFilters)),
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 401 ? "Administrator session expired." : "Customer journey could not be loaded.");
      const parsed = parseCustomer360Response(body);
      if (!parsed) throw new Error("Customer journey returned an invalid response.");
      setData(parsed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Customer journey is unavailable.");
    } finally {
      setBusy(false);
    }
  }, [identityId, reason]);

  useEffect(() => {
    void loadJourney(EMPTY_FILTERS);
  }, [loadJourney]);

  async function loadMore(resource: Resource) {
    let cursor: Record<string, string | null>;
    if (resource === "orders") {
      const page = data.orders;
      if (!page?.hasMore) return;
      cursor = {
        orderBeforeCreatedAt: page.nextBeforeCreatedAt,
        orderBeforeId: page.nextBeforeOrderId,
      };
    } else if (resource === "payments") {
      const page = data.payments;
      if (!page?.hasMore) return;
      cursor = {
        paymentBeforeCreatedAt: page.nextBeforeCreatedAt,
        paymentBeforeId: page.nextBeforePaymentId,
      };
    } else {
      const page = data.refunds;
      if (!page?.hasMore) return;
      cursor = {
        refundBeforeCreatedAt: page.nextBeforeCreatedAt,
        refundBeforeId: page.nextBeforeRefundId,
      };
    }

    setLoadingMore(resource);
    setMessage("");
    try {
      const response = await fetch("/api/admin/customer-360", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customer360Payload(resource, identityId, reason, filters, cursor)),
        cache: "no-store",
      });
      const parsed = parseCustomer360Response(await response.json().catch(() => null));
      if (!response.ok || !parsed || !parsed[resource]) throw new Error(`More ${resource} could not be loaded.`);
      setData(current => {
        if (resource === "orders") {
          const next = parsed.orders as CustomerOrderPage;
          return { ...current, orders: { ...next, items: [...(current.orders?.items ?? []), ...next.items] }, errors: { ...current.errors, orders: undefined } };
        }
        if (resource === "payments") {
          const next = parsed.payments as CustomerPaymentPage;
          return { ...current, payments: { ...next, items: [...(current.payments?.items ?? []), ...next.items] }, errors: { ...current.errors, payments: undefined } };
        }
        const next = parsed.refunds as CustomerRefundPage;
        return { ...current, refunds: { ...next, items: [...(current.refunds?.items ?? []), ...next.items] }, errors: { ...current.errors, refunds: undefined } };
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `More ${resource} are unavailable.`);
    } finally {
      setLoadingMore(null);
    }
  }

  async function inspect(resource: AdminInvestigationResource, resourceId: string) {
    setEvidenceBusyId(resourceId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/operations/investigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource, resourceId, reason }), cache: "no-store" });
      const body = await response.json().catch(() => null) as AdminInvestigationResult | null;
      if (!response.ok || !body || typeof body.title !== "string" || !Array.isArray(body.summary) || !Array.isArray(body.timeline)) throw new Error("Full operational evidence could not be opened.");
      setEvidence(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operational evidence is unavailable.");
    } finally {
      setEvidenceBusyId(null);
    }
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    void loadJourney(EMPTY_FILTERS);
  }

  const orderStatuses = useMemo(() => unique(data.orders?.items.map(item => item.status) ?? []), [data.orders]);
  const paymentStatuses = useMemo(() => unique(data.payments?.items.map(item => item.status) ?? []), [data.payments]);
  const refundStatuses = useMemo(() => unique(data.refunds?.items.map(item => item.status) ?? []), [data.refunds]);
  const kitchens = useMemo(() => {
    const found = new Map<string, string>();
    for (const order of data.orders?.items ?? []) if (order.kitchenId) found.set(order.kitchenId, order.kitchenName || order.kitchenId);
    return [...found.entries()].sort((a,b) => a[1].localeCompare(b[1]));
  }, [data.orders]);

  return <section className="rounded-[28px] border border-[#dcd1e4] bg-[#f8f6fa] p-4 sm:p-6">
    {evidence ? <EvidencePanel result={evidence} onClose={() => setEvidence(null)}/> : null}
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#6930ca]">Customer 360</p><h3 className="mt-2 text-2xl font-black">One customer. One operational workspace.</h3><p className="mt-2 max-w-3xl text-sm text-[#776b7f]">Orders, payment attempts and refunds are pulled from their owning services using the customer identity. Filter here, then inspect any row without leaving this customer case.</p></div><button onClick={() => void loadJourney(filters)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-[#6930ca] shadow-sm disabled:opacity-40"><RefreshCw size={14}/>{busy ? "Refreshing…" : "Refresh journey"}</button></div>

    <div className="mt-5 grid gap-3 rounded-2xl bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs font-black text-[#5d5064]">Order status<select value={filters.orderStatus} onChange={event => setFilters(current => ({ ...current, orderStatus: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#e6deea] bg-white p-2.5 text-sm"><option value="">All loaded statuses</option>{orderStatuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs font-black text-[#5d5064]">Payment status<select value={filters.paymentStatus} onChange={event => setFilters(current => ({ ...current, paymentStatus: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#e6deea] bg-white p-2.5 text-sm"><option value="">All loaded statuses</option>{paymentStatuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs font-black text-[#5d5064]">Refund status<select value={filters.refundStatus} onChange={event => setFilters(current => ({ ...current, refundStatus: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#e6deea] bg-white p-2.5 text-sm"><option value="">All loaded statuses</option>{refundStatuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs font-black text-[#5d5064]">Payment provider<select value={filters.provider} onChange={event => setFilters(current => ({ ...current, provider: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#e6deea] bg-white p-2.5 text-sm"><option value="">All providers</option><option value="RAZORPAY">Razorpay</option><option value="CASHFREE">Cashfree (optional)</option></select></label>
      <label className="text-xs font-black text-[#5d5064]">Kitchen<select value={filters.kitchenId} onChange={event => setFilters(current => ({ ...current, kitchenId: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#e6deea] bg-white p-2.5 text-sm"><option value="">All loaded kitchens</option>{kitchens.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-xs font-black text-[#5d5064]">From<input type="datetime-local" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#e6deea] bg-white p-2.5 text-sm"/></label>
      <label className="text-xs font-black text-[#5d5064]">To<input type="datetime-local" value={filters.to} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#e6deea] bg-white p-2.5 text-sm"/></label>
      <div className="flex items-end gap-2"><button onClick={() => void loadJourney(filters)} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#6930ca] px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"><Search size={15}/>Apply filters</button><button onClick={resetFilters} className="rounded-xl border border-[#ded5e4] bg-white p-2.5 text-[#6930ca]" title="Reset filters"><RotateCcw size={16}/></button></div>
    </div>

    {message ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950" role="status">{message}</div> : null}

    <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[#0b1426] p-4 text-white"><PackageSearch size={18} className="text-[#f6b545]"/><p className="mt-3 text-2xl font-black">{data.orders?.items.length ?? 0}</p><p className="text-xs text-slate-300">orders loaded{data.orders?.hasMore ? " · more available" : ""}</p></div><div className="rounded-2xl bg-white p-4"><CreditCard size={18} className="text-[#6930ca]"/><p className="mt-3 text-2xl font-black">{data.payments?.items.length ?? 0}</p><p className="text-xs text-[#776b7f]">payments loaded{data.payments?.hasMore ? " · more available" : ""}</p></div><div className="rounded-2xl bg-white p-4"><RefreshCw size={18} className="text-[#6930ca]"/><p className="mt-3 text-2xl font-black">{data.refunds?.items.length ?? 0}</p><p className="text-xs text-[#776b7f]">refunds loaded{data.refunds?.hasMore ? " · more available" : ""}</p></div></div>

    <div className="mt-6 space-y-5">
      <article className="rounded-[24px] bg-white p-4 sm:p-5"><div className="flex items-center gap-2"><PackageSearch size={18} className="text-[#6930ca]"/><h4 className="font-black">Orders</h4><span className="ml-auto text-xs font-bold text-[#8b7f92]">Newest first</span></div><SectionError label="Orders" code={data.errors.orders}/><div className="mt-3 divide-y divide-[#eee8f1]">{data.orders?.items.length ? data.orders.items.map(order => <div key={order.orderId} className="grid gap-3 py-4 xl:grid-cols-[1.3fr_.8fr_.8fr_auto] xl:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{order.kitchenName || "Kitchen"}</strong><StatusPill value={order.status}/></div><p className="mt-1 text-xs text-[#776b7f]">Order {order.orderId}</p><p className="mt-1 text-[11px] text-[#9b90a1]">{dateTime(order.createdAt)}</p></div><div><p className="text-[10px] font-black uppercase text-[#9a8fa1]">Total</p><p className="mt-1 text-sm font-black">{money(order.currency, order.grandTotal)}</p></div><div><p className="text-[10px] font-black uppercase text-[#9a8fa1]">Delivery</p><p className="mt-1 text-sm font-bold">{order.deliveryStatus || "Not started"}</p>{order.deliveryProviderId ? <p className="text-[11px] text-[#8d8194]">{order.deliveryProviderId}</p> : null}</div><div className="flex flex-wrap gap-2"><button disabled={evidenceBusyId===order.orderId} onClick={() => void inspect("order",order.orderId)} className="rounded-xl bg-[#0b1426] px-3 py-2 text-xs font-black text-white">{evidenceBusyId===order.orderId?"Opening…":"Full evidence"}</button>{order.refundId ? <button disabled={evidenceBusyId===order.refundId} onClick={() => void inspect("refund",order.refundId as string)} className="rounded-xl bg-[#fff8ec] px-3 py-2 text-xs font-black">Refund evidence</button> : null}</div></div>) : <p className="py-5 text-sm text-[#776b7f]">No orders matched the current filters.</p>}</div>{data.orders?.hasMore ? <button onClick={() => void loadMore("orders")} disabled={loadingMore!==null} className="mt-3 inline-flex items-center gap-2 text-xs font-black text-[#6930ca]"><ChevronDown size={14}/>{loadingMore==="orders"?"Loading…":"Load more orders"}</button> : null}</article>

      <article className="rounded-[24px] bg-white p-4 sm:p-5"><div className="flex items-center gap-2"><CreditCard size={18} className="text-[#6930ca]"/><h4 className="font-black">Payments</h4></div><SectionError label="Payments" code={data.errors.payments}/><div className="mt-3 divide-y divide-[#eee8f1]">{data.payments?.items.length ? data.payments.items.map(payment => <div key={payment.paymentOrderId} className="grid gap-3 py-4 xl:grid-cols-[1.2fr_.7fr_1fr_auto] xl:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{payment.cravesReference || "Payment"}</strong><StatusPill value={payment.status}/></div><p className="mt-1 text-xs text-[#776b7f]">{payment.provider} · {payment.providerStatus || "provider status not recorded"}</p><p className="mt-1 text-[11px] text-[#9b90a1]">{dateTime(payment.createdAt)}</p></div><p className="text-sm font-black">{money(payment.currency,payment.amount)}</p><div className="text-xs text-[#776b7f]"><p className="truncate">Provider order: {payment.providerOrderId || "—"}</p><p className="mt-1 truncate">Provider payment: {payment.providerPaymentId || "—"}</p></div><button disabled={evidenceBusyId===payment.paymentOrderId} onClick={() => void inspect("payment",payment.paymentOrderId)} className="rounded-xl bg-[#0b1426] px-3 py-2 text-xs font-black text-white">{evidenceBusyId===payment.paymentOrderId?"Opening…":"Attempts & events"}</button></div>) : <p className="py-5 text-sm text-[#776b7f]">No payments matched the current filters.</p>}</div>{data.payments?.hasMore ? <button onClick={() => void loadMore("payments")} disabled={loadingMore!==null} className="mt-3 inline-flex items-center gap-2 text-xs font-black text-[#6930ca]"><ChevronDown size={14}/>{loadingMore==="payments"?"Loading…":"Load more payments"}</button> : null}</article>

      <article className="rounded-[24px] bg-white p-4 sm:p-5"><div className="flex items-center gap-2"><RefreshCw size={18} className="text-[#6930ca]"/><h4 className="font-black">Refunds</h4></div><SectionError label="Refunds" code={data.errors.refunds}/><div className="mt-3 divide-y divide-[#eee8f1]">{data.refunds?.items.length ? data.refunds.items.map(refund => <div key={refund.refundId} className="grid gap-3 py-4 xl:grid-cols-[1.2fr_.7fr_1fr_auto] xl:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{refund.provider} refund</strong><StatusPill value={refund.status}/></div><p className="mt-1 text-xs text-[#776b7f]">{refund.reason || "No reason recorded"}</p><p className="mt-1 text-[11px] text-[#9b90a1]">{dateTime(refund.createdAt)}</p></div><p className="text-sm font-black">{money(refund.currency,refund.amount)}</p><div className="text-xs text-[#776b7f]"><p className="truncate">Provider refund: {refund.providerRefundId || "—"}</p><p className="mt-1">Processed: {dateTime(refund.processedAt)}</p></div><button disabled={evidenceBusyId===refund.refundId} onClick={() => void inspect("refund",refund.refundId)} className="rounded-xl bg-[#0b1426] px-3 py-2 text-xs font-black text-white">{evidenceBusyId===refund.refundId?"Opening…":"Refund evidence"}</button></div>) : <p className="py-5 text-sm text-[#776b7f]">No refunds matched the current filters.</p>}</div>{data.refunds?.hasMore ? <button onClick={() => void loadMore("refunds")} disabled={loadingMore!==null} className="mt-3 inline-flex items-center gap-2 text-xs font-black text-[#6930ca]"><ChevronDown size={14}/>{loadingMore==="refunds"?"Loading…":"Load more refunds"}</button> : null}</article>
    </div>

    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#e4d9eb] bg-white p-4"><Truck size={18} className="mt-0.5 shrink-0 text-[#6930ca]"/><p className="text-xs leading-5 text-[#776b7f]"><strong className="text-[#3d3143]">Operational actions stay policy-controlled.</strong> This workspace makes the customer journey selectable and inspectable in one place. Mutating actions such as refund, cancellation or delivery intervention are only surfaced when an existing backend endpoint defines the authorization and business rule; Customer 360 does not invent those rules in the browser.</p></div>
  </section>;
}
