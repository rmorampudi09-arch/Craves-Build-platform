"use client";

import { useEffect, useState } from "react";
import { formatChefOrderStatus, type ChefOrder } from "@/lib/chef-order-contract";

function money(value: number, currency: string) { try { return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value); } catch { return `${currency} ${value.toFixed(2)}`; } }

export function ChefOrderInbox() {
  const [orders, setOrders] = useState<ChefOrder[]>([]);
  const [message, setMessage] = useState("Loading chef orders…");

  async function load() {
    const response = await fetch("/api/chef/orders", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(response.status === 403 ? "An approved chef role is required." : "Chef orders are temporarily unavailable.");
    setOrders(body as ChefOrder[]);
    setMessage((body as ChefOrder[]).length ? "" : "No chef-owned orders are available yet.");
  }

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "Chef orders are temporarily unavailable.")); }, []);

  return <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">Order inbox</h2><button type="button" onClick={() => void load()} className="rounded-full border border-[#6930CA] px-4 py-2 text-sm font-bold text-[#6930CA]">Refresh</button></div><p role="status" className="mt-3 text-sm text-slate-600">{message}</p><div className="mt-5 space-y-4">{orders.map(order => <a key={order.id} href={`/chef/orders/${order.id}`} className="block rounded-2xl bg-white p-5 transition hover:shadow-lg"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#6930CA]">{formatChefOrderStatus(order.status)}</p><h3 className="mt-2 text-xl font-bold">{order.items.map(item => `${item.quantity}× ${item.itemName}`).join(", ")}</h3></div><strong>{money(order.foodSubtotal, order.currency)}</strong></div><div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600"><span>Placed {new Date(order.createdAt).toLocaleString("en-IN")}</span><span>{order.prepTimeMinutes ? `${order.prepTimeMinutes} min prep` : "Prep time pending"}</span></div></a>)}</div></section>;
}
