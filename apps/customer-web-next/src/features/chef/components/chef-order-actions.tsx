"use client";

import { CHEF_ERROR_MESSAGES, ChefError, chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LoaderCircle,
  PackageCheck,
  Phone,
  XCircle,
} from "lucide-react";
import { ChefFlash, ChefNotice, ChefSection } from "@/features/chef/components/chef-ui";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import {
  parseChefOrderResponse,
  type ChefDeliveryPartner,
  type ChefOrder,
} from "@/features/chef/lib/chef-order-contract";
import {
  NOT_PICKED_UP_REASONS,
  declineConsequence,
  notPickedUpCase,
  pickupEtaLabel,
  respondCountdown,
  type Countdown,
} from "@/features/chef/lib/chef-order-presentation";
import { FEATURE_NOT_AVAILABLE, isFeatureUnavailable } from "@/shared/lib/feature-availability";
import { createSupportCase, SupportCaseError } from "@/shared/lib/support-cases-client";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";

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

const field = "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-[#1A1A1A]";

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

const TONE_COLOR = { danger: "var(--chef-error)", warning: "var(--chef-warning)", success: "var(--chef-success)" } as const;

/** A clock for the countdowns: ticks each second while the tab is visible, and only while something counts down. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const sync = () => {
      window.clearInterval(timer);
      setNow(Date.now());
      if (!document.hidden) timer = window.setInterval(() => setNow(Date.now()), 1_000);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active]);
  return now;
}

/** "Respond in 4:32" and the like, with a bar. A timer role, so screen readers don't read every tick. */
function CountdownLine({ countdown }: { countdown: Countdown }) {
  const color = TONE_COLOR[countdown.tone];
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color }}>
      {countdown.tone === "danger" ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span role="timer" className="shrink-0">{countdown.label}</span>
      {countdown.fill !== null ? (
        <span className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-[#F1F3F5]" aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${Math.round(countdown.fill * 100)}%`, background: color }} />
        </span>
      ) : null}
    </div>
  );
}

