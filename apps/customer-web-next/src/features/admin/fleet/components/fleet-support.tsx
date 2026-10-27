"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { readableFleetValue } from "@/features/admin/fleet/lib/fleet-common";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import {
  fixSchema, ISSUE_CATEGORIES, ISSUE_STATES, issuesSchema, mapLink, overdue, sosEventsSchema, supportIssueSchema,
  type SosEvent, type SupportIssue,
} from "@/features/admin/fleet/lib/support-contract";
import { ActionMessage, fieldClass, labelClass, useFleetAction } from "./fleet-action";

const when = (value: string | null | undefined) => value ? formatAdminTimestamp(value) : "—";
type IssueState = (typeof ISSUE_STATES)[number];

/** Riders' SOS presses and problem reports: acknowledge within 24 hours, fix within 72. */
export function FleetSupport() {
  return <div className="space-y-6">
    <SosEvents />
    <Issues />
  </div>;
}

function SosEvents() {
  const [events, setEvents] = useState<SosEvent[]>([]);
  const [message, setMessage] = useState("Loading SOS presses…");

  const load = useCallback(async () => {
    try {
      const page = await fleetGet("sos-events", sosEventsSchema);
      setEvents(page.events);
      setMessage(page.events.length ? "" : "No SOS in the last 7 days.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SOS presses are unavailable.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <section className="cr-panel space-y-3" aria-labelledby="fleet-sos-title">
    <div className="flex flex-wrap items-center gap-3">
      <h2 id="fleet-sos-title" className="text-lg font-bold">SOS, last 7 days</h2>
      <button type="button" className="cr-button" onClick={() => void load()}>Refresh</button>
    </div>
    <p className="cr-muted">Each SOS is emailed to the ops alert addresses at once, with the rider&apos;s full phone number and a map link: call the rider first. A press marked &quot;Email not sent&quot; reached nobody, so call that rider now.</p>
    {message && <p className="cr-empty" role="status">{message}</p>}
    {events.length > 0 && <div className="cr-table-scroll"><table className="cr-table">
      <thead><tr><th scope="col">When</th><th scope="col">Rider</th><th scope="col">Phone</th><th scope="col">Where</th><th scope="col">Trip ID</th><th scope="col">Alert</th></tr></thead>
      <tbody>{events.map(event => {
        const map = mapLink(event);
        return <tr key={event.sosId}>
          <td>{when(event.at)}</td>
          <td><Link className="underline" href={`/admin/riders/${event.riderId}`}>{event.riderName}</Link></td>
          <td>{event.phoneMasked}</td>
          <td>{map ? <a className="underline" href={map} target="_blank" rel="noopener noreferrer">Open map</a> : <span className="cr-muted">Not known</span>}</td>
          <td>{event.tripId ? <span className="select-all font-mono text-xs">{event.tripId}</span> : "—"}</td>
          <td>{event.alertedAt ? `Emailed ${when(event.alertedAt)}` : <span className="cr-status" data-tone="danger">Email not sent</span>}</td>
        </tr>;
      })}</tbody>
    </table></div>}
  </section>;
}

function Issues() {
  const [state, setState] = useState<IssueState>("OPEN");
  const [issues, setIssues] = useState<SupportIssue[]>([]);
  const [message, setMessage] = useState("Loading issues…");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const page = await fleetGet(`support-issues?state=${state}`, issuesSchema);
      setIssues(page.issues);
      setMessage(page.issues.length ? "" : `No ${readableFleetValue(state).toLowerCase()} issues.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Issues are unavailable.");
    }
  }, [state]);
  useEffect(() => { void load(); }, [load]);

  function show(next: IssueState) {
    if (next === state) return;
    setIssues([]);
    setNotice("");
    setMessage("Loading issues…");
    setState(next);
  }

  return <section className="cr-panel space-y-4" aria-labelledby="fleet-issues-title">
    <h2 id="fleet-issues-title" className="text-lg font-bold">Issues riders raised</h2>
    <p className="cr-muted">Oldest first. Acknowledge each within 24 hours and fix it within 72; the rider hears from you by phone or WhatsApp, not in the app. An issue raised on a trip before its pay was withdrawable holds that pay until the issue is fixed or 7 days pass. To correct the pay, use Adjust a trip&apos;s pay on Rider payouts with the trip ID.</p>
    <div className="flex flex-wrap gap-2">
      {ISSUE_STATES.map(value => <button key={value} type="button" aria-pressed={state === value} className={`cr-button ${state === value ? "cr-primary" : ""}`} onClick={() => show(value)}>{readableFleetValue(value)}</button>)}
      <button type="button" className="cr-button" onClick={() => void load()}>Refresh</button>
    </div>
    {notice && <p className="cr-feedback" role="status">{notice}</p>}
    {message && <p className="cr-empty" role="status">{message}</p>}
    {issues.length > 0 && <div className="space-y-3">{issues.map(issue => <IssueItem key={issue.issueId} issue={issue}
      onDone={async text => { setNotice(text); await load(); }} />)}</div>}
  </section>;
}

function IssueItem({ issue, onDone }: { issue: SupportIssue; onDone: (notice: string) => Promise<void> }) {
  const action = useFleetAction();
  const [fixing, setFixing] = useState(false);
  const [resolution, setResolution] = useState("");
  const late = overdue(issue);

  async function acknowledge() {
    if (await action.run("POST", `support-issues/${issue.issueId}/acknowledge`, supportIssueSchema, undefined, "")) {
      await onDone(`Acknowledged ${issue.riderName}'s issue. Call them, then mark it fixed with what was done.`);
    }
  }
  async function fix(event: FormEvent) {
    event.preventDefault();
    const parsed = fixSchema.safeParse({ resolution });
    if (!parsed.success) return action.refuse(parsed.error.issues[0]?.message ?? "Write what was done.");
    if (await action.run("POST", `support-issues/${issue.issueId}/fix`, supportIssueSchema, parsed.data, "")) {
      await onDone(`Marked ${issue.riderName}'s issue fixed.${issue.tripId ? " Any pay this issue held is released." : ""}`);
    }
  }

  return <article className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <strong>{ISSUE_CATEGORIES[issue.category] ?? readableFleetValue(issue.category)}</strong>
      <span className="cr-status">{readableFleetValue(issue.state)}</span>
      {late && <span className="cr-status" data-tone="danger">{late === "FIX" ? "Past fix-by" : "Past acknowledge-by"}</span>}
    </div>
    <p><Link className="underline" href={`/admin/riders/${issue.riderId}`}>{issue.riderName}</Link> · raised {when(issue.createdAt)}</p>
    <p className="whitespace-pre-wrap break-words">{issue.text || <span className="cr-muted">No note.</span>}</p>
    {issue.tripId && <p>Trip ID <span className="select-all font-mono text-xs">{issue.tripId}</span></p>}
    <p className="cr-muted">Acknowledge by {when(issue.acknowledgeBy)} · fix by {when(issue.fixBy)}</p>
    {issue.acknowledgedAt && <p className="cr-muted">Acknowledged by {issue.acknowledgedBy ?? "—"} · {when(issue.acknowledgedAt)}</p>}
    {issue.fixedAt && <p className="cr-muted">Fixed by {issue.fixedBy ?? "—"} · {when(issue.fixedAt)}</p>}
    {issue.resolution && <p className="whitespace-pre-wrap break-words">What was done: {issue.resolution}</p>}
    {issue.state !== "FIXED" && !fixing && <span className="cr-actions">
      {issue.state === "OPEN" && <button type="button" className="cr-button cr-primary" disabled={action.busy} onClick={() => void acknowledge()}>Acknowledge</button>}
      <button type="button" className="cr-button" disabled={action.busy} onClick={() => setFixing(true)}>Mark fixed</button>
    </span>}
    {fixing && <form className="space-y-2" onSubmit={event => void fix(event)}>
      <label className={labelClass}>What was done (tell the rider the same when you call)
        <textarea className={fieldClass} value={resolution} maxLength={1000} rows={2} onChange={event => setResolution(event.target.value)} />
      </label>
      <span className="cr-actions">
        <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Mark fixed</button>
        <button type="button" className="cr-button" disabled={action.busy} onClick={() => setFixing(false)}>Back</button>
      </span>
    </form>}
    <ActionMessage state={action.state} />
  </article>;
}
