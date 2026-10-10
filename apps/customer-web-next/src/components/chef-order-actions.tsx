"use client";

import { CHEF_ERROR_MESSAGES, ChefError, chefApiError, chefErrorText } from "@/lib/chef-errors";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  LoaderCircle,
  PackageCheck,
  XCircle,
} from "lucide-react";
import { ChefNotice, ChefSection } from "@/components/chef-ui";
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
        const failure = chefApiError(response, result, "We couldn’t save your answer. Please try again.");
        // A conflict we have no exact text for keeps the plain "order changed" advice.
        throw response.status === 409 && !CHEF_ERROR_MESSAGES[failure.ref]
          ? new ChefError("This order changed while you were looking at it. Refresh the order and check it again.", failure.ref, 409)
          : failure;
      }
      const updated = parseChefOrderResponse(result);
      if (!updated || updated.id.toLowerCase() !== order.id.toLowerCase()) {
        throw new ChefError("We couldn’t confirm the updated order. Please refresh it.", "INVALID_CHEF_ORDER_RESPONSE", response.status);
      }
      onUpdated(updated);
      setMessage(path === "ready-for-pickup" ? "Food marked ready for pickup." : "Your answer is saved.");
    } catch (caught) {
      setError(chefErrorText(caught, "We couldn’t save your answer. Please try again."));
      setMessage("");
    } finally {
      setBusyAction(null);
    }
  }

  const field =
    "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-[#1A1A1A]";
  const choice =
    "flex min-h-14 items-center justify-center rounded-xl border text-base font-semibold transition-colors";
  const feedback = (
    <>
      {message ? <p role="status" className="mt-4 text-[0.9375rem] text-[#6B6B6B]">{message}</p> : null}
      {error ? <ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice> : null}
    </>
  );
  const backButton = (
    <button type="button" onClick={() => setDecisionStep("choose")} className="chef-btn is-small !border-0 !bg-transparent px-2">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
    </button>
  );

  if (order.status === "CHEF_ACCEPTANCE_PENDING") {
    if (decisionStep === "choose") {
      return (
        <ChefSection title="Can you cook this now?" note="If you accept, you’ll choose how long it takes.">
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={Boolean(busyAction)} onClick={() => { setError(""); setMessage(""); setDecisionStep("accept"); }} className="chef-btn is-primary">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Accept order
            </button>
            <button type="button" disabled={Boolean(busyAction)} onClick={() => { setError(""); setMessage(""); setDecisionStep("decline"); }} className="chef-btn is-danger">
              <XCircle className="h-5 w-5" aria-hidden="true" /> Can’t take it
            </button>
          </div>
        </ChefSection>
      );
    }

    if (decisionStep === "accept") {
      const prep = Number(prepTimeMinutes);
      const validPrep = Number.isInteger(prep) && prep >= 1 && prep <= 1_440;
      const standardPrep = PREP_CHOICES.includes(prep as (typeof PREP_CHOICES)[number]);
      return (
        <ChefSection title="How long will it take?" note="Time to cook and pack the whole order." action={backButton}>
          <div className="chef-step">
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Cooking time">
              {PREP_CHOICES.map((minutes) => (
                <button key={minutes} type="button" role="radio" aria-checked={prep === minutes} onClick={() => setPrepTimeMinutes(String(minutes))} className={`${choice} ${prep === minutes ? "!border-[#1A1A1A] !bg-[#1A1A1A] !text-white" : "!border-[#D3D7DD] !bg-white !text-[#1A1A1A]"}`}>
                  {minutes}<span className="ml-0.5 text-sm font-medium">min</span>
                </button>
              ))}
            </div>
            <details className="mt-4" open={!standardPrep}>
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-[0.9375rem] font-semibold text-[#1A1A1A]">Another cooking time</summary>
              <label className="mt-1 block text-sm font-semibold text-[#1A1A1A]">Minutes<input type="number" inputMode="numeric" min={1} max={1440} value={standardPrep ? "" : prepTimeMinutes} onChange={(event) => setPrepTimeMinutes(event.target.value)} className={field} data-craves-single-border="true" /></label>
            </details>
            <details className="mt-1">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-[0.9375rem] font-semibold text-[#1A1A1A]">Add a note <span className="ml-1 font-normal text-[#6B6B6B]">(optional)</span></summary>
              <label className="mt-1 block text-sm font-semibold text-[#1A1A1A]">Note for the order<input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className={field} placeholder="Anything useful about cooking or packing" data-craves-single-border="true" /></label>
            </details>
            <p className="mt-4 text-[0.9375rem] text-[#6B6B6B]">The customer will see <strong className="text-[#1A1A1A]">Ready in about {validPrep ? prep : "—"} minutes</strong>.</p>
            {!validPrep ? <p className="chef-field-error">Choose a cooking time before continuing.</p> : null}
            {feedback}
            <button type="button" aria-busy={busyAction === "accept"} disabled={Boolean(busyAction) || !validPrep} onClick={() => void act("accept", { prepTimeMinutes: prep, note: note.trim() || null, actionId: crypto.randomUUID() })} className="chef-btn is-primary is-block mt-5">{busyAction === "accept" ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}{busyAction === "accept" ? "Saving…" : "Start cooking"}</button>
          </div>
        </ChefSection>
      );
    }

    const reason = selectedReason === "Something else" ? customReason.trim() : selectedReason;
    return (
      <ChefSection title="Why can’t you take it?" note="Pick the closest reason. The customer will see that your kitchen couldn’t take this order." action={backButton}>
        <div className="chef-step">
          <div className="grid gap-2" role="radiogroup" aria-label="Reason">
            {DECLINE_REASONS.map((item) => (
              <button key={item} type="button" role="radio" aria-checked={selectedReason === item} onClick={() => { setSelectedReason(item); setError(""); }} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 text-left text-[0.9375rem] font-semibold ${selectedReason === item ? "!border-[#1A1A1A] !bg-white !text-[#1A1A1A] shadow-[inset_0_0_0_1px_#1A1A1A]" : "!border-[#D3D7DD] !bg-white !text-[#1A1A1A]"}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${selectedReason === item ? "border-[#1A1A1A]" : "border-[#B8BDC4]"}`} aria-hidden="true">{selectedReason === item ? <span className="h-2.5 w-2.5 rounded-full bg-[#1A1A1A]" /> : null}</span>
                {item}
              </button>
            ))}
          </div>
          {selectedReason === "Something else" ? (
            <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">Tell us briefly<textarea value={customReason} maxLength={500} onChange={(event) => setCustomReason(event.target.value)} className={`${field} min-h-24 py-3`} placeholder="A short reason is enough" data-craves-single-border="true" /></label>
          ) : null}
          {feedback}
          <button type="button" aria-busy={busyAction === "reject"} disabled={Boolean(busyAction) || reason.length < 3} onClick={() => void act("reject", { reason, actionId: crypto.randomUUID() })} className="chef-btn is-primary is-block mt-5">{busyAction === "reject" ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}{busyAction === "reject" ? "Saving…" : "Decline order"}</button>
        </div>
      </ChefSection>
    );
  }

  if (order.status === "CHEF_ACCEPTED" || order.status === "PREPARING") {
    return (
      <ChefSection title="Is everything packed?" note="Mark it ready only when every item in this order is cooked and packed.">
        {feedback}
        <button type="button" aria-busy={Boolean(busyAction)} disabled={Boolean(busyAction)} onClick={() => void act("ready-for-pickup")} className="chef-btn is-primary is-block mt-1">{busyAction ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PackageCheck className="h-5 w-5" aria-hidden="true" />}{busyAction ? "Saving…" : "Food is ready for pickup"}</button>
      </ChefSection>
    );
  }

  return (
    <ChefNotice icon={CheckCircle2}>
      <p className="font-semibold">Nothing to do right now</p>
      <p className="mt-0.5 text-[#6B6B6B]">{message || "This order updates here if it needs you again."}</p>
    </ChefNotice>
  );
}