/** One reason from a short list, as tiles. */
function ReasonTiles({ name, options, value, onChange }: { name: string; options: readonly string[]; value: string; onChange(reason: string): void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Reason</legend>
      {options.map((item) => {
        const selected = value === item;
        return (
          <label
            key={item}
            className={`${tile} min-h-12 gap-3 px-4 text-left text-[0.9375rem] font-semibold ${selected ? "border-[#1A1A1A] bg-white shadow-[inset_0_0_0_1px_#1A1A1A]" : "border-[#D3D7DD] bg-white"}`}
          >
            <input type="radio" name={name} className="sr-only" checked={selected} onChange={() => onChange(item)} />
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-[#1A1A1A]" : "border-[#8A8F98]"}`} aria-hidden="true">{selected ? <span className="h-2.5 w-2.5 rounded-full bg-[#1A1A1A]" /> : null}</span>
            {item}
          </label>
        );
      })}
    </fieldset>
  );
}

/** The courier for a ready order, or a plain line while none is assigned yet. */
function PartnerRow({ partner, now }: { partner: ChefDeliveryPartner | null | undefined; now: number }) {
  const name = partner?.name;
  const phone = partner?.phone?.replace(/[^\d+]/g, "");
  const eta = pickupEtaLabel(partner?.pickupEtaAt ?? null, now);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#E3E6EA] bg-white p-3">
      <ChefFace photoUrl={partner?.photoUrl} name={name} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-[#1A1A1A]">{name ? `${name} · Craves delivery` : "Waiting for a delivery partner"}</p>
        {name && eta ? <p className="text-[0.8125rem] text-[#6B6B6B]">{eta}</p> : null}
      </div>
      {name && phone ? (
        <a href={`tel:${phone}`} className="chef-btn is-small" aria-label={`Call ${name}`}>
          <Phone className="h-4 w-4" aria-hidden="true" /> Call
        </a>
      ) : null}
    </div>
  );
}

/** "What happened with #X?": sends the answer to Craves support with the order attached. */
function NotPickedUp({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(NOT_PICKED_UP_REASONS[0]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState("");

  async function send() {
    if (sending) return;
    setSending(true);
    setFailed(false);
    try {
      await createSupportCase(notPickedUpCase(orderId, reason, note));
      setSent("Sent to Craves support");
      setOpen(false);
    } catch (caught) {
      if (caught instanceof SupportCaseError && caught.code === FEATURE_NOT_AVAILABLE) {
        setSent("Support is coming soon. Call Craves support.");
        setOpen(false);
      } else setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReason(NOT_PICKED_UP_REASONS[0]);
          setNote("");
          setFailed(false);
          setOpen(true);
        }}
        className="chef-btn is-tall flex-1"
      >
        Not picked up
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        busy={sending}
        closeOnOutsideTap={!note.trim()}
        title={`What happened with #${shortOrderNumber(orderId)}?`}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={sending} className={secondaryActionClass}>Cancel</button>
            <button type="button" onClick={() => void send()} aria-busy={sending || undefined} className="craves-primary-action w-full sm:w-auto">
              {sending ? "Sending…" : "Send to support"}
            </button>
          </>
        }
      >
        <div className="mt-4">
          <ReasonTiles name={`not-picked-up-${orderId}`} options={NOT_PICKED_UP_REASONS} value={reason} onChange={setReason} />
          <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">
            Details for support
            <textarea value={note} maxLength={400} onChange={(event) => setNote(event.target.value)} placeholder="Add details (optional)" className={`${field} min-h-24 py-3`} data-craves-single-border="true" />
          </label>
          <p className="mt-3 text-sm text-[#6B6B6B]">Craves support gets this with the order attached and will call you if needed.</p>
          {failed ? <p role="alert" className="chef-field-error mt-2">We couldn’t send this. Check your connection and try again.</p> : null}
        </div>
      </Sheet>
      <ChefFlash message={sent} onClose={() => setSent("")} />
    </>
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
  const [handOverSoon, setHandOverSoon] = useState(false);
  const stepRef = useRef<HTMLDivElement>(null);
  const stepChanged = useRef(false);
  const expiresAt = order.status === "CHEF_ACCEPTANCE_PENDING" ? order.chefAcceptanceExpiresAt : null;
  const now = useNow(Boolean(expiresAt) || (order.status === "READY_FOR_PICKUP" && Boolean(order.deliveryPartner?.pickupEtaAt)));
  const clock = expiresAt ? <CountdownLine countdown={respondCountdown({ createdAt: order.createdAt, chefAcceptanceExpiresAt: expiresAt }, now)} /> : null;

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
      if (path === "handed-over" && isFeatureUnavailable(response.status, result)) {
        setHandOverSoon(true);
        setMessage("Handed over is coming soon.");
        return;
      }
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
          : path === "handed-over"
            ? "Marked as handed over."
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

  // While saving, buttons stay focusable (aria-disabled), so keyboard focus is never dropped.
  const busyProps = (action: string) => ({
    "aria-disabled": Boolean(busyAction) || undefined,
    "aria-busy": busyAction === action || undefined,
  });
  // While saving, the pressed button says so; the saved answer shows for a moment as a flash below.
  const feedback = error ? <ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice> : null;
  const backButton = (
    <button type="button" onClick={() => goTo("choose")} className="chef-btn is-small !border-0 !bg-transparent px-2">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
    </button>
  );

  let content: ReactNode;
  if (order.status === "CHEF_ACCEPTANCE_PENDING" && decisionStep === "choose") {
    content = (
      <Frame inline={inline} title="Can you cook this now?" note="If you accept, you’ll choose how long it takes.">
        {clock}
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
          {clock}
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
      <Frame inline={inline} title="Why can’t you take it?" note={declineConsequence(order)} action={backButton}>
        <div className="chef-step">
          {clock}
          <ReasonTiles
            name={`decline-${order.id}`}
            options={DECLINE_REASONS}
            value={selectedReason}
            onChange={(item) => {
              setSelectedReason(item);
              setError("");
            }}
          />
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
  } else if (order.status === "READY_FOR_PICKUP") {
    content = (
      <Frame inline={inline} title="Waiting for pickup" note="Hand the bag only to the partner shown here. Check the order number on the bag.">
        <PartnerRow partner={order.deliveryPartner} now={now} />
        {feedback}
        <div className="mt-3 flex gap-2">
          <NotPickedUp orderId={order.id} />
          {order.chefHandedOverAt !== null ? null : handOverSoon ? (
            <p className="flex flex-[2] items-center justify-center rounded-xl bg-[#F1F3F5] px-3 text-center text-sm font-semibold text-[#6B6B6B]">Handed over is coming soon.</p>
          ) : (
            <button type="button" {...busyProps("handed-over")} onClick={() => void act("handed-over")} className="chef-btn is-go is-tall flex-[2]">
              {busyAction === "handed-over" ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}
              {busyAction === "handed-over" ? "Saving…" : "Handed over"}
            </button>
          )}
        </div>
      </Frame>
    );
  } else if (inline) {
    content = null;
  } else {
    content = (
      <ChefNotice icon={CheckCircle2}>
        <p className="font-semibold">Nothing to do right now</p>
        <p className="mt-0.5 text-[#6B6B6B]">This order updates here if it needs you again.</p>
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
      {/* On an order card the list shows its own update notice, since the card moves on. */}
      {inline ? null : (
        <ChefFlash message={busyAction ? "" : message} announce={false} onClose={() => setMessage("")} />
      )}
    </>
  );
}
