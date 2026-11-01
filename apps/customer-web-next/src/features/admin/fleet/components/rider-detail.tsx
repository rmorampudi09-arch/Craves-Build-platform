"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { readableFleetValue } from "@/features/admin/fleet/lib/fleet-common";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import { istDay } from "@/features/admin/fleet/lib/payout-contract";
import { lastHeard, offerWhy, onShift, phoneReport, pushed, rang, silence } from "@/features/admin/fleet/lib/rider-health";
import { DOCUMENT_LABELS, STAGE_LABELS, VEHICLE_LABELS, vehicleModel } from "@/features/admin/fleet/lib/application-review";
import {
  auditPageSchema, EXPIRING_DOCUMENTS, expiryProblem, payoutAccountInputSchema, payoutAccountSchema, riderDetailSchema, riderDeviceSchema,
  riderDocumentSchema, riderVehicleInputSchema, riderVehicleSchema, statusEventProblem, statusEventSchema, STATUS_EVENT_KINDS,
  type ApplicationResult, type AuditEntry, type RiderDetail, type StatusEventInput,
} from "@/features/admin/fleet/lib/rider-contract";
import { ApplicationReview, ApprovedPanel } from "./application-review";
import { ActionMessage, fieldClass, labelClass, ReasonAction, useFleetAction } from "./fleet-action";

type Document = RiderDetail["documents"][number];
type Device = RiderDetail["devices"][number];

const KIND_LABELS: Record<StatusEventInput["kind"], string> = {
  SAFETY_PAUSE: "Safety pause (starts now, review within 72 hours)",
  NOTICE: "7-day notice (rider keeps working)",
  RESTORE: "Restore (rider can work again)",
  DEACTIVATE: "Deactivate (only after a notice's deadline has passed)",
};

const when = (value: string | null | undefined) => value ? formatAdminTimestamp(value) : "—";

