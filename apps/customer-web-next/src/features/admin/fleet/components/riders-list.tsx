"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { nextStep, STAGE_LABELS } from "@/features/admin/fleet/lib/application-review";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import { createRiderSchema, riderPageSchema, riderSummarySchema, type RiderStage, type RiderSummary } from "@/features/admin/fleet/lib/rider-contract";
import { ActionMessage, fieldClass, labelClass, useFleetAction } from "./fleet-action";

const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** The queue's tabs: ops's turn first, then the rider's, then everyone working or not (docs/riders/FLOWS.md). */
const TABS: { stage: RiderStage | ""; label: string; empty: string }[] = [
  { stage: "REVIEW", label: "To review", empty: "No applications are waiting for you. New ones appear here once a rider has sent everything." },
  { stage: "FIXES", label: "Fixes asked", empty: "No rider is fixing anything right now." },
  { stage: "APPLYING", label: "Applying", empty: "No rider is part-way through applying." },
  { stage: "ACTIVE", label: "Active", empty: "No active riders yet." },
  { stage: "SUSPENDED", label: "Paused", empty: "No rider is paused." },
  { stage: "DEACTIVATED", label: "Closed", empty: "No closed riders." },
  { stage: "", label: "All riders", empty: "No riders match this search." },
];

export function RidersList() {
  const [tab, setTab] = useState<RiderStage | "">("REVIEW");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [riders, setRiders] = useState<RiderSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading riders…");
  const [exportDate, setExportDate] = useState(todayIst);

  const load = useCallback(async (after: string | null) => {
    const query = new URLSearchParams();
    if (tab) query.set("stage", tab);
    if (applied) query.set("search", applied);
    if (after) query.set("cursor", after);
    try {
      const page = await fleetGet(`riders?${query}`, riderPageSchema);
      setRiders(current => after ? [...current, ...page.riders] : page.riders);
      setCounts(page.counts ?? null);
      setCursor(page.nextCursor);
      setMessage(after || page.riders.length ? "" : applied ? "No riders match this search." : TABS.find(item => item.stage === tab)!.empty);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Riders are unavailable.");
    }
  }, [tab, applied]);

  useEffect(() => { void load(null); }, [load]);

  return <div className="space-y-6">
    <section className="cr-panel">
      <div className="cr-tabs" role="group" aria-label="Riders by stage">
        {TABS.map(item => <button key={item.label} type="button" className="cr-tab" aria-pressed={tab === item.stage} onClick={() => { setTab(item.stage); setRiders([]); setMessage("Loading riders…"); }}>
          {item.label}{item.stage && counts ? <span className="cr-tab-count">{counts[item.stage] ?? 0}</span> : null}
        </button>)}
      </div>
      <form className="cr-filter-row" onSubmit={event => { event.preventDefault(); setApplied(search.trim()); }}>
        <label className="cr-search-field"><span className="cr-sr-only">Name or phone</span><input type="search" placeholder="Name or last digits of the phone" maxLength={80} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <button type="submit" className="cr-button cr-primary">Search</button>
        <Link className="cr-button" href="/admin/riders/selfies">Selfie review queue</Link>
      </form>
      {message && <p className="cr-empty" role="status">{message}</p>}
      {riders.length > 0 && <div className="cr-table-scroll"><table className="cr-table">
        <thead><tr><th scope="col">Rider</th><th scope="col">Phone</th><th scope="col">Stage</th><th scope="col">Next step</th><th scope="col">Joined</th></tr></thead>
        <tbody>{riders.map(rider => {
          const stage = rider.stage ?? stageOf(rider.status);
          return <tr key={rider.riderId}>
            <td><Link className="font-bold underline" href={`/admin/riders/${rider.riderId}`}>{rider.name}</Link></td>
            <td>{rider.phoneMasked}</td>
            <td><span className="cr-status" data-tone={tone(rider, stage)}>{STAGE_LABELS[stage]}</span></td>
            <td>{stage === "REVIEW" ? <Link className="underline" href={`/admin/riders/${rider.riderId}`}>{nextStep({ ...rider, stage })}</Link> : nextStep({ ...rider, stage })}</td>
            <td>{formatAdminTimestamp(rider.createdAt)}</td>
          </tr>;
        })}</tbody>
      </table></div>}
      {cursor && <button type="button" className="cr-button mt-4" onClick={() => void load(cursor)}>Load more</button>}
    </section>
    <div className="grid gap-6 xl:grid-cols-2">
      <CreateRider onCreated={() => void load(null)} />
      <section className="cr-panel space-y-3">
        <h2 className="text-lg font-bold">Daily joins and exits</h2>
        <p className="cr-muted">The CSV for the government portal: riders who joined or left on one day (IST).</p>
        <label className={labelClass}>Day<input className={fieldClass} type="date" value={exportDate} max={todayIst()} onChange={event => setExportDate(event.target.value)} /></label>
        <a className="cr-button" href={`/api/admin/fleet/exports/rider-joins-exits?date=${encodeURIComponent(exportDate)}`} download>Download CSV</a>
      </section>
    </div>
  </div>;
}

/** An older server sends no stage: a PENDING rider then reads as still applying. */
const stageOf = (status: RiderSummary["status"]): RiderStage => status === "PENDING" ? "APPLYING" : status;

function tone(rider: RiderSummary, stage: RiderStage): "success" | "danger" | undefined {
  if (stage === "SUSPENDED" || stage === "DEACTIVATED") return "danger";
  return stage === "REVIEW" || (stage === "ACTIVE" && !rider.pendingDocuments && !rider.pendingDevice) ? "success" : undefined;
}

function CreateRider({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "+91", language: "te" });
  const [created, setCreated] = useState<RiderSummary | null>(null);
  const action = useFleetAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createRiderSchema.safeParse(form);
    if (!parsed.success) return action.refuse(parsed.error.issues[0]?.message ?? "Check the details.");
    const rider = await action.run("POST", "riders", riderSummarySchema, parsed.data, "Rider added. They sign in with this phone and finish the application in the app.");
    if (rider) { setCreated(rider); setForm({ name: "", phone: "+91", language: "te" }); onCreated(); }
  }

  return <form className="cr-panel space-y-3" onSubmit={event => void submit(event)}>
    <h2 className="text-lg font-bold">Add a rider</h2>
    <p className="cr-muted">Only for someone at the office who can&apos;t apply in the app. Everyone else applies in the Craves Rider app.</p>
    <label className={labelClass}>Name as on their documents<input className={fieldClass} value={form.name} maxLength={120} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
    <label className={labelClass}>Phone<input className={fieldClass} value={form.phone} inputMode="tel" maxLength={13} onChange={event => setForm({ ...form, phone: event.target.value.replace(/\s/g, "") })} /></label>
    <label className={labelClass}>Language<select className={fieldClass} value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}>
      <option value="te">Telugu</option><option value="hi">Hindi</option><option value="en">English</option>
    </select></label>
    <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Add rider</button>
    <ActionMessage state={action.state} />
    {created && action.state.phase === "success" && <Link className="underline" href={`/admin/riders/${created.riderId}`}>Open {created.name}</Link>}
  </form>;
}
