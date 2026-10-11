"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomerAddress } from "@/features/addresses/lib/address-contract";
import {
  parseCustomerSubscription,
  type PublicSubscriptionPlan,
} from "@/features/meal-plans/lib/subscription-contract";
import { RequiredMark } from "@/shared/ui/forms/required-mark";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `subscription:${crypto.randomUUID()}`;
  }
  return `subscription:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function SubscriptionEnrollmentForm({ planId }: { planId: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState<PublicSubscriptionPlan | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressId, setAddressId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("Loading your meal plan…");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef("");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/subscriptions/plans", { cache: "no-store" }).then(async response => {
        if (!response.ok) throw new Error("We couldn’t load this meal plan. Please try again shortly.");
        return response.json();
      }),
      fetch("/api/customer/addresses", { cache: "no-store" }).then(async response => {
        if (response.status === 401) throw new Error("Your session expired. Sign in again.");
        if (!response.ok) throw new Error("We couldn’t load your saved addresses. Please try again.");
        return response.json();
      }),
    ])
      .then(([plansBody, addressesBody]) => {
        if (!active) return;
        const selected = (plansBody as PublicSubscriptionPlan[]).find(item => item.id === planId) ?? null;
        if (!selected) throw new Error("This meal plan isn’t available right now.");
        const activeAddresses = (addressesBody as CustomerAddress[]).filter(item => item.active);
        setPlan(selected);
        setAddresses(activeAddresses);
        const preferred = activeAddresses.find(item => item.isDefault) ?? activeAddresses[0];
        if (preferred) setAddressId(preferred.id);
        setStartDate(today);
        setMessage(""); // No address: the "Deliver to" field explains it and links to add one.
      })
      .catch(error => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "We couldn’t load this meal plan. Please try again shortly.");
        }
      });
    return () => {
      active = false;
    };
  }, [planId, today]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!plan || !addressId || !startDate || busy) return;
    if (!idempotencyKey.current) idempotencyKey.current = newIdempotencyKey();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          planId: plan.id,
          startDate,
          deliveryAddressId: addressId,
          notes: notes || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (response.status === 401) throw new Error("Your session expired. Sign in again.");
      if (response.status === 409) {
        throw new Error("We already received this request. Refresh the page before trying again.");
      }
      if (!response.ok) {
        throw new Error("We couldn’t start this plan. Check the start date and address, then try again.");
      }
      const subscription = parseCustomerSubscription(body);
      if (!subscription) throw new Error("We couldn’t start this plan. Please try again.");
      router.push(`/subscriptions/${encodeURIComponent(subscription.id)}/payment`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn’t start this plan. Please try again.");
      setBusy(false);
    }
  }

  const fieldClass =
    "mt-2 min-h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-base text-[#1A1A1A]";

  if (!plan) {
    return (
      <p role="status" className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-xl rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6B6B6B]">
        {plan.billingPeriod === "WEEKLY" ? "Weekly plan" : "Monthly plan"}
      </p>
      <h2 className="mt-1 text-2xl font-bold text-[#1A1A1A]">{plan.name}</h2>
      {plan.description ? <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{plan.description}</p> : null}
      <label className="mt-6 block text-sm font-semibold text-[#1A1A1A]">
        Deliver to
        <RequiredMark />
        <select
          value={addressId}
          onChange={event => setAddressId(event.target.value)}
          className={fieldClass}
          required
        >
          <option value="">Choose an address</option>
          {addresses.map(address => (
            <option key={address.id} value={address.id}>
              {address.addressLabel}: {address.addressLine1}, {address.areaName}
            </option>
          ))}
        </select>
      </label>
      {addresses.length === 0 ? (
        <p className="mt-2 text-sm text-[#6B6B6B]">
          You don’t have a delivery address yet.{" "}
          <Link href="/addresses" className="font-bold text-[#1A1A1A] underline underline-offset-2">
            Add an address
          </Link>
        </p>
      ) : null}
      <label className="mt-5 block text-sm font-semibold text-[#1A1A1A]">
        Start date
        <RequiredMark />
        <input
          type="date"
          min={today}
          value={startDate}
          onChange={event => setStartDate(event.target.value)}
          className={fieldClass}
          required
        />
      </label>
      <label className="mt-5 block text-sm font-semibold text-[#1A1A1A]">
        Notes for the chef (optional)
        <textarea
          maxLength={2000}
          value={notes}
          onChange={event => setNotes(event.target.value)}
          className="mt-2 min-h-24 w-full rounded-xl border border-[#E5E7EB] bg-white p-4 text-base text-[#1A1A1A]"
        />
      </label>
      {message ? (
        <p className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]" role="alert">
          {message}
        </p>
      ) : null}
      <button
        disabled={busy || addresses.length === 0}
        aria-busy={busy}
        className="craves-primary-action mt-6 w-full"
      >
        {busy ? "Setting up…" : "Continue to payment"}
      </button>
    </form>
  );
}
