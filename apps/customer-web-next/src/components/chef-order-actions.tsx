"use client";

import { CHEF_ERROR_MESSAGES, ChefError, chefApiError, chefErrorText } from "@/lib/chef-errors";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  PackageCheck,
  XCircle,
} from "lucide-react";
import { ChefNotice, ChefSection } from "@/components/chef-ui";
import { sessionFetch } from "@/services/auth/sessionFetch";
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

// Native radios (one Tab stop, arrow keys) drawn as tiles; the tile shows the focus ring.
const tile =
  "relative flex cursor-pointer items-center rounded-xl border text-[#1A1A1A] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#1A1A1A]";

/** The step's own box on the order page; on an order card (inline) just a heading and note. */
function Frame({
  inline,
  title,
  note,
  action,
  children,
}: {
  inline: boolean;
  title: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  if (!inline) return <ChefSection title={title} note={note} action={action}>{children}</ChefSection>;
  return (
    <div className="chef-order-step">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="chef-order-step-title">{title}</h3>
          {note ? <p className="chef-section-note mt-0.5">{note}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function ChefOrderActions({
  order,
  onUpdated,
  inline = false,
}: {
  order: ChefOrder;
  onUpdated(order: ChefOrder): void;
  /** On an order card: no box of its own, and nothing shown once the order needs nothing. */
  inline?: boolean;
}) {
  const standardInitial = PREP_CHOICES.includes(order.prepTimeMinutes as (typeof PREP_CHOICES)[number]);
  const [decisionStep, setDecisionStep] = useState<DecisionStep>("choose");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(
    order.prepTimeMinutes ? String(order.prepTimeMinutes) : "30",
  );
  // What the chef types under "Another cooking time" stays theirs, even when it matches a tile.
  const [customMinutes, setCustomMinutes] = useState(
    order.prepTimeMinutes && !standardInitial ? String(order.prepTimeMinutes) : "",
  );
  // Read once: the chef opens and closes "Another cooking time" freely after that.
  const [customOpen] = useState(() => Boolean(order.prepTimeMinutes) && !standardInitial);
  const [note, setNote] = useState(order.chefResponseNote ?? "");
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const stepChanged = useRef(false);

  // A new step replaces the buttons that were pressed: move focus to the new step's heading.
  useEffect(() => {
    if (!stepChanged.current) return;
    stepChanged.current = false;
    const heading = stepRef.current?.querySelector<HTMLElement>("h2, h3");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }, [decisionStep]);

  function goTo(step: DecisionStep) {
    if (busyAction) return;
    setError("");
    setMessage("");
    stepChanged.current = true;
    setDecisionStep(step);
  }

  async function act(path: string, body?: Record<string, unknown>) {
    if (busyAction) return;
    setBusyAction(path);
    setMessage("Saving your answer…");
    setError("");
    try {
      // A chef answers long after the page opened: refresh the short sign-in cookie if needed.
      const response = await sessionFetch(`/api/chef/orders/${order.id}/${path}`, {
        method: "POST",
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
      setMessage(
        path === "ready-for-pickup"
          ? "Food marked ready for pickup."
          : path === "reject"
            ? "Order declined. The customer will see that your kitchen couldn’t take it."
            : "Order accepted. The customer sees your cooking time.",
      );
    } catch (caught) {
      setError(chefErrorText(caught, "We couldn’t save your answer. Please try again."));
      setMessage("");
    } finally {
      setBusyAction(null);
    }
  }

  const field =
    "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-[#1A1A1A]";
  // While saving, buttons stay focusable (aria-disabled), so keyboard focus is never dropped.
  const busyProps = (action: string) => ({
    "aria-disabled": Boolean(busyAction) || undefined,
    "aria-busy": busyAction === action || undefined,
  });
  const feedback = (
    <>
      {message ? <p aria-hidden="true" className="mt-4 text-[0.9375rem] text-[#6B6B6B]">{message}</p> : null}
      {error ? <ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice> : null}
    </>
  );
  const backButton = (
    <button type="button" onClick={() => goTo("choose")} className="chef-btn is-small !border-0 !bg-transparent px-2">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
    </button>
  );

  let content: ReactNode;
  if (order.status === "CHEF_ACCEPTANCE_PENDING" && decisionStep === "choose") {
    content = (
      <Frame inline={inline} title="Can you cook this now?" note="If you accept, you’ll choose how long it takes.">
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" {...busyProps("")} onClick={() => goTo("accept")} className="chef-btn is-go is-tall">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> Accept order
          </button>
          <button type="button" {...busyProps("")} onClick={() => goTo("decline")} className="chef-btn is-danger is-tall">
            <XCircle className="h-6 w-6" aria-hidden="true" /> Can’t take it
          </button>
        </div>
      </Frame>
    );
  } else if (order.status === "CHEF_ACCEPTANCE_PENDING" && decisionStep === "accept") {
    const prep = Number(prepTimeMinutes);
    const validPrep = Number.isInteger(prep) && prep >= 1 && prep <= 1_440;
    content = (
      <Frame inline={inline} title="How long will it take?" note="Time to cook and pack the whole order." action={backButton}>
        <div className="chef-step">
          <fieldset>
            <legend className="sr-only">Cooking time</legend>
            <div className="grid grid-cols-4 gap-2">
              {PREP_CHOICES.map((minutes) => {
                const selected = prep === minutes && !customMinutes;
                return (
                  <label
                    key={minutes}
                    className={`${tile} min-h-14 justify-center text-base font-semibold ${selected ? "border-[#1A1A1A] bg-[#1A1A1A] text-white" : "border-[#D3D7DD] bg-white"}`}
                  >
                    <input
                      type="radio"
                      name={`prep-${order.id}`}
                      className="sr-only"
                      checked={selected}
                      onChange={() => {
                        setCustomMinutes("");
                        setPrepTimeMinutes(String(minutes));
                      }}
                    />
                    {minutes}
                    <span className="ml-0.5 text-sm font-medium">min</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <details className="group mt-4" open={customOpen}>
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.9375rem] font-semibold text-[#1A1A1A] [&::-webkit-details-marker]:hidden">Another cooking time<ChevronDown className="h-4 w-4 text-[#6B6B6B] transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
            <label className="mt-1 block text-sm font-semibold text-[#1A1A1A]">
              Minutes (1 to 1,440)
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                value={customMinutes}
                onChange={(event) => {
                  setCustomMinutes(event.target.value);
                  setPrepTimeMinutes(event.target.value || "30");
                }}
                aria-invalid={!validPrep || undefined}
                aria-describedby={!validPrep ? `prep-error-${order.id}` : undefined}
                className={field}
                data-craves-single-border="true"
              />
            </label>
          </details>
          <details className="group mt-1">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.9375rem] font-semibold text-[#1A1A1A] [&::-webkit-details-marker]:hidden">Add a note <span className="font-normal text-[#6B6B6B]">(optional)</span><ChevronDown className="h-4 w-4 text-[#6B6B6B] transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
            <label className="mt-1 block text-sm font-semibold text-[#1A1A1A]">Note for the order<input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className={field} placeholder="Anything useful about cooking or packing" data-craves-single-border="true" /></label>
          </details>
          <p className="mt-4 text-[0.9375rem] text-[#6B6B6B]">The customer will see <strong className="text-[#1A1A1A]">Ready in about {validPrep ? prep : "—"} minutes</strong>.</p>
          {!validPrep ? <p id={`prep-error-${order.id}`} className="chef-field-error">Enter a cooking time from 1 to 1,440 minutes, or pick one above.</p> : null}
          {feedback}
          <button type="button" {...busyProps("accept")} disabled={!validPrep} onClick={() => void act("accept", { prepTimeMinutes: prep, note: note.trim() || null, actionId: crypto.randomUUID() })} className="chef-btn is-go is-tall is-block mt-5">{busyAction === "accept" ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}{busyAction === "accept" ? "Saving…" : "Start cooking"}</button>
        </div>
      </Frame>
    );
  } else if (order.status === "CHEF_ACCEPTANCE_PENDING") {
    const reason = selectedReason === "Something else" ? customReason.trim() : selectedReason;
    content = (
      <Frame inline={inline} title="Why can’t you take it?" note="Pick the closest reason. The customer will see that your kitchen couldn’t take this order." action={backButton}>
        <div className="chef-step">
          <fieldset className="grid gap-2">
            <legend className="sr-only">Reason</legend>
            {DECLINE_REASONS.map((item) => {
              const selected = selectedReason === item;
              return (
                <label
                  key={item}
                  className={`${tile} min-h-12 gap-3 px-4 text-left text-[0.9375rem] font-semibold ${selected ? "border-[#1A1A1A] bg-white shadow-[inset_0_0_0_1px_#1A1A1A]" : "border-[#D3D7DD] bg-white"}`}
                >
                  <input
                    type="radio"
                    name={`decline-${order.id}`}
                    className="sr-only"
                    checked={selected}
                    onChange={() => {
                      setSelectedReason(item);
                      setError("");
                    }}
                  />
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-[#1A1A1A]" : "border-[#8A8F98]"}`} aria-hidden="true">{selected ? <span className="h-2.5 w-2.5 rounded-full bg-[#1A1A1A]" /> : null}</span>
                  {item}
                </label>
              );
            })}
          </fieldset>
          {selectedReason === "Something else" ? (
            <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">Tell us briefly (at least 3 characters)<textarea value={customReason} maxLength={500} onChange={(event) => setCustomReason(event.target.value)} className={`${field} min-h-24 py-3`} placeholder="A short reason is enough" data-craves-single-border="true" /></label>
          ) : null}
          {feedback}
          <button type="button" {...busyProps("reject")} disabled={reason.length < 3} onClick={() => void act("reject", { reason, actionId: crypto.randomUUID() })} className="chef-btn is-primary is-block mt-5">{busyAction === "reject" ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}{busyAction === "reject" ? "Saving…" : "Decline order"}</button>
          {reason.length < 3 ? <p className="mt-2 text-[0.8125rem] text-[#6B6B6B]">Choose a reason to decline.</p> : null}
        </div>
      </Frame>
    );
  } else if (order.status === "CHEF_ACCEPTED" || order.status === "PREPARING") {
    content = (
      <Frame inline={inline} title="Is everything packed?" note="Tap only when every item is cooked and packed.">
        {feedback}
        <button type="button" {...busyProps("ready-for-pickup")} onClick={() => void act("ready-for-pickup")} className="chef-btn is-go is-tall is-block mt-1">{busyAction ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PackageCheck className="h-5 w-5" aria-hidden="true" />}{busyAction ? "Saving…" : "Food is ready for pickup"}</button>
      </Frame>
    );
  } else if (inline) {
    content = null;
  } else {
    content = (
      <ChefNotice icon={CheckCircle2}>
        <p className="font-semibold">Nothing to do right now</p>
        <p className="mt-0.5 text-[#6B6B6B]">{message || "This order updates here if it needs you again."}</p>
      </ChefNotice>
    );
  }

  return (
    <>
      <div ref={stepRef} className="[&_h2]:outline-none">
        {content}
      </div>
      {/* Always mounted, so each saved answer is announced (a new live region would stay silent). */}
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </>
  );
}
