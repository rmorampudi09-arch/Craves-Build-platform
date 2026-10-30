"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import {
  DOCUMENT_CHECKS, FIX_REASONS, payoutState, plan, reviewItems, STAGE_LABELS, VEHICLE_LABELS, vehicleModel, waited,
  type Mark, type PayoutMark, type ReviewItem,
} from "@/features/admin/fleet/lib/application-review";
import { istDay } from "@/features/admin/fleet/lib/payout-contract";
import { applicationResultSchema, type ApplicationResult, type RiderDetail } from "@/features/admin/fleet/lib/rider-contract";
import { ActionMessage, fieldClass, labelClass, useFleetAction } from "./fleet-action";

const LANGUAGES = { en: "English", te: "Telugu", hi: "Hindi" } as const;
const day = (value: string) => new Date(`${value}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const GUIDANCE = {
  REVIEW: "Check each item against its photo, then decide once. Marks stay on this page until you press the button below.",
  FIXES: "You asked for fixes. The rider sees them in the app, and the application comes back to “To review” when they send them.",
  APPLYING: "The rider hasn't sent everything yet. You can check what has arrived and ask for fixes early.",
} as const;

/**
 * One application, one decision (docs/riders/FLOWS.md): every item the rider sent beside its photo, a verdict on each,
 * and one decision bar. Approve and activate verifies, confirms, puts the rider on the pilot list and activates them in
 * one step; Send fixes tells the rider exactly what to send again.
 */
export function ApplicationReview({ riderId, detail, vehicleEditor, onDecided }: {
  riderId: string; detail: RiderDetail; vehicleEditor: ReactNode; onDecided: (result: ApplicationResult) => Promise<void>;
}) {
  const { rider } = detail;
  const items = useMemo(() => reviewItems(detail), [detail]);
  const payout = payoutState(detail);
  const [marks, setMarks] = useState<Record<string, Mark | undefined>>({});
  const [payoutMark, setPayoutMark] = useState<PayoutMark>(null);
  const [editingVehicle, setEditingVehicle] = useState(false);
  const action = useFleetAction();
  const decision = plan(items, marks, payout, payoutMark);
  const stage = rider.stage === "REVIEW" || rider.stage === "FIXES" ? rider.stage : "APPLYING";
  const mark = (documentId: string, value: Mark | undefined) => setMarks(current => ({ ...current, [documentId]: value }));

  async function decide(kind: "APPROVE" | "FIXES") {
    if (kind === "APPROVE" && !window.confirm(`Approve ${rider.name}? They become an active rider and can go online.`)) return;
    const body = { ...(kind === "APPROVE" ? decision.approve : decision.askFixes), applicationVersion: detail.applicationVersion };
    const result = await action.run("POST", `riders/${riderId}/application/decision`, applicationResultSchema, body,
      kind === "APPROVE" ? `${rider.name} is approved.` : `Sent ${decision.fixes} fix${decision.fixes === 1 ? "" : "es"} to ${rider.name}. They see them in the app now.`);
    if (result) {
      setMarks({});
      setPayoutMark(null);
      await onDecided(result);
    }
  }

  const kind = rider.vehicleKind ? VEHICLE_LABELS[rider.vehicleKind] : "Not given";
  const model = vehicleModel(rider.vehicleLabel);
  return <>
    <section className="cr-panel space-y-4" aria-labelledby="application-heading">
      <div className="cr-review-head">
        <div>
          <h2 id="application-heading" className="text-lg font-bold">Application</h2>
          <p className="cr-muted">Applied {formatAdminTimestamp(rider.createdAt)}{stage === "REVIEW" && rider.readySince ? ` · everything sent ${formatAdminTimestamp(rider.readySince)}, ${waited(rider.readySince)}` : ""}</p>
        </div>
        <span className="cr-status" data-tone={stage === "REVIEW" ? "success" : undefined}>{STAGE_LABELS[stage]}</span>
      </div>
      <p className="text-sm">{GUIDANCE[stage]}</p>
      <ol className="cr-review-list">
        <li className="cr-review-item">
          <div className="cr-review-item-head"><h3>About the rider</h3></div>
          <dl className="cr-review-facts">
            <div><dt>Name on documents</dt><dd>{rider.kycName}</dd></div>
            <div><dt>Phone</dt><dd>{rider.phoneMasked}</dd></div>
            <div><dt>Language</dt><dd>{LANGUAGES[rider.language]}</dd></div>
          </dl>
          <p className="cr-muted">The PAN card, driving licence and bank proof must all show this name.</p>
        </li>
        <li className="cr-review-item">
          <div className="cr-review-item-head"><h3>Vehicle</h3></div>
          <dl className="cr-review-facts">
            <div><dt>Kind</dt><dd>{kind}</dd></div>
            <div><dt>Make and model</dt><dd>{model ?? "Not given"}</dd></div>
            {rider.vehicleKind !== "BICYCLE" && <div><dt>Number plate</dt><dd>{rider.vehicleNumberMasked ?? "Not given"}</dd></div>}
          </dl>
          <p className="cr-muted">As the rider typed it. Compare it with the RC photo, and correct it only if the RC shows something else.</p>
          {editingVehicle ? vehicleEditor : <button type="button" className="cr-button" onClick={() => setEditingVehicle(true)}>Correct the vehicle</button>}
        </li>
        {items.map(item => <DocumentItem key={item.type} riderId={riderId} item={item} mark={item.document ? marks[item.document.documentId] : undefined}
          onMark={value => item.document && mark(item.document.documentId, value)} />)}
        <PayoutItem detail={detail} state={payout} mark={payoutMark} onMark={setPayoutMark} />
      </ol>
    </section>

    <section className="cr-decision" aria-label="Decision">
      <div className="min-w-0 space-y-1">
        <p className="font-bold">{decision.toCheck === 0 ? "Nothing new to check." : `${decision.marked} of ${decision.toCheck} checked${decision.fixes ? ` · ${decision.fixes} to fix` : ""}`}</p>
        {decision.fixes
          ? decision.fixesProblem && <p className="cr-muted">{decision.fixesProblem}</p>
          : decision.approveBlockers.length > 0 && <ul className="cr-muted list-disc pl-5">{decision.approveBlockers.map(text => <li key={text}>{text}</li>)}</ul>}
        {!decision.fixes && decision.approveBlockers.length === 0 && <p className="cr-muted">Approving verifies everything, confirms the payout account, adds the rider to the pilot riders and lets them go online.</p>}
        <ActionMessage state={action.state} />
      </div>
      <div className="cr-actions">
        {decision.fixes
          ? <button type="button" className="cr-button cr-primary" disabled={action.busy || Boolean(decision.fixesProblem)} onClick={() => void decide("FIXES")}>
            Send {decision.fixes} fix{decision.fixes === 1 ? "" : "es"} to the rider</button>
          : <button type="button" className="cr-button cr-primary" disabled={action.busy || decision.approveBlockers.length > 0} onClick={() => void decide("APPROVE")}>
            Approve and activate</button>}
      </div>
    </section>
  </>;
}

const STATE_TEXT: Record<ReviewItem["state"], string> = {
  MISSING: "Not sent yet", PENDING: "To check", VERIFIED: "Accepted", REJECTED: "Sent back", EXPIRED: "Expired",
};

function DocumentItem({ riderId, item, mark, onMark }: { riderId: string; item: ReviewItem; mark: Mark | undefined; onMark: (mark: Mark | undefined) => void }) {
  const { document } = item;
  const fix = mark?.verdict === "FIX" ? mark : null;
  const ok = mark?.verdict === "OK" ? mark : null;
  return <li className="cr-review-item">
    <div className="cr-review-item-head">
      <h3>{item.label}</h3>
      <span className="cr-status" data-tone={item.state === "VERIFIED" ? "success" : item.state === "REJECTED" || item.state === "EXPIRED" ? "danger" : undefined}>{STATE_TEXT[item.state]}</span>
    </div>
    <p className="cr-muted">{DOCUMENT_CHECKS[item.type]}</p>
    {document && <p className="flex flex-wrap items-center gap-3 text-sm">
      <a className="cr-button" href={`/api/admin/fleet/riders/${riderId}/documents/${document.documentId}/content`} target="_blank" rel="noreferrer">
        <ExternalLink size={14} aria-hidden="true" />Open photo<span className="cr-sr-only"> of the {item.label}</span></a>
      <span className="cr-muted">Sent {formatAdminTimestamp(document.uploadedAt)}</span>
    </p>}
    {item.state === "MISSING" && <p className="text-sm">The rider hasn&apos;t sent this yet.</p>}
    {item.state === "VERIFIED" && document && <p className="text-sm">Accepted{document.expiresOn ? `, valid until ${day(document.expiresOn)}` : ""}{document.reviewedBy ? ` · ${document.reviewedBy}` : ""}.</p>}
    {item.state === "REJECTED" && document && <p className="text-sm">Sent back: {document.reason}. Waiting for a new photo.</p>}
    {item.state === "EXPIRED" && document && <p className="text-sm">Expired{document.expiresOn ? ` on ${day(document.expiresOn)}` : ""}. Waiting for a new photo.</p>}
    {item.state === "PENDING" && document && <fieldset className="space-y-3">
      <legend className="cr-sr-only">{item.label}</legend>
      <div className="cr-verdict">
        <button type="button" aria-pressed={Boolean(ok)} onClick={() => onMark(ok ? undefined : { verdict: "OK", expiresOn: document.expiresOn ?? "" })}>
          <CheckCircle2 size={16} aria-hidden="true" />Looks good<span className="cr-sr-only">: {item.label}</span></button>
        <button type="button" aria-pressed={Boolean(fix)} onClick={() => onMark(fix ? undefined : { verdict: "FIX", reason: "" })}>
          <CircleAlert size={16} aria-hidden="true" />Needs a fix<span className="cr-sr-only">: {item.label}</span></button>
      </div>
      {ok && item.expiring && <label className={labelClass}>Expiry date, as printed on the {item.label}
        <input className={fieldClass} type="date" min={istDay()} value={ok.expiresOn} onChange={event => onMark({ verdict: "OK", expiresOn: event.target.value })} /></label>}
      {fix && <div className="space-y-2">
        <div className="cr-chips" role="group" aria-label={`Common reasons for the ${item.label}`}>
          {FIX_REASONS.map(reason => <button key={reason} type="button" aria-pressed={fix.reason === reason} onClick={() => onMark({ verdict: "FIX", reason })}>{reason}</button>)}
        </div>
        <label className={labelClass}>What the rider must fix on the {item.label} (they read this)
          <textarea className={fieldClass} rows={2} maxLength={1000} value={fix.reason} onChange={event => onMark({ verdict: "FIX", reason: event.target.value })} /></label>
      </div>}
    </fieldset>}
  </li>;
}

function PayoutItem({ detail, state, mark, onMark }: { detail: RiderDetail; state: ReturnType<typeof payoutState>; mark: PayoutMark; onMark: (mark: PayoutMark) => void }) {
  const account = detail.submittedPayoutAccount ?? detail.payoutAccount;
  const shown = account ? `${account.method === "UPI" ? "UPI" : "Bank"} ${account.maskedAccount}${account.ifsc ? ` · ${account.ifsc}` : ""} · ${account.holderName}` : "";
  return <li className="cr-review-item">
    <div className="cr-review-item-head">
      <h3>Payout account</h3>
      <span className="cr-status" data-tone={state === "CONFIRMED" ? "success" : undefined}>{state === "SENT" ? "To check" : state === "CONFIRMED" ? "Confirmed" : "Not sent yet"}</span>
    </div>
    {state === "MISSING" && <p className="text-sm">The rider hasn&apos;t sent a UPI ID or bank account yet. Nothing is paid until one is confirmed.</p>}
    {state === "CONFIRMED" && detail.payoutAccount && <p className="text-sm">{shown} · confirmed by {detail.payoutAccount.setBy}.</p>}
    {state === "SENT" && <fieldset className="space-y-3">
      <legend className="cr-sr-only">Payout account</legend>
      <p className="text-sm">{shown}</p>
      <p className="cr-muted">Compare it with the bank proof: the name, the last digits and the IFSC. Nothing is paid until it is confirmed.</p>
      <div className="cr-verdict">
        <button type="button" aria-pressed={mark?.verdict === "OK"} onClick={() => onMark(mark?.verdict === "OK" ? null : { verdict: "OK" })}>
          <CheckCircle2 size={16} aria-hidden="true" />Looks good<span className="cr-sr-only">: payout account</span></button>
        <button type="button" aria-pressed={mark?.verdict === "FIX"} onClick={() => onMark(mark?.verdict === "FIX" ? null : { verdict: "FIX" })}>
          <CircleAlert size={16} aria-hidden="true" />Needs a fix<span className="cr-sr-only">: payout account</span></button>
      </div>
      {mark?.verdict === "FIX" && <p className="text-sm">The rider is asked to send the account again, in their own name and matching their bank proof.</p>}
    </fieldset>}
  </li>;
}

/** What happens next once the application is approved, for ops and the rider. */
export function ApprovedPanel({ name, result }: { name: string; result: ApplicationResult }) {
  return <section className="cr-panel space-y-3" role="status" aria-labelledby="approved-heading">
    <h2 id="approved-heading" className="text-lg font-bold">{name} is an active rider</h2>
    <ul className="cr-next-steps">
      <li><CheckCircle2 size={18} aria-hidden="true" />Documents checked{result.payoutAccountConfirmed ? " and the payout account confirmed" : ""}.</li>
      <li><CheckCircle2 size={18} aria-hidden="true" />{result.addedToPilot ? "On the pilot riders, so they can get orders while test mode is on." : "Test mode is off, so they can get orders once they go online."}</li>
      {result.rateCardPublished
        ? <li><CheckCircle2 size={18} aria-hidden="true" />Their app moves on by itself, with a notification if it is closed: they accept the pay terms, set up the phone so offers ring, then go online with a selfie.</li>
        : <li data-tone="warning"><CircleAlert size={18} aria-hidden="true" /><span>No rate card is published yet, so the rider waits on “Pay rates are on the way” and can&apos;t go online. <Link className="underline" href="/admin/fleet-setup">Publish one in Rider pilot setup</Link>.</span></li>}
    </ul>
  </section>;
}
