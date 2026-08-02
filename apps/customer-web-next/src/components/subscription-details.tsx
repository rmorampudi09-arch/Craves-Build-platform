"use client";

import { useEffect, useState } from "react";
import type { CustomerSubscription } from "@/lib/subscription-contract";

export function SubscriptionDetails({ subscriptionId }: { subscriptionId: string }) {
  const [item, setItem] = useState<CustomerSubscription | null>(null);
  const [message, setMessage] = useState("Loading subscription…");

  useEffect(() => {
    let active = true;
    fetch(`/api/subscriptions/${subscriptionId}`, { cache: "no-store" })
      .then(async response => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) throw new Error(response.status === 404 ? "Subscription was not found." : "Subscription is temporarily unavailable.");
        setItem(body as CustomerSubscription); setMessage("");
      })
      .catch(error => active && setMessage(error instanceof Error ? error.message : "Subscription is unavailable."));
    return () => { active = false; };
  }, [subscriptionId]);

  if (!item) return <section className="rounded-[28px] bg-[#FFF8EC] p-6 text-slate-950"><p role="status">{message}</p></section>;
  return <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 sm:p-8">
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">{item.status.replaceAll("_", " ")}</p>
    <h2 className="mt-3 text-3xl font-bold">Meal subscription</h2>
    <dl className="mt-6 grid gap-4 sm:grid-cols-2">
      <div><dt className="text-sm text-slate-500">Start date</dt><dd className="font-semibold">{item.startDate}</dd></div>
      <div><dt className="text-sm text-slate-500">Next service date</dt><dd className="font-semibold">{item.nextServiceDate ?? "Not scheduled"}</dd></div>
      <div><dt className="text-sm text-slate-500">End date</dt><dd className="font-semibold">{item.endDate ?? "Not ended"}</dd></div>
      <div><dt className="text-sm text-slate-500">Delivery address</dt><dd className="font-semibold">{item.deliveryAddressId ? "Saved address selected" : "Not selected"}</dd></div>
    </dl>
    {item.notes && <div className="mt-6 rounded-2xl bg-white p-4 text-sm leading-6"><strong>Notes</strong><p className="mt-2">{item.notes}</p></div>}
    <p className="mt-6 text-xs text-slate-500">Created {new Date(item.createdAt).toLocaleString("en-IN")}</p>
  </section>;
}
