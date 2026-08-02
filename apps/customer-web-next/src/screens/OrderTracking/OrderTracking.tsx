"use client";

import { useEffect, useRef, useState } from "react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { CustomerOrder } from "@/lib/order-contract";
import { formatOrderStatus } from "@/lib/order-contract";
import type { DeliveryStatusResponse } from "@/lib/delivery-status";
import { presentationFor, shouldAutoRefresh } from "@/lib/delivery-status";
import { loadSession } from "@/services/auth/cravesAuth";
import { BottomNavAll } from "@/components/layout/BottomNav";
import { TrackingHeader } from "@/components/tracking/TrackingHeader";
import { CurrentStatusCard } from "@/components/tracking/CurrentStatusCard";
import { OrderTimeline } from "@/components/tracking/OrderTimeline";
import { DeliveryAddressCard } from "@/components/tracking/DeliveryAddressCard";
import { TrackingOrderSummaryCard } from "@/components/tracking/TrackingOrderSummaryCard";
const routeApi = getRouteApi("/tracking");

export default function TrackingPage() {
  const navigate = useNavigate(); const { id } = routeApi.useSearch(); const [order, setOrder] = useState<CustomerOrder | null>(null); const [delivery, setDelivery] = useState<DeliveryStatusResponse | null>(null); const deliveryRef = useRef<DeliveryStatusResponse | null>(null); const [message, setMessage] = useState("Loading order tracking…"); const [busy, setBusy] = useState(false);
  async function refresh(orderId: string) { setBusy(true); try { const [orderResponse, deliveryResponse] = await Promise.all([fetch(`/api/orders/${orderId}`, { cache: "no-store" }), fetch(`/api/orders/${orderId}/delivery-status`, { cache: "no-store" })]); const orderBody = await orderResponse.json().catch(() => null); if (!orderResponse.ok) throw new Error(orderBody?.message || "Order could not be loaded."); setOrder(orderBody); if (deliveryResponse.ok) { const deliveryBody = await deliveryResponse.json(); deliveryRef.current = deliveryBody; setDelivery(deliveryBody); setMessage(`Updated ${new Date().toLocaleTimeString("en-IN")}.`); } else { deliveryRef.current = null; setDelivery(null); setMessage("Delivery tracking will appear when a delivery job is created."); } } catch (error) { setMessage(error instanceof Error ? error.message : "Order tracking is unavailable."); } finally { setBusy(false); } }
  useEffect(() => { if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { navigate({ to: "/orders" }); return; } let cancelled = false; void (async () => { if (!await loadSession()) { navigate({ to: "/" }); return; } if (!cancelled) await refresh(id); })(); const timer = setInterval(() => { if (!cancelled && document.visibilityState === "visible" && shouldAutoRefresh(deliveryRef.current?.status ?? null)) void refresh(id); }, 30_000); return () => { cancelled = true; clearInterval(timer); }; }, [id, navigate]);
  if (!id) return null; const presentation = presentationFor(delivery?.status ?? null); const address = order?.deliveryAddress ? [order.deliveryAddress.addressLine1, order.deliveryAddress.addressLine2, order.deliveryAddress.areaName, order.deliveryAddress.city, order.deliveryAddress.state, order.deliveryAddress.postalCode].filter(Boolean).join(", ") : undefined;
  const steps = delivery?.history.length ? delivery.history.map((entry) => { const item = presentationFor(entry.newStatus); return { key: `${entry.newStatus}-${entry.recordedAt}`, label: item.label, desc: new Date(entry.observedAt).toLocaleString("en-IN") }; }) : [{ key: order?.status ?? "waiting", label: order ? formatOrderStatus(order.status) : "Loading order", desc: order ? "Current status from Order Service" : "Please wait" }];
  return <div className="min-h-screen bg-cream pb-24"><TrackingHeader orderId={id} onBack={() => navigate({ to: "/orders" })} /><main className="mx-auto max-w-3xl px-4 pt-6 md:px-6">{order && <><CurrentStatusCard label={delivery ? presentation.label : formatOrderStatus(order.status)} desc={delivery ? presentation.description : "Order status from Craves. Delivery tracking begins after a delivery job is created."} /><OrderTimeline steps={steps} currentIndex={steps.length - 1} />{delivery?.trackingUrl && <a href={delivery.trackingUrl} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-primary p-3 text-sm font-bold text-primary">Open provider tracking <ExternalLink className="h-4 w-4" /></a>}<DeliveryAddressCard address={address} /><TrackingOrderSummaryCard order={order} /></>}<div className="mt-4 flex items-center justify-between rounded-xl bg-secondary p-3 text-sm text-muted-foreground"><span role="status">{message}</span><button type="button" disabled={busy} onClick={() => void refresh(id)} className="ml-3 rounded-full p-2 text-primary" aria-label="Refresh tracking"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /></button></div><Link to="/home" className="btn-primary mt-6 flex w-full justify-center">Back to Home</Link></main><BottomNavAll /></div>;
}
