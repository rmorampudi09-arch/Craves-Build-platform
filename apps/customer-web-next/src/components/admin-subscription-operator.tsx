"use client";

import { useState } from "react";
import type { AdminSubscriptionStatus } from "@/lib/admin-subscription-operation-contract";
import type { CustomerSubscription } from "@/lib/subscription-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES: AdminSubscriptionStatus[] = [
  "PENDING_PAYMENT",
  "ACTIVE",
  "PAUSED",
  "PAYMENT_FAILED",
  "EXPIRED",
  "CANCELLED",
];

export function AdminSubscriptionOperator() {
  const [subscriptionId, setSubscriptionId] = useState("");
  const [item, setItem] = useState<CustomerSubscription | null>(null);
  const [status, setStatus] = useState<AdminSubscriptionStatus>("ACTIVE");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("Enter an exact subscription UUID.");
  const [busy, setBusy] = useState(false);

  async function lookup(event?: React.FormEvent) {
    event?.preventDefault();
    if (!UUID.test(subscriptionId)) {
      setMessage("Enter a valid subscription UUID.");
      setItem(null);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/subscriptions/${subscriptionId}`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (response.status === 404) throw new Error("Subscription was not found.");
      if (response.status === 401) throw new Error("Administrator session expired.");
      if (response.status === 403) throw new Error("Administrator access is required.");
      if (!response.ok) throw new Error("Subscription lookup failed.");
      setItem(body as CustomerSubscription);
      setStatus((body as CustomerSubscription).status);
      setMessage("");
    } catch (error) {
      setItem(null);
      setMessage(error instanceof Error ? error.message : "Subscription lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus() {
    if (!item || !reason.trim()) {
      setMessage("A reason is required for every administrative status change.");
      return;
    }
    if (!window.confirm(`Change subscription status from ${item.status} to ${status}?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/subscriptions/${item.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Subscription status update failed.");
      setItem(body as CustomerSubscription);
      setReason("");
      setMessage("Subscription status updated and history recorded by Subscription Service.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Subscription status update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[0.7fr_1.3fr]">
      <form onSubmit={lookup} className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950">
        <h2 className="text-2xl font-bold">Find subscription</h2>
        <p className="mt-2 text-sm text-slate-600">
          The backend does not currently provide an admin list/search contract, so this screen uses
          exact UUID lookup.
        </p>
        <label className="mt-5 block text-sm font-bold">
          Subscription UUID
          <input
            value={subscriptionId}
            onChange={(event) => setSubscriptionId(event.target.value.trim())}
            maxLength={64}
            className="mt-2 min-h-12 w-full rounded-2xl bg-white px-4 font-mono"
            required
          />
        </label>
        <button
          disabled={busy}
          className="mt-5 min-h-12 w-full rounded-2xl bg-[#6930CA] font-bold text-white disabled:opacity-50"
        >
          Look up
        </button>
        {message && (
          <p className="mt-4 text-sm leading-6 text-slate-600" role="status">
            {message}
          </p>
        )}
      </form>
      <section>
        {item ? (
          <div className="rounded-[30px] bg-white p-6 text-slate-950">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6930CA]">
                  {item.status.replaceAll("_", " ")}
                </p>
                <h2 className="mt-2 text-3xl font-bold">Subscription operation</h2>
              </div>
              <span className="font-mono text-xs text-slate-500">{item.id}</span>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-slate-500">Plan</dt>
                <dd className="font-mono text-sm font-semibold">{item.planId}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Start date</dt>
                <dd className="font-semibold">{item.startDate}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Next service</dt>
                <dd className="font-semibold">{item.nextServiceDate ?? "Not scheduled"}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">End date</dt>
                <dd className="font-semibold">{item.endDate ?? "Not ended"}</dd>
              </div>
            </dl>
            <div className="mt-7 border-t pt-6">
              <label className="block text-sm font-bold">
                New status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as AdminSubscriptionStatus)}
                  className="mt-2 min-h-12 w-full rounded-2xl bg-[#FFF8EC] px-4"
                >
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-5 block text-sm font-bold">
                Operational reason
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  className="mt-2 min-h-28 w-full rounded-2xl bg-[#FFF8EC] p-4"
                  required
                />
              </label>
              <button
                disabled={busy || !reason.trim()}
                onClick={() => void updateStatus()}
                className="mt-5 min-h-12 w-full rounded-2xl bg-[#6930CA] font-bold text-white disabled:opacity-50"
              >
                Apply status
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-[30px] border border-dashed border-[#cfc4d7] bg-white p-8 text-slate-600">
            A successfully located subscription will appear here.
          </div>
        )}
      </section>
    </div>
  );
}
