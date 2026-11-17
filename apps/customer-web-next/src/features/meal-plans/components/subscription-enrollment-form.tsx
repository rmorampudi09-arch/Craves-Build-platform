"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletionCopy } from "@/features/account-deletion/domain/deletion-copy";
import { isDeletionPaused } from "@/features/account-deletion/domain/deletion-model";
import { addressText, isDeliveryReadyAddress, type CustomerAddress } from "@/features/addresses/lib/address-contract";
import { getPlanCover } from "@/features/meal-plans/api/plan-cover";
import { PlanScheduleList } from "@/features/meal-plans/components/plan-schedule-list";
import { formatMoney, planDay, startDateChoices } from "@/features/meal-plans/lib/meal-plan-copy";
import { billingPeriodLabel, billingUnit } from "@/features/meal-plans/lib/meal-plan-schedule";
import {
  indiaBusinessDate,
  parseCustomerSubscription,
  type CustomerSubscription,
  type PublicSubscriptionPlan,
} from "@/features/meal-plans/lib/subscription-contract";
import type { PublicSubscriptionSchedule } from "@/features/meal-plans/lib/subscription-schedule-contract";
import { ChoiceChips } from "@/shared/ui/forms/ChoiceChips";
import { RequiredMark } from "@/shared/ui/forms/required-mark";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { sessionFetch } from "@/shared/lib/session-fetch";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `subscription:${crypto.randomUUID()}`;
  }
  return `subscription:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

const LOADING_PLAN = "Loading your meal plan…";

/** The customer's own plan for the same plan, address and start date that still waits for payment, if any. */
async function unpaidTwin(planId: string, addressId: string, startDate: string): Promise<CustomerSubscription | null> {
  const response = await sessionFetch("/api/subscriptions", { cache: "no-store" }).catch(() => null);
  const items: unknown = response?.ok ? await response.json().catch(() => null) : null;
  if (!Array.isArray(items)) return null;
  return (
    (items as CustomerSubscription[]).find(
      item =>
        (item.status === "PENDING_PAYMENT" || item.status === "PAYMENT_FAILED") &&
        item.planId === planId &&
        item.deliveryAddressId === addressId &&
        item.startDate === startDate,
    ) ?? null
  );
}

/**
 * Subscribing, as in the app: the plan and its price, what you'll receive, a start date from the next 7 days,
 * a delivery-ready address, notes, then payment.
 */
export function SubscriptionEnrollmentForm({ planId }: { planId: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState<PublicSubscriptionPlan | null>(null);
  const [schedule, setSchedule] = useState<PublicSubscriptionSchedule | null | undefined>(undefined);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [incomplete, setIncomplete] = useState(false);
  const [addressId, setAddressId] = useState("");
  const today = useMemo(() => indiaBusinessDate(), []);
  const dates = useMemo(() => startDateChoices(today), [today]);
  const [startDate, setStartDate] = useState(dates[0]);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState(LOADING_PLAN);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const idempotencyKey = useRef("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/subscriptions/plans", { cache: "no-store" }).then(async response => {
        if (!response.ok) throw new Error("We couldn’t load this meal plan. Please try again shortly.");
        return response.json();
      }),
      sessionFetch("/api/customer/addresses", { cache: "no-store" }).then(async response => {
        if (response.status === 401) throw new Error("Your session expired. Sign in again.");
        if (!response.ok) throw new Error("We couldn’t load your saved addresses. Please try again.");
        return response.json();
      }),
    ])
      .then(([plansBody, addressesBody]) => {
        if (!active) return;
        const selected = (plansBody as PublicSubscriptionPlan[]).find(item => item.id === planId) ?? null;
        if (!selected) throw new Error("This meal plan isn’t available right now.");
        const saved = (addressesBody as CustomerAddress[]).filter(item => item.active);
        // As in the app, only addresses with a map pin, PIN code and name can take a meal plan.
        const ready = saved.filter(isDeliveryReadyAddress);
        setPlan(selected);
        setAddresses(ready);
        setIncomplete(saved.length > ready.length && ready.length === 0);
        const preferred = ready.find(item => item.isDefault) ?? ready[0];
        if (preferred) setAddressId(preferred.id);
        setMessage(""); // No address: the "Deliver to" field explains it and links to add one.
      })
      .catch(error => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "We couldn’t load this meal plan. Please try again shortly.");
        }
      });
    // What you'll receive; a plan without a published schedule says so.
    void getPlanCover(planId).then(
      cover => {
        if (active) setSchedule(cover.schedule?.items.length ? cover.schedule : null);
      },
      () => {
        if (active) setSchedule(null);
      },
    );
    return () => {
      active = false;
    };
  }, [planId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!plan || !addressId || !startDate || busy) return;
    setBusy(true);
    setPaused(false);
    setMessage("");
    try {
      // Starting the same plan again goes back to its payment, never to a second unpaid plan.
      const unpaid = await unpaidTwin(plan.id, addressId, startDate);
      if (unpaid) {
        router.push(`/subscriptions/${encodeURIComponent(unpaid.id)}/payment`);
        return;
      }
      if (!idempotencyKey.current) idempotencyKey.current = newIdempotencyKey();
      const response = await sessionFetch("/api/subscriptions", {
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
      if ((body as { code?: unknown } | null)?.code === "DELIVERY_ADDRESS_OUT_OF_RANGE") {
        throw new Error("This chef delivers meal plans within 10 km of their kitchen. Choose a saved address closer to the chef.");
      }
      if (response.status === 409 && isDeletionPaused((body as { code?: string } | null)?.code)) {
        setPaused(true);
        setBusy(false);
        return;
      }
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

  if (!plan) {
    if (message === LOADING_PLAN) return <CustomerSectionSkeleton variant="plan-form" label={LOADING_PLAN} />;
    return (
      <p role="status" className="rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-xl rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6B6B6B]">
        {billingPeriodLabel(plan.billingPeriod)}
      </p>
      <h2 className="mt-1 text-2xl font-bold text-[#1A1A1A]">{plan.name}</h2>
      <p className="mt-1 text-[#1A1A1A]">
        <strong className="text-xl">{formatMoney(plan.amount, plan.currency)}</strong>
        <span className="text-sm text-[#6B6B6B]"> / {billingUnit(plan.billingPeriod)}</span>
      </p>
      {plan.description ? <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{plan.description}</p> : null}

      <section className="mt-6" aria-labelledby="plan-what-you-receive">
        <h3 id="plan-what-you-receive" className="text-sm font-bold text-[#1A1A1A]">
          What you’ll receive
        </h3>
        {schedule ? (
          <PlanScheduleList schedule={schedule} />
        ) : (
          <p className="mt-1 text-sm text-[#6B6B6B]">
            {schedule === undefined ? "Loading the meals…" : "The chef hasn’t published this plan’s meals yet."}
          </p>
        )}
      </section>

      <ChoiceChips
        legend="Start date"
        name="startDate"
        value={startDate}
        options={dates.map(date => [date, planDay(date)] as const)}
        onChange={setStartDate}
      />

      <fieldset className="mt-6">
        <legend className="text-sm font-bold text-[#1A1A1A]">
          Deliver to
          <RequiredMark />
        </legend>
        {addresses.length > 0 ? (
          <div className="mt-2.5 space-y-2">
            {addresses.map(address => (
              <label
                key={address.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3.5 has-[:checked]:border-[#C92716] has-[:checked]:bg-[#FDEAE8]"
              >
                <input
                  type="radio"
                  name="deliveryAddressId"
                  value={address.id}
                  checked={addressId === address.id}
                  onChange={() => setAddressId(address.id)}
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#C92716]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[#1A1A1A]">{address.addressLabel}</span>
                  <span className="mt-0.5 block text-sm text-[#6B6B6B]">{addressText(address)}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#6B6B6B]">
            {incomplete
              ? "Your saved addresses need a map pin, a PIN code and a name before a meal plan can start."
              : "You don’t have a delivery address yet."}{" "}
            <Link href="/addresses" className="font-bold text-[#1A1A1A] underline underline-offset-2">
              {incomplete ? "Update an address" : "Add an address"}
            </Link>
          </p>
        )}
      </fieldset>

      <label className="mt-6 block text-sm font-bold text-[#1A1A1A]">
        Notes for the chef (optional)
        <textarea
          maxLength={2000}
          value={notes}
          onChange={event => setNotes(event.target.value)}
          className="mt-2 min-h-24 w-full rounded-xl border border-[#E5E7EB] bg-white p-4 text-base font-normal text-[#1A1A1A]"
        />
      </label>
      {message || paused ? (
        <p className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]" role="alert">
          {paused ? (
            <>
              {deletionCopy.paused.mealPlans(null)}{" "}
              <Link href="/account/delete" className="font-bold text-[#1A1A1A] underline underline-offset-2">
                {deletionCopy.paused.link}
              </Link>
            </>
          ) : message}
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
