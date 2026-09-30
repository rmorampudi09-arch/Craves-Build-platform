"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  PackageCheck,
  XCircle,
} from "lucide-react";
import {
  parseChefOrderResponse,
  type ChefOrder,
} from "@/lib/chef-order-contract";

type DecisionStep = "choose" | "accept" | "decline";

const PREP_CHOICES = [15, 30, 45, 60] as const;
const DECLINE_REASONS = [
  "I’m too busy right now",
  "I don’t have the ingredients",
  "My kitchen is closed today",
  "Something else",
] as const;

function responseMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : fallback;
}

export function ChefOrderActions({
  order,
  onUpdated,
}: {
  order: ChefOrder;
  onUpdated(order: ChefOrder): void;
}) {
  const [decisionStep, setDecisionStep] = useState<DecisionStep>("choose");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(
    order.prepTimeMinutes ? String(order.prepTimeMinutes) : "30",
  );
  const [note, setNote] = useState(order.chefResponseNote ?? "");
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function act(path: string, body?: Record<string, unknown>) {
    if (busyAction) return;
    setBusyAction(path);
    setMessage("Saving your answer…");
    setError("");
    try {
      const response = await fetch(`/api/chef/orders/${order.id}/${path}`, {
        method: "POST",
        credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? "This order changed while you were looking at it. Refresh the order and check it again."
            : responseMessage(result, "We couldn’t save your answer. Please try again."),
        );
      }
      const updated = parseChefOrderResponse(result);
      if (!updated || updated.id.toLowerCase() !== order.id.toLowerCase()) {
        throw new Error("We couldn’t confirm the updated order. Please refresh it.");
      }
      onUpdated(updated);
      setMessage(path === "ready-for-pickup" ? "Food marked ready for pickup." : "Your answer is saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t save your answer. Please try again.");
      setMessage("");
    } finally {
      setBusyAction(null);
    }
  }

  const singleBorderField =
    "mt-2 w-full rounded-xl border border-border bg-white text-base text-[#1A1A1A] outline-none ring-0 focus:border-[#E5E7EB] focus:outline-none focus:ring-0";

  if (order.status === "CHEF_ACCEPTANCE_PENDING") {
    if (decisionStep === "choose") {
      return (
        <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><Clock3 className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
          <p className="mt-5 text-sm font-semibold text-[#F62E18]">New order</p>
          <h2 className="mt-1 text-3xl font-bold text-[#1A1A1A]">Can you cook this now?</h2>
          <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Choose the answer that feels right. We’ll only ask about cooking time after you say yes.</p>
          <div className="mt-6 grid gap-3">
            <button type="button" disabled={Boolean(busyAction)} onClick={() => { setError(""); setMessage(""); setDecisionStep("accept"); }} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Yes, I can cook this</button>
            <button type="button" disabled={Boolean(busyAction)} onClick={() => { setError(""); setMessage(""); setDecisionStep("decline"); }} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-6 font-semibold text-[#1A1A1A] disabled:opacity-50"><XCircle className="h-5 w-5" aria-hidden="true" /> No, not today</button>
          </div>
        </section>
      );
    }

    if (decisionStep === "accept") {
      const prep = Number(prepTimeMinutes);
      const validPrep = Number.isInteger(prep) && prep >= 1 && prep <= 1_440;
      const standardPrep = PREP_CHOICES.includes(prep as (typeof PREP_CHOICES)[number]);
      return (
        <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-8">
          <button type="button" onClick={() => setDecisionStep("choose")} className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#1A1A1A]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</button>
          <h2 className="mt-5 text-3xl font-bold text-[#1A1A1A]">How long will you need?</h2>
          <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Choose a comfortable cooking and packing time.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PREP_CHOICES.map((minutes) => (
              <button key={minutes} type="button" onClick={() => setPrepTimeMinutes(String(minutes))} className={`min-h-16 rounded-2xl border text-lg font-bold ${prep === minutes ? "border-[#F62E18] text-[#F62E18] ring-2 ring-[#F62E18]/10" : "border-[#E5E7EB] text-[#1A1A1A]"}`}>{minutes} min</button>
            ))}
          </div>
          <details className="mt-4 rounded-2xl bg-[#F1F3F5] p-4" open={!standardPrep}>
            <summary className="cursor-pointer text-sm font-semibold text-[#1A1A1A]">Another cooking time</summary>
            <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">Minutes<input type="number" inputMode="numeric" min={1} max={1440} value={standardPrep ? "" : prepTimeMinutes} onChange={(event) => setPrepTimeMinutes(event.target.value)} className={`${singleBorderField} min-h-12 px-4`} data-craves-single-border="true" /></label>
          </details>
          <details className="mt-4 rounded-2xl bg-[#F1F3F5] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[#1A1A1A]">Add a note <span className="font-normal text-[#6B6B6B]">(optional)</span></summary>
            <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">Short note<input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className={`${singleBorderField} min-h-12 px-4`} placeholder="Anything useful about preparation or packing" data-craves-single-border="true" /></label>
          </details>
          <p className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">The order will show: <strong className="text-[#1A1A1A]">Ready in about {validPrep ? prep : "—"} minutes.</strong></p>
          {!validPrep ? <p className="mt-3 text-sm font-medium text-[#F62E18]">Choose a cooking time before continuing.</p> : null}
          {message ? <p role="status" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm font-medium text-[#F62E18]">{error}</p> : null}
          <button type="button" disabled={Boolean(busyAction) || !validPrep} onClick={() => void act("accept", { prepTimeMinutes: prep, note: note.trim() || null, actionId: crypto.randomUUID() })} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">{busyAction === "accept" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}{busyAction === "accept" ? "Saving…" : "Start cooking"}</button>
        </section>
      );
    }

    const reason = selectedReason === "Something else" ? customReason.trim() : selectedReason;
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-8">
        <button type="button" onClick={() => setDecisionStep("choose")} className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#1A1A1A]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</button>
        <h2 className="mt-5 text-3xl font-bold text-[#1A1A1A]">That’s okay. What happened?</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Pick the closest reason so the order can move on.</p>
        <div className="mt-6 grid gap-3">
          {DECLINE_REASONS.map((item) => (
            <button key={item} type="button" onClick={() => { setSelectedReason(item); setError(""); }} className={`min-h-12 rounded-2xl border px-4 text-left text-sm font-semibold ${selectedReason === item ? "border-[#F62E18] text-[#F62E18] ring-2 ring-[#F62E18]/10" : "border-[#E5E7EB] text-[#1A1A1A]"}`}>{item}</button>
          ))}
        </div>
        {selectedReason === "Something else" ? (
          <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">Tell us briefly<textarea value={customReason} maxLength={500} onChange={(event) => setCustomReason(event.target.value)} className={`${singleBorderField} min-h-24 p-4`} placeholder="A short reason is enough" data-craves-single-border="true" /></label>
        ) : null}
        {message ? <p role="status" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm font-medium text-[#F62E18]">{error}</p> : null}
        <button type="button" disabled={Boolean(busyAction) || reason.length < 3} onClick={() => void act("reject", { reason, actionId: crypto.randomUUID() })} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">{busyAction === "reject" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}{busyAction === "reject" ? "Saving…" : "Confirm I can’t make this"}</button>
      </section>
    );
  }

  if (order.status === "CHEF_ACCEPTED" || order.status === "PREPARING") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-8">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><PackageCheck className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
        <p className="mt-5 text-sm font-semibold text-[#F62E18]">Cooking</p>
        <h2 className="mt-1 text-3xl font-bold text-[#1A1A1A]">Is all the food packed and ready?</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Only mark it ready after every item in this order is cooked and packed.</p>
        {message ? <p role="status" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm font-medium text-[#F62E18]">{error}</p> : null}
        <button type="button" disabled={Boolean(busyAction)} onClick={() => void act("ready-for-pickup")} className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">{busyAction ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PackageCheck className="h-4 w-4" aria-hidden="true" />}{busyAction ? "Saving…" : "Food is ready for pickup"}</button>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5]"><CheckCircle2 className="h-6 w-6 text-[#F62E18]" aria-hidden="true" /></span>
      <h2 className="mt-4 text-xl font-bold text-[#1A1A1A]">Nothing to do right now</h2>
      <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">This order will update here when another chef action is needed.</p>
    </section>
  );
}
