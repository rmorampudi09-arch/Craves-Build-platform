import { ActivityChart } from "@/components/activity-chart";
import { StatusPill } from "@/components/status-pill";
import type { DeliveryOverview } from "@/lib/delivery-contract";
import { compactId, formatDateTime, formatNumber, formatPercent, formatTime } from "@/lib/format";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, RefreshCw, Route, ShieldCheck, Truck } from "lucide-react";
import type { ReactNode } from "react";

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "info",
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  tone?: "info" | "good" | "warn" | "bad";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <p className="metric-label">{label}</p>
        <p className="metric-value">{formatNumber(value)}</p>
        <p className="metric-detail">{detail}</p>
      </div>
    </article>
  );
}

export function OverviewPanel({
  data,
  loading,
  onRefresh,
  onInvestigate,
}: {
  data: DeliveryOverview;
  loading: boolean;
  onRefresh: () => void;
  onInvestigate: (reference: string) => void;
}) {
  const m = data.metrics;
  const completionRate = m.commandCount ? (m.completedCommandCount / m.commandCount) * 100 : 0;
  const deliveryRate = m.deliveryJobCount ? (m.deliveredCount / m.deliveryJobCount) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="toolbar-row">
        <div className="flex flex-wrap items-center gap-2">
          <span className="filter-pill">LAST {data.windowHours} HOURS</span>
          <span className="filter-pill filter-live"><span className="live-dot" />AUTO REFRESH 20s</span>
          <span className="telemetry-disclaimer">Provider share is observed selection telemetry, not a production-readiness claim.</span>
        </div>
        <button type="button" className="icon-button" onClick={onRefresh} disabled={loading} aria-label="Refresh dashboard">
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </div>

      <section className="metric-grid" aria-label="Delivery overview metrics">
        <MetricCard label="Delivery commands" value={m.commandCount} detail={`${formatPercent(completionRate)} completed`} icon={<Route size={18} />} />
        <MetricCard label="Completed commands" value={m.completedCommandCount} detail="Provider create orchestration completed" icon={<CheckCircle2 size={18} />} tone="good" />
        <MetricCard label="Delivered jobs" value={m.deliveredCount} detail={`${formatPercent(deliveryRate)} of jobs in window`} icon={<Truck size={18} />} tone="good" />
        <MetricCard label="Recovery involved" value={m.recoveryCommandCount} detail="Retry, reconciliation, or provider wait" icon={<RefreshCw size={18} />} tone="warn" />
        <MetricCard label="Needs attention" value={m.attentionCount} detail={`${m.activeDeliveryCount} active delivery jobs`} icon={<AlertTriangle size={18} />} tone={m.attentionCount ? "bad" : "good"} />
      </section>

      <section className="dashboard-grid-main">
        <article className="surface-card chart-card">
          <div className="card-heading">
            <div><h2>Delivery activity</h2><p>Commands and normalized delivery events by hour</p></div>
            <span className="section-badge">ACTUAL EVENTS</span>
          </div>
          <ActivityChart points={data.hourlyActivity} />
        </article>

        <article className="surface-card provider-card">
          <div className="card-heading"><div><h2>Provider decisions</h2><p>Selected-provider share in this window</p></div></div>
          <div className="provider-list">
            {data.providerShare.length ? data.providerShare.map(provider => (
              <div className="provider-row" key={provider.providerId}>
                <div className="provider-label"><strong>{provider.displayName}</strong><span>{formatNumber(provider.selectionCount)} selections</span></div>
                <div className="provider-meter"><span style={{ width: `${Math.min(100, Math.max(2, provider.percentage))}%` }} /></div>
                <span className="provider-percent">{formatPercent(provider.percentage)}</span>
              </div>
            )) : <div className="empty-state small">No provider selections in this window.</div>}
          </div>
          <div className="card-footnote"><ShieldCheck size={14} /> A selection does not certify that the provider is production-accepted.</div>
        </article>
      </section>

      <section className="dashboard-grid-main lower-grid">
        <article className="surface-card activity-card">
          <div className="card-heading">
            <div><h2>Recent engine activity</h2><p>Newest first · command, ranking, provider selection and normalized status evidence</p></div>
            <span className="activity-count">{data.recentActivity.length}</span>
          </div>
          <div className="activity-list">
            {data.recentActivity.length ? data.recentActivity.map(item => (
              <button
                type="button"
                key={`${item.activityType}-${item.activityId}-${item.occurredAt}`}
                className={`activity-row ${item.attention ? "activity-attention" : ""}`}
                onClick={() => item.orderId && onInvestigate(item.orderId)}
                disabled={!item.orderId}
              >
                <span className="activity-time">{formatTime(item.occurredAt)}</span>
                <span className="activity-reference">{compactId(item.orderId ?? item.chefSubOrderId)}</span>
                <span className="activity-body"><strong>{item.activityType.replaceAll("_", " ")}</strong><small>{item.detail}</small></span>
                <span className="activity-provider">{item.providerId ?? "—"}</span>
                <StatusPill value={item.status} />
                {item.orderId ? <ArrowUpRight size={15} className="activity-open" /> : <span />}
              </button>
            )) : <div className="empty-state">No delivery activity in this window.</div>}
          </div>
        </article>

        <div className="side-stack">
          <article className="surface-card recovery-card">
            <div className="card-heading"><div><h2>Recovery health</h2><p>Durable recovery paths</p></div></div>
            {[
              ["Retried commands", data.recoveryHealth.retriedCommandCount],
              ["Reconciliation", data.recoveryHealth.reconciliationCount],
              ["Provider wait", data.recoveryHealth.providerWaitCount],
              ["Webhook dead-letter", data.recoveryHealth.webhookDeadLetterCount],
              ["Tracking dead-letter", data.recoveryHealth.trackingDeadLetterCount],
            ].map(([label, value]) => (
              <div className="health-row" key={String(label)}><span>{label}</span><strong>{formatNumber(Number(value))}</strong></div>
            ))}
          </article>

          <article className="surface-card attention-card">
            <div className="card-heading"><div><h2>Attention queue</h2><p>Oldest unresolved operational evidence first</p></div></div>
            <div className="attention-list">
              {data.attentionQueue.length ? data.attentionQueue.slice(0, 6).map(item => (
                <button type="button" className="attention-row" key={`${item.kind}-${item.referenceId}`} onClick={() => onInvestigate(item.orderId ?? item.referenceId)}>
                  <span className={`attention-dot ${item.errorRecorded ? "attention-dot-red" : ""}`} />
                  <span><strong>{compactId(item.orderId ?? item.referenceId)}</strong><small>{item.kind.replaceAll("_", " ")} · {formatDateTime(item.occurredAt)}</small></span>
                  <StatusPill value={item.status} />
                </button>
              )) : <div className="empty-state small"><CheckCircle2 size={18} /> No current attention items.</div>}
            </div>
          </article>
        </div>
      </section>

      <div className="read-only-banner"><ShieldCheck size={17} /><span><strong>Read-only operational view.</strong> This surface does not dispatch, cancel, reassign, or mutate deliveries.</span><Clock3 size={15} /><span>Generated {formatDateTime(data.generatedAt)} IST</span></div>
    </div>
  );
}
