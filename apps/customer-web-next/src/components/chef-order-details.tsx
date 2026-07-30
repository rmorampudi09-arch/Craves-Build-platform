"use client";

import { useEffect, useState } from "react";
import { formatChefOrderStatus, type ChefOrder } from "@/lib/chef-order-contract";

function money(value: number, currency: string) { try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value); } catch { return `${currency} ${value.toFixed(2)}`; } }

export function ChefOrderDetails({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<ChefOrder | null>(null);
  const [message, setMessage] = useState("Loading chef order…");
  useEffect(() => {
    let active = true;
    fetch(`/api/chef/orders/${orderId}`, { cache: "no-store" })
      .then(async response => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) throw new Error(response.status === 404 || response.status === 403 ? "This order is not available for your chef account." : "Chef order is temporarily unavailable.");
        setOrder(body as ChefOrder); setMessage("");
      })
      .catch(error => active && setMessage(error instanceof Error ? error.message : "Chef order is temporarily unavailable."));
    return () => { active = false; };
  }, [orderId]);

  if (!order) return <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950"><p role="status">{message}</p></section>;
  return <div className="space-y-6">
    <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#6930CA]">{formatChefOrderStatus(order.status)}</p><h2 className="mt-2 text-3xl font-bold">Chef order</h2><p className="mt-2 text-sm text-slate-600">Updated {new Date(order.updatedAt).toLocaleString("en-IN")}</p></div><strong className="text-xl">{money(order.foodSubtotal, order.currency)}</strong></div>{order.chefResponseNote && <p className="mt-4 rounded-2xl bg-white p-4 text-sm">Chef note: {order.chefResponseNote}</p>}</section>
    <section className="rounded-[30px] bg-white p-6 text-slate-950"><h2 className="text-2xl font-bold">Items</h2><div className="mt-4 space-y-3">{order.items.map(item => <div key={item.id} className="flex justify-between gap-4 rounded-2xl bg-[#FFF8EC] p-4"><div><strong>{item.quantity}× {item.itemName}</strong><p className="mt-1 text-sm text-slate-600">{item.category} · {item.foodType.replace("_", " ")}</p></div><span>{money(item.lineTotal, order.currency)}</span></div>)}</div></section>
    {order.deliveryAddress && <section className="rounded-[30px] bg-white p-6 text-slate-950"><h2 className="text-2xl font-bold">Delivery recipient</h2><p className="mt-4 font-semibold">{order.deliveryAddress.recipientName}</p><p className="mt-1 text-sm text-slate-600">{order.deliveryAddress.contactPhoneNumber}</p><p className="mt-3 text-sm leading-6 text-slate-700">{order.deliveryAddress.addressLine1}{order.deliveryAddress.addressLine2 ? `, ${order.deliveryAddress.addressLine2}` : ""}{order.deliveryAddress.landmark ? `, ${order.deliveryAddress.landmark}` : ""}<br />{order.deliveryAddress.areaName ? `${order.deliveryAddress.areaName}, ` : ""}{order.deliveryAddress.city}, {order.deliveryAddress.state} {order.deliveryAddress.postalCode}</p></section>}
    <section className="rounded-[30px] bg-white p-6 text-slate-950"><h2 className="text-2xl font-bold">Backend totals</h2><dl className="mt-4 grid gap-3 text-sm"><div className="flex justify-between"><dt>Food subtotal</dt><dd>{money(order.foodSubtotal, order.currency)}</dd></div><div className="flex justify-between"><dt>Platform fee</dt><dd>{money(order.platformFee, order.currency)}</dd></div><div className="flex justify-between"><dt>Tax</dt><dd>{money(order.taxAmount, order.currency)}</dd></div><div className="flex justify-between"><dt>Delivery fee</dt><dd>{money(order.deliveryFee, order.currency)}</dd></div><div className="flex justify-between border-t pt-3 font-bold"><dt>Grand total</dt><dd>{money(order.grandTotal, order.currency)}</dd></div></dl></section>
  </div>;
}
