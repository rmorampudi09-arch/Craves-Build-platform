import { StatusPill } from "@/components/status-pill";
import type { CandidateEvidence, DeliveryUnitEvidence, OrderInvestigation } from "@/lib/delivery-contract";
import { compactId, formatDateTime, formatPercent } from "@/lib/format";
import { Database, ExternalLink, MapPin, ShieldCheck, Sparkles, Truck } from "lucide-react";
import type { ReactNode } from "react";

function EvidenceField({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return <div className="evidence-field"><span>{label}</span><strong className={mono ? "mono" : ""}>{value ?? "—"}</strong></div>;
}

function CandidateRow({ candidate }: { candidate: CandidateEvidence }) {
  return (
    <div className={`candidate-row ${candidate.status === "SELECTED" || candidate.status === "ACCEPTED" ? "candidate-selected" : ""}`}>
      <div className="rank-bubble">#{candidate.candidateRank}</div>
      <div className="candidate-main">
        <strong>{candidate.providerId}</strong>
        <small>{candidate.agentId ? `Agent ${compactId(candidate.agentId)}` : "Provider candidate"}</small>
      </div>
      <div><span className="candidate-label">Final score</span><strong>{candidate.finalScore.toFixed(2)}</strong></div>
      <div><span className="candidate-label">Success</span><strong>{formatPercent(candidate.predictedSuccessProbability * 100)}</strong></div>
      <div><span className="candidate-label">Pickup ETA</span><strong>{candidate.pickupEtaMinutes == null ? "—" : `${candidate.pickupEtaMinutes} min`}</strong></div>
      <div><span className="candidate-label">Quoted</span><strong>{candidate.quotedCost == null ? "—" : `${candidate.currency ?? ""} ${candidate.quotedCost.toFixed(2)}`}</strong></div>
      <StatusPill value={candidate.status} />
    </div>
  );
}

function DeliveryUnitPanel({ unit, index }: { unit: DeliveryUnitEvidence; index: number }) {
  const job = unit.job;
  const command = unit.command;
  const selected = unit.candidates.find(candidate => ["SELECTED", "ACCEPTED"].includes(candidate.status)) ?? unit.candidates[0];
  const lifecycle = [
    command && { time: command.createdAt, title: "Command created", detail: command.commandType, status: command.status, source: "COMMAND" },
    unit.assignment && { time: unit.assignment.createdAt, title: "Candidates ranked", detail: `${unit.candidates.length} stored candidate${unit.candidates.length === 1 ? "" : "s"} · ${unit.assignment.strategy}`, status: unit.assignment.status, source: "RANKING" },
    selected && { time: selected.createdAt, title: "Candidate evidence", detail: `${selected.providerId} · rank #${selected.candidateRank} · final score ${selected.finalScore.toFixed(2)}`, status: selected.status, source: "SELECTION" },
    job?.bookedAt && { time: job.bookedAt, title: "Provider booking observed", detail: job.providerDeliveryId ?? job.providerId, status: job.status, source: "CREATE" },
    ...unit.events.map(event => ({
      time: event.occurredAt,
      title: event.applied ? "Status evidence applied" : "Status evidence ignored",
      detail: `${event.eventType} · ${event.source}${event.ignoredReason ? ` · ${event.ignoredReason}` : ""}`,
      status: event.normalizedStatus ?? event.providerStatus ?? event.eventType,
      source: event.source,
    })),
  ].filter(Boolean).sort((a, b) => new Date(a!.time).getTime() - new Date(b!.time).getTime()) as Array<{time:string;title:string;detail:string;status:string;source:string}>;

  return (
    <section className="delivery-unit-block">
      <div className="delivery-unit-heading">
        <div><span className="eyebrow">DELIVERY UNIT {index + 1}</span><h3>{unit.chefSubOrderId}</h3></div>
        <StatusPill value={job?.status ?? command?.status} />
      </div>

      <section className="surface-card order-summary-card">
        <div className="summary-evidence-grid">
          <EvidenceField label="Provider" value={job?.providerId ?? unit.assignment?.selectedProviderId ?? "—"} />
          <EvidenceField label="Provider reference" value={job?.providerDeliveryId ?? "—"} mono />
          <EvidenceField label="Delivery job" value={compactId(job?.deliveryJobId)} mono />
          <EvidenceField label="Assignment" value={compactId(unit.assignment?.assignmentId)} mono />
          <EvidenceField label="Command attempts" value={command?.attemptCount ?? 0} />
          <EvidenceField label="Tracking attempts" value={job?.trackingAttemptCount ?? 0} />
          <EvidenceField label="Last status source" value={job?.lastStatusSource ?? "—"} />
          <EvidenceField label="Last observed" value={formatDateTime(job?.lastStatusObservedAt)} />
        </div>
      </section>

      <section className="investigation-layout">
        <article className="surface-card timeline-card">
          <div className="card-heading"><div><h2>Lifecycle evidence</h2><p>Chronological command, ranking and provider status evidence</p></div><span className="section-badge">{lifecycle.length} EVENTS</span></div>
          <div className="timeline-list">
            {lifecycle.length ? lifecycle.map((event, eventIndex) => (
              <div className="timeline-row" key={`${event.time}-${event.title}-${eventIndex}`}>
                <div className="timeline-rail"><span className={`timeline-dot timeline-${event.source.toLowerCase()}`} />{eventIndex < lifecycle.length - 1 && <i />}</div>
                <div className="timeline-time">{formatDateTime(event.time)}</div>
                <div className="timeline-copy"><strong>{event.title}</strong><small>{event.detail}</small></div>
                <StatusPill value={event.status} />
              </div>
            )) : <div className="empty-state">No lifecycle evidence was found for this delivery unit.</div>}
          </div>
        </article>

        <div className="side-stack investigation-side">
          <article className="surface-card">
            <div className="card-heading"><div><h2>Current delivery state</h2><p>Provider-neutral projection</p></div><Truck size={19} /></div>
            <div className="stacked-fields">
              <EvidenceField label="Normalized status" value={<StatusPill value={job?.status} />} />
              <EvidenceField label="Provider status" value={job?.providerStatus ?? "—"} />
              <EvidenceField label="Booked" value={formatDateTime(job?.bookedAt)} />
              <EvidenceField label="Picked up" value={formatDateTime(job?.pickedUpAt)} />
              <EvidenceField label="Delivered" value={formatDateTime(job?.deliveredAt)} />
              <EvidenceField label="Telemetry source" value={job?.telemetrySource ?? "—"} />
            </div>
          </article>

          <article className="surface-card">
            <div className="card-heading"><div><h2>Safety evidence</h2><p>Idempotency and durable recovery</p></div><ShieldCheck size={19} /></div>
            <div className="stacked-fields">
              <EvidenceField label="Idempotency key" value={compactId(command?.idempotencyKey)} mono />
              <EvidenceField label="Provider wait attempts" value={command?.providerWaitAttemptCount ?? 0} />
              <EvidenceField label="Reconciliation attempts" value={command?.reconciliationAttemptCount ?? 0} />
              <EvidenceField label="Tracking dead-letter" value={job?.trackingDeadLetteredAt ? formatDateTime(job.trackingDeadLetteredAt) : "No"} />
              <EvidenceField label="Command error recorded" value={command?.errorRecorded ? "Yes — raw text withheld" : "No"} />
              <EvidenceField label="Tracking error recorded" value={job?.trackingErrorRecorded ? "Yes — raw text withheld" : "No"} />
            </div>
          </article>
        </div>
      </section>

      <section className="surface-card candidate-card">
        <div className="card-heading"><div><h2>Ranking evidence</h2><p>Stored provider-neutral scoring inputs. The dashboard does not recompute routing.</p></div><Sparkles size={19} /></div>
        <div className="candidate-list">
          {unit.candidates.length ? unit.candidates.map(candidate => <CandidateRow key={candidate.candidateId} candidate={candidate} />) : <div className="empty-state">No candidate ranking evidence is available.</div>}
        </div>
      </section>

      <section className="evidence-lower-grid">
        <article className="surface-card">
          <div className="card-heading"><div><h2>Webhook processing</h2><p>Sanitized inbox evidence — raw provider payloads are intentionally not exposed</p></div><Database size={19} /></div>
          <div className="webhook-table">
            <div className="table-head"><span>Received</span><span>Provider</span><span>Result</span><span>Attempts</span><span>Status</span></div>
            {unit.webhooks.length ? unit.webhooks.slice(0, 12).map(webhook => (
              <div className="table-row" key={webhook.webhookId}>
                <span>{formatDateTime(webhook.receivedAt)}</span><span>{webhook.providerId}</span><span>{webhook.processingResult ?? webhook.normalizedStatus ?? "—"}</span><span>{webhook.attemptCount}</span><StatusPill value={webhook.processingStatus} />
              </div>
            )) : <div className="empty-state small">No webhook inbox evidence linked to this delivery job.</div>}
          </div>
        </article>

        <article className="surface-card">
          <div className="card-heading"><div><h2>Live telemetry projection</h2><p>Latest coordinates and ETA windows when a provider supplies them</p></div><MapPin size={19} /></div>
          <div className="stacked-fields">
            <EvidenceField label="Courier coordinate" value={job?.courierLatitude != null && job.courierLongitude != null ? `${job.courierLatitude.toFixed(5)}, ${job.courierLongitude.toFixed(5)}` : "Not reported"} mono />
            <EvidenceField label="Location observed" value={formatDateTime(job?.courierLocationObservedAt)} />
            <EvidenceField label="Pickup window" value={job?.estimatedPickupStartAt ? `${formatDateTime(job.estimatedPickupStartAt)} → ${formatDateTime(job.estimatedPickupEndAt)}` : "Not reported"} />
            <EvidenceField label="Dropoff window" value={job?.estimatedDropoffStartAt ? `${formatDateTime(job.estimatedDropoffStartAt)} → ${formatDateTime(job.estimatedDropoffEndAt)}` : "Not reported"} />
            <EvidenceField label="Telemetry observed" value={formatDateTime(job?.telemetryObservedAt)} />
          </div>
        </article>
      </section>

      <div className="read-only-banner">
        <ShieldCheck size={17} />
        <span><strong>Sanitized read-only investigation.</strong> Provider payloads, webhook signatures, API keys and tracking URLs are not returned to this UI.</span>
        {job?.providerDeliveryId && <><ExternalLink size={15} /><span>Provider ref {job.providerDeliveryId}</span></>}
      </div>
    </section>
  );
}

export function InvestigationPanel({ data, onBack }: { data: OrderInvestigation; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div className="investigation-toolbar">
        <button type="button" className="text-button" onClick={onBack}>← Back to overview</button>
        <div className="correlation-chip"><ShieldCheck size={14} /> Request correlation <code>{data.requestCorrelationId}</code></div>
      </div>

      <section className="surface-card order-summary-card">
        <div className="order-summary-top">
          <div><span className="eyebrow">ORDER</span><h2>{data.orderId}</h2><p>Resolved from <code>{data.resolvedReference}</code> · {data.units.length} delivery unit{data.units.length === 1 ? "" : "s"}</p></div>
          <StatusPill value={data.units.every(unit => unit.job?.status === "DELIVERED") ? "DELIVERED" : data.units.some(unit => unit.command?.status === "DEAD_LETTER" || unit.job?.status === "FAILED") ? "ATTENTION" : "IN_PROGRESS"} />
        </div>
      </section>

      {data.units.map((unit, index) => <DeliveryUnitPanel key={unit.chefSubOrderId} unit={unit} index={index} />)}
    </div>
  );
}