export function RiderDetailView({ riderId }: { riderId: string }) {
  const [detail, setDetail] = useState<RiderDetail | null>(null);
  const [approved, setApproved] = useState<ApplicationResult | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading rider…");
  const [auditMessage, setAuditMessage] = useState("");

  // Not every role that can open a rider can read the audit trail; that refusal stays in its own section.
  const loadAudit = useCallback(async (after: string | null) => {
    try {
      const page = await fleetGet(`audit?riderId=${riderId}${after ? `&cursor=${encodeURIComponent(after)}` : ""}`, auditPageSchema);
      setAudit(current => after ? [...current, ...page.entries] : page.entries);
      setAuditCursor(page.nextCursor);
      setAuditMessage("");
    } catch (error) {
      setAuditMessage(error instanceof Error ? error.message : "The audit trail is unavailable.");
    }
  }, [riderId]);

  const reload = useCallback(async () => {
    try {
      setDetail(await fleetGet(`riders/${riderId}`, riderDetailSchema));
      setMessage("");
      await loadAudit(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This rider is unavailable.");
    }
  }, [riderId, loadAudit]);

  useEffect(() => { void reload(); }, [reload]);

  if (!detail) return <p className="cr-panel" role="status">{message}</p>;
  const { rider } = detail;
  // A rider still applying gets the one-decision review; everyone else the documents, vehicle and payout tools for renewals.
  const applying = rider.status === "PENDING";
  const vehicle = [rider.vehicleKind ? VEHICLE_LABELS[rider.vehicleKind] : null, vehicleModel(rider.vehicleLabel), rider.vehicleNumberMasked]
    .filter(Boolean).join(" · ") || "Not recorded";
  const vehicleForm = <VehicleForm riderId={riderId} current={vehicle} label={vehicleModel(rider.vehicleLabel) ?? ""} onDone={reload} />;
  return <div className="space-y-6">
    {message && <p className="cr-alert" role="alert">{message}</p>}
    {approved && <ApprovedPanel name={rider.name} result={approved} />}
    <section className="cr-panel">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-bold">{rider.name}</h2><span className="cr-status">{rider.stage ? STAGE_LABELS[rider.stage] : readableFleetValue(rider.status)}</span></div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className={labelClass}>KYC name</dt><dd>{rider.kycName}</dd></div>
        <div><dt className={labelClass}>Phone</dt><dd>{rider.phoneMasked}</dd></div>
        <div><dt className={labelClass}>Vehicle</dt><dd>{vehicle}</dd></div>
        <div><dt className={labelClass}>Joined</dt><dd>{when(rider.createdAt)}</dd></div>
      </dl>
      {!applying && detail.pilotRider === false && <p className="mt-4 text-sm">Not on the pilot riders: while test mode is on, they get no orders. Add them in <Link className="underline" href="/admin/fleet-setup">Rider pilot setup</Link>.</p>}
      <p className="cr-muted mt-4 text-sm">A rider may ask for a copy of everything Craves keeps about them. Each download is recorded, and the rider sees it in their copy.</p>
      <a className="cr-button mt-2 inline-block" href={`/api/admin/fleet/riders/${riderId}/data-export`} download>Download the rider&apos;s data (JSON)</a>
    </section>

    {applying ? <ApplicationReview riderId={riderId} detail={detail} vehicleEditor={vehicleForm} onDecided={async result => {
      if (result.decision === "APPROVE") setApproved(result);
      await reload();
    }} /> : <>
      <section className="cr-panel space-y-3">
        <h2 className="text-lg font-bold">Documents</h2>
        <p className="cr-muted">Renewals and new photos from an active rider. Check each file by hand; one marked Needs a fix shows the rider your reason so they can send it again.</p>
        {detail.documents.length === 0 ? <p className="cr-empty">No documents uploaded yet.</p>
          : detail.documents.map(document => <DocumentRow key={document.documentId} riderId={riderId} document={document} onDone={reload} />)}
      </section>
      <section className="cr-panel space-y-3">
        <h2 className="text-lg font-bold">Vehicle</h2>
        {vehicleForm}
      </section>
    </>}

    <section className="cr-panel space-y-3">
      <h2 className="text-lg font-bold">Phones</h2>
      <p className="cr-muted">A rider has one approved phone. Approving a new one stops the old phone from going online.</p>
      {detail.devices.length === 0 ? <p className="cr-empty">No phone registered yet.</p>
        : detail.devices.map(device => <DeviceRow key={device.deviceId} riderId={riderId} device={device} onDone={reload} />)}
    </section>

    {!applying && <PayoutAccountForm riderId={riderId} kycName={rider.kycName} current={detail.payoutAccount} submitted={detail.submittedPayoutAccount} onDone={reload} />}

    {!applying && <section className="cr-panel space-y-4">
      <h2 className="text-lg font-bold">Status changes</h2>
      {detail.statusEvents.length === 0 ? <p className="cr-empty">No status changes yet.</p> : <ul className="space-y-3">
        {detail.statusEvents.map(event => <li key={event.eventId} className="rounded-xl border border-slate-200 p-3 text-sm">
          <strong>{readableFleetValue(event.kind)}</strong> · {when(event.createdAt)} · by {event.approverName} · status after: {readableFleetValue(event.statusAfter)}
          <p className="mt-1">Reason: {event.reason}</p>
          <p>Evidence: {event.evidenceSummary}</p>
          {event.deadline && <p>Deadline: {when(event.deadline)}</p>}
          {event.reviewBy && <p>Review by: {when(event.reviewBy)}</p>}
          {event.appealPhone && <p>Appeal phone: {event.appealPhone}</p>}
        </li>)}
      </ul>}
      <StatusActionForm riderId={riderId} riderName={rider.name} onDone={reload} />
    </section>}

    {!applying && <section className="cr-panel">
      <h2 className="text-lg font-bold">Recent shifts</h2>
      <p className="cr-muted">How the phone kept in touch (app 1.1.0): when it last called, the longest silence between calls, and its own last report. A silent phone on shift has usually been stopped by the phone&apos;s battery settings.</p>
      {detail.shifts.length === 0 ? <p className="cr-empty">No shifts yet.</p> : <div className="cr-table-scroll"><table className="cr-table">
        <thead><tr><th scope="col">Started</th><th scope="col">Ended</th><th scope="col">Selfie</th><th scope="col">Reviewed by</th><th scope="col">Minutes in zone</th><th scope="col">Last heard</th><th scope="col">Longest silence</th><th scope="col">Phone</th></tr></thead>
        <tbody>{detail.shifts.map(shift => <tr key={shift.shiftId}>
          <td>{when(shift.startedAt)}</td><td>{shift.endedAt ? when(shift.endedAt) : onShift(shift, when)}</td>
          <td>{readableFleetValue(shift.selfieState)}{shift.selfieReason ? ` · ${shift.selfieReason}` : ""}</td>
          <td>{shift.selfieReviewedBy ?? "—"}</td><td>{Math.floor(shift.inZoneSeconds / 60)}</td>
          <td>{lastHeard(shift)}</td><td>{silence(shift)}</td><td>{phoneReport(shift.phone)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>}

    {!applying && detail.recentOffers && <section className="cr-panel">
      <h2 className="text-lg font-bold">Recent offers</h2>
      <p className="cr-muted">The last 20 offers, newest first: what the push did and how soon the phone rang. Most should ring by push within 5 seconds; a trip ops gave the rider by hand is accepted at once and never pushed. A pay hold or adjustment asks for the trip ID.</p>
      {detail.recentOffers.length === 0 ? <p className="cr-empty">No offers yet.</p> : <div className="cr-table-scroll"><table className="cr-table">
        <thead><tr><th scope="col">Offered</th><th scope="col">Order</th><th scope="col">Outcome</th><th scope="col">Why this rider</th><th scope="col">Push</th><th scope="col">Rang</th><th scope="col">Trip ID</th></tr></thead>
        <tbody>{detail.recentOffers.map(offer => <tr key={offer.offerId}>
          <td>{when(offer.offeredAt)}</td><td>{offer.orderCode}</td><td>{readableFleetValue(offer.state)}</td><td>{offerWhy(offer)}</td>
          <td>{pushed(offer)}</td><td>{rang(offer)}</td><td><span className="select-all font-mono text-xs">{offer.tripId}</span></td>
        </tr>)}</tbody>
      </table></div>}
    </section>}

    <section className="cr-panel">
      <h2 className="text-lg font-bold">Audit trail</h2>
      {auditMessage && <p className="cr-empty" role="status">{auditMessage}</p>}
      {audit.length === 0 ? !auditMessage && <p className="cr-empty">No admin actions recorded yet.</p> : <ul className="mt-3 space-y-2 text-sm">
        {audit.map(entry => <li key={entry.entryId}><strong>{readableFleetValue(entry.action)}</strong> · {entry.actorName} · {when(entry.at)}<br /><span className="cr-muted">{entry.summary}</span></li>)}
      </ul>}
      {auditCursor && <button type="button" className="cr-button mt-3" onClick={() => void loadAudit(auditCursor)}>Load more</button>}
    </section>
  </div>;
}

function DocumentRow({ riderId, document, onDone }: { riderId: string; document: Document; onDone: () => Promise<void> }) {
  const action = useFleetAction();
  const [expiresOn, setExpiresOn] = useState(document.expiresOn ?? "");
  const expiring = EXPIRING_DOCUMENTS.includes(document.type);
  const label = DOCUMENT_LABELS[document.type];
  const base = `riders/${riderId}/documents/${document.documentId}`;
  async function decide(verb: "approve" | "reject", body?: { reason: string } | { expiresOn: string }) {
    const done = await action.run("POST", `${base}/${verb}`, riderDocumentSchema, body,
      // The same words as the application review: Looks good, or Needs a fix with a reason the rider reads.
      verb === "approve" ? "Marked as good." : "Sent back. The rider sees your reason and sends a new photo.");
    if (done) await onDone();
  }
  function accept(event: FormEvent) {
    event.preventDefault();
    if (!expiring) return void decide("approve");
    const problem = expiryProblem(expiresOn);
    if (problem) return action.refuse(problem);
    void decide("approve", { expiresOn });
  }
  return <article className="rounded-xl border border-slate-200 p-3 text-sm">
    <div className="flex flex-wrap items-center gap-3">
      <strong>{label}</strong><span className="cr-status">{readableFleetValue(document.status)}</span>
      <span>Expires: {document.expiresOn ?? "—"}</span>
      <a className="underline" href={`/api/admin/fleet/${base}/content`} target="_blank" rel="noreferrer">Open file</a>
    </div>
    {document.reason && <p className="mt-1">Reason: {document.reason}</p>}
    {document.reviewedBy && <p className="cr-muted">Reviewed by {document.reviewedBy} · {when(document.reviewedAt)}</p>}
    {document.status === "PENDING" && <div className="mt-2 flex flex-wrap items-end gap-2">
      <form noValidate className="flex flex-wrap items-end gap-2" onSubmit={accept}>
        {expiring && <label className={labelClass}>{label} expiry date (as printed)<input className={fieldClass} type="date" min={istDay()} value={expiresOn} onChange={event => setExpiresOn(event.target.value)} /></label>}
        <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Looks good<span className="cr-sr-only">: {label}</span></button>
      </form>
      <ReasonAction label="Needs a fix" action={action} onSubmit={reason => void decide("reject", { reason })} />
    </div>}
    <ActionMessage state={action.state} />
  </article>;
}

function VehicleForm({ riderId, current, label, onDone }: { riderId: string; current: string; label: string; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ label, regNumber: "" });
  const action = useFleetAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = riderVehicleInputSchema.safeParse({ label: form.label, regNumber: form.regNumber.toUpperCase().replace(/[\s-]/g, "") });
    if (!parsed.success) return action.refuse(parsed.error.issues[0]?.message ?? "Check the details.");
    if (await action.run("PUT", `riders/${riderId}/vehicle`, riderVehicleSchema, parsed.data, "Vehicle saved. The rider sees it on their profile.")) {
      setForm({ label: parsed.data.label, regNumber: "" });
      await onDone();
    }
  }

  return <form noValidate className="space-y-3" onSubmit={event => void submit(event)}>
    <p className="text-sm">Now: {current}. Change it only if the RC shows something else; the plate is needed in full.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>Vehicle (make and model)<input className={fieldClass} value={form.label} maxLength={60} placeholder="Honda Activa 6G" onChange={event => setForm({ ...form, label: event.target.value })} /></label>
      <label className={labelClass}>Registration number<input className={fieldClass} value={form.regNumber} maxLength={16} autoComplete="off" placeholder="TS09EA1234" onChange={event => setForm({ ...form, regNumber: event.target.value })} /></label>
    </div>
    <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Save vehicle</button>
    <ActionMessage state={action.state} />
  </form>;
}

function DeviceRow({ riderId, device, onDone }: { riderId: string; device: Device; onDone: () => Promise<void> }) {
  const action = useFleetAction();
  async function approve() {
    if (!window.confirm(`Approve the ${device.model}? The rider's old phone stops going online.`)) return;
    if (await action.run("POST", `riders/${riderId}/devices/${device.deviceId}/approve`, riderDeviceSchema, undefined, "New phone approved.")) await onDone();
  }
  return <article className="rounded-xl border border-slate-200 p-3 text-sm">
    <strong>{device.model}</strong> · app {device.appVersion} · <span className="cr-status">{readableFleetValue(device.state)}</span> · first seen {when(device.firstSeenAt)}
    {device.approvedBy && <span className="cr-muted"> · approved by {device.approvedBy}</span>}
    {device.state === "PENDING_APPROVAL" && <div className="mt-2"><button type="button" className="cr-button cr-primary" disabled={action.busy} onClick={() => void approve()}>Approve this phone</button></div>}
    <ActionMessage state={action.state} />
  </article>;
}

function PayoutAccountForm({ riderId, kycName, current, submitted, onDone }: { riderId: string; kycName: string; current: RiderDetail["payoutAccount"]; submitted: RiderDetail["submittedPayoutAccount"]; onDone: () => Promise<void> }) {
  const empty = { method: "UPI" as "UPI" | "BANK", upiId: "", accountNumber: "", ifsc: "", holderName: "", verifiedInPerson: false };
  const [form, setForm] = useState(empty);
  const action = useFleetAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = payoutAccountInputSchema.safeParse(form.method === "UPI"
      ? { method: "UPI", upiId: form.upiId.trim(), holderName: form.holderName, verifiedInPerson: form.verifiedInPerson }
      : { method: "BANK", accountNumber: form.accountNumber.trim(), ifsc: form.ifsc.trim().toUpperCase(), holderName: form.holderName, verifiedInPerson: form.verifiedInPerson });
    if (!parsed.success) return action.refuse(parsed.error.issues[0]?.message ?? "Check the details.");
    if (await action.run("PUT", `riders/${riderId}/payout-account`, payoutAccountSchema, parsed.data, "Payout account saved.")) {
      setForm(empty);
      await onDone();
    }
  }

  async function confirm() {
    if (await action.run("POST", `riders/${riderId}/payout-account/confirm`, payoutAccountSchema, undefined, "Payout account confirmed.")) await onDone();
  }

  return <form className="cr-panel space-y-3" onSubmit={event => void submit(event)}>
    <h2 className="text-lg font-bold">Payout account</h2>
    <p className="text-sm">{current ? <>{current.method === "UPI" ? "UPI" : "Bank"} {current.maskedAccount}{current.ifsc ? ` · ${current.ifsc}` : ""} · {current.holderName} · set by {current.setBy} on {when(current.setAt)}</> : "No payout account yet. Pay stays in the rider's balance until one is set."}</p>
    {submitted && <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
      <p><strong>Sent from the app, not paid yet:</strong> {submitted.method === "UPI" ? "UPI" : "Bank"} {submitted.maskedAccount}{submitted.ifsc ? ` · ${submitted.ifsc}` : ""} · {submitted.holderName} · {when(submitted.setAt)}</p>
      <p className="cr-muted">Check it against the rider&apos;s approved bank proof (the name, the last digits and the IFSC) before confirming. Payouts go to it from the next batch.</p>
      <button type="button" className="cr-button cr-primary" disabled={action.busy} onClick={() => void confirm()}>Confirm this account</button>
    </div>}
    <p className="cr-muted">Or set it yourself with the rider in front of you at the office, after you have seen their ID. The holder name must match the KYC name: <strong>{kycName}</strong>.</p>
    <fieldset className="flex gap-4 text-sm"><legend className={labelClass}>Paid by</legend>
      {(["UPI", "BANK"] as const).map(method => <label key={method} className="flex items-center gap-2"><input type="radio" name="payout-method" checked={form.method === method} onChange={() => setForm({ ...form, method })} />{method === "UPI" ? "UPI" : "Bank account"}</label>)}
    </fieldset>
    {form.method === "UPI"
      ? <label className={labelClass}>UPI ID<input className={fieldClass} value={form.upiId} maxLength={100} autoComplete="off" onChange={event => setForm({ ...form, upiId: event.target.value })} /></label>
      : <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Account number<input className={fieldClass} value={form.accountNumber} inputMode="numeric" maxLength={18} autoComplete="off" onChange={event => setForm({ ...form, accountNumber: event.target.value })} /></label>
        <label className={labelClass}>IFSC<input className={fieldClass} value={form.ifsc} maxLength={11} autoComplete="off" onChange={event => setForm({ ...form, ifsc: event.target.value })} /></label>
      </div>}
    <label className={labelClass}>Account holder name<input className={fieldClass} value={form.holderName} maxLength={120} onChange={event => setForm({ ...form, holderName: event.target.value })} /></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.verifiedInPerson} onChange={event => setForm({ ...form, verifiedInPerson: event.target.checked })} />I saw the rider and their ID in person at the Craves office.</label>
    <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Save payout account</button>
    <ActionMessage state={action.state} />
  </form>;
}

function StatusActionForm({ riderId, riderName, onDone }: { riderId: string; riderName: string; onDone: () => Promise<void> }) {
  const empty = { kind: "NOTICE" as StatusEventInput["kind"], reason: "", evidenceSummary: "", deadline: "", reviewBy: "", appealPhone: "" };
  const [form, setForm] = useState(empty);
  const action = useFleetAction();
  // datetime-local has no zone: read it as IST, the zone every time on this console is shown in, whatever the PC is set to.
  const iso = (local: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local) ? new Date(`${local}+05:30`).toISOString() : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input: StatusEventInput = {
      kind: form.kind, reason: form.reason.trim(), evidenceSummary: form.evidenceSummary.trim(),
      ...(form.kind === "NOTICE" ? { deadline: iso(form.deadline) } : {}),
      ...(form.kind === "SAFETY_PAUSE" ? { reviewBy: iso(form.reviewBy) } : {}),
      ...(form.kind !== "RESTORE" && form.appealPhone.trim() ? { appealPhone: form.appealPhone.trim() } : {}),
    };
    const problem = statusEventProblem(input);
    if (problem) return action.refuse(problem);
    if (!window.confirm(`Record “${KIND_LABELS[form.kind]}” for ${riderName}?`)) return;
    if (await action.run("POST", `riders/${riderId}/status-events`, statusEventSchema, input, "Status change recorded.")) {
      setForm(empty);
      await onDone();
    }
  }

  return <form className="space-y-3 border-t border-slate-200 pt-4" onSubmit={event => void submit(event)}>
    <h3 className="font-bold">Record a status change</h3>
    <p className="cr-muted">Nothing happens automatically. Use a safety pause only for a safety risk today; everything else, fraud included, gets 7 days&apos; written notice while the rider keeps working.</p>
    <label className={labelClass}>Action<select className={fieldClass} value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as StatusEventInput["kind"] })}>
      {STATUS_EVENT_KINDS.map(kind => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
    </select></label>
    <label className={labelClass}>Reason (the rider sees it)<textarea className={fieldClass} rows={2} maxLength={1000} value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></label>
    <label className={labelClass}>Evidence summary<textarea className={fieldClass} rows={3} maxLength={2000} value={form.evidenceSummary} onChange={event => setForm({ ...form, evidenceSummary: event.target.value })} /></label>
    {form.kind === "NOTICE" && <label className={labelClass}>Deadline, IST (at least 7 days from now)<input className={fieldClass} type="datetime-local" value={form.deadline} onChange={event => setForm({ ...form, deadline: event.target.value })} /></label>}
    {form.kind === "SAFETY_PAUSE" && <label className={labelClass}>Review by, IST (within 72 hours)<input className={fieldClass} type="datetime-local" value={form.reviewBy} onChange={event => setForm({ ...form, reviewBy: event.target.value })} /></label>}
    {form.kind !== "RESTORE" && <label className={labelClass}>Appeal phone<input className={fieldClass} inputMode="tel" maxLength={13} placeholder="+91" value={form.appealPhone} onChange={event => setForm({ ...form, appealPhone: event.target.value.replace(/\s/g, "") })} /></label>}
    <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Record status change</button>
    <ActionMessage state={action.state} />
  </form>;
}
