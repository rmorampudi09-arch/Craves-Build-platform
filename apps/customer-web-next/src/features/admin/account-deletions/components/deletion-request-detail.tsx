"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { parseAdminDetail } from "@/features/account-deletion/domain/deletion-contract";
import { formatDeletionDate } from "@/features/account-deletion/domain/deletion-model";
import type { AdminDeletionDetail } from "@/features/account-deletion/domain/deletion-types";
import { DeletionDecisionDialog, type DeletionDecision } from "@/features/admin/account-deletions/components/deletion-decision-dialog";
import { codeOf, COULDNT_CHECK, deletionError, SCOPE_LABELS, STATUS_LABELS, UNREACHABLE } from "@/features/admin/account-deletions/lib/admin-deletion-client";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";

const dash = "—";
const decidable = (body: unknown) => Boolean(body && typeof body === "object" && (body as { canDecide?: unknown }).canDecide === true);
const when = (value: string | null) => (value ? formatAdminTimestamp(value) : dash);

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return <section className="cr-panel space-y-4" aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    {children}
  </section>;
}

function Summary({ detail }: { detail: AdminDeletionDetail }) {
  const { request } = detail;
  const rows: [string, string | null][] = [
    ["Request", request.requestId], ["Identity", request.identityId], ["Scope", SCOPE_LABELS[request.scope]], ["Status", STATUS_LABELS[request.status]],
    ["Via", request.via === "APP" ? "App" : "Web"], ["Requested", when(request.requestedAt)],
    ["Due", (request.dueAt && formatDeletionDate(request.dueAt, "long", "Asia/Kolkata")) || dash],
    ["Phone", detail.phoneLast4 ? `Ends in ${detail.phoneLast4}` : "Erased"], ["Roles", detail.roles.join(", ") || "None"],
    ["Reviewed by", request.reviewedBy], ["Reviewed", request.reviewedAt && when(request.reviewedAt)], ["Reviewer's note", request.reviewNote],
  ];
  return <Section title="Summary">
    <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      {rows.filter(([, value]) => value).map(([name, value]) => <div key={name}>
        <dt className="text-xs font-bold text-slate-600">{name}</dt><dd className="mt-0.5 break-words">{value}</dd>
      </div>)}
    </dl>
  </Section>;
}

function OpenItems({ detail }: { detail: AdminDeletionDetail }) {
  return <Section title="Open items">
    {detail.blockers.length === 0 ? <p className="cr-muted">Nothing is open.</p> : <div className="cr-table-scroll"><table className="cr-table !min-w-0">
      <thead><tr>{["Service", "Code", "Detail"].map(name => <th key={name} scope="col">{name}</th>)}</tr></thead>
      <tbody>{detail.blockers.map((item, index) => <tr key={`${item.service}-${item.code}-${index}`}>
        <td>{item.service}</td>
        <td><code>{item.code}</code>{item.code === UNREACHABLE ? <> <span className="cr-status" data-tone="danger">{COULDNT_CHECK}</span></> : null}</td>
        <td>{item.detail ?? dash}</td>
      </tr>)}</tbody>
    </table></div>}
  </Section>;
}

function Steps({ detail }: { detail: AdminDeletionDetail }) {
  return <Section title="Steps">
    {detail.steps.length === 0 ? <p className="cr-muted">No erasure steps have started.</p> : <div className="cr-table-scroll"><table className="cr-table !min-w-0">
      <thead><tr>{["Phase", "Service", "Status", "Attempts", "Last error", "Done"].map(name => <th key={name} scope="col">{name}</th>)}</tr></thead>
      <tbody>{detail.steps.map((step, index) => <tr key={`${step.phase}-${step.service}-${index}`}>
        <td>{step.phase}</td><td>{step.service}</td><td>{step.status}</td><td>{step.attempts}</td>
        <td className="break-words">{step.lastError ?? dash}</td><td>{when(step.completedAt)}</td>
      </tr>)}</tbody>
    </table></div>}
  </Section>;
}

/** One request with its open items and erasure steps. The detail call asks every service, so it can take about 30 seconds. */
export function DeletionRequestDetail({ requestId }: { requestId: string }) {
  const [detail, setDetail] = useState<AdminDeletionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deciding, setDeciding] = useState<DeletionDecision | null>(null);
  // Only the newest load may change the page.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    setDetail(null);
    setError("");
    try {
      const response = await adminFetch(`/api/admin/account-deletions/${encodeURIComponent(requestId)}`, { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (ticket !== latest.current) return;
      // The route decides whether the buttons show; the roles themselves never reach the browser.
      const parsed = response.ok ? parseAdminDetail(body, decidable(body)) : null;
      if (parsed) setDetail(parsed);
      else setError(deletionError(response.ok ? "INVALID_DELETION_RESPONSE" : codeOf(body), "view"));
    } catch {
      if (ticket === latest.current) setError(deletionError(undefined, "view"));
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
    const tickets = latest;
    return () => { tickets.current++; };
  }, [load]);

  const canDecide = detail?.request.status === "PENDING_REVIEW" && detail.canDecide;
  const roleBlocked = detail?.request.status === "PENDING_REVIEW" && !detail.canDecide;
  const refresh = () => { setDeciding(null); setNotice(""); void load(); };
  return <div className="space-y-6">
    <div className="cr-actions">
      <button type="button" className="cr-button" disabled={loading} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />Refresh</button>
      {canDecide ? <>
        <button type="button" className="cr-button cr-primary" onClick={() => setDeciding("approve")}>Approve</button>
        <button type="button" className="cr-button" onClick={() => setDeciding("reject")}>Reject</button>
      </> : null}
    </div>
    {roleBlocked ? <p className="cr-muted">Approve and Reject aren&apos;t available. Refresh to try again.</p> : null}
    {notice ? <p role="status" className="text-sm font-semibold">{notice}</p> : null}
    {loading ? <p role="status" className="cr-muted">Loading this request. Craves is asking each service what is still open, so this can take up to 30 seconds.</p> : null}
    {error ? <p role="alert" className="cr-error-text">{error}</p> : null}
    {detail ? <><Summary detail={detail} /><OpenItems detail={detail} /><Steps detail={detail} /></> : null}
    {deciding && detail ? <DeletionDecisionDialog requestId={detail.request.requestId} action={deciding} onCancel={() => setDeciding(null)} onRefresh={refresh}
      onDecided={action => {
        setDeciding(null);
        setNotice(action === "approve" ? "Approved." : "Rejected. The person can see your reason.");
        void load();
      }} /> : null}
  </div>;
}
