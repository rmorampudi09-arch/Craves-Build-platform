"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { readableFleetValue } from "@/features/admin/fleet/lib/fleet-common";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import { createRiderSchema, RIDER_STATUSES, riderPageSchema, riderSummarySchema, type RiderSummary } from "@/features/admin/fleet/lib/rider-contract";
import { ActionMessage, fieldClass, labelClass, useFleetAction } from "./fleet-action";

const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export function RidersList() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState({ status: "", search: "" });
  const [riders, setRiders] = useState<RiderSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading riders…");
  const [exportDate, setExportDate] = useState(todayIst);

  const load = useCallback(async (after: string | null) => {
    const query = new URLSearchParams();
    if (applied.status) query.set("status", applied.status);
    if (applied.search) query.set("search", applied.search);
    if (after) query.set("cursor", after);
    try {
      const page = await fleetGet(`riders?${query}`, riderPageSchema);
      setRiders(current => after ? [...current, ...page.riders] : page.riders);
      setCursor(page.nextCursor);
      setMessage(after || page.riders.length ? "" : "No riders match these filters.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Riders are unavailable.");
    }
  }, [applied]);

  useEffect(() => { void load(null); }, [load]);

  return <div className="space-y-6">
    <section className="cr-panel">
      <form className="cr-filter-row" onSubmit={event => { event.preventDefault(); setApplied({ status, search: search.trim() }); }}>
        <label className="cr-select-label">Status<select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">All</option>{RIDER_STATUSES.map(value => <option key={value} value={value}>{readableFleetValue(value)}</option>)}
        </select></label>
        <label className="cr-search-field"><span className="cr-sr-only">Name or phone</span><input type="search" placeholder="Name or last digits of the phone" maxLength={80} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <button type="submit" className="cr-button cr-primary">Show riders</button>
        <Link className="cr-button" href="/admin/riders/selfies">Selfie review queue</Link>
      </form>
      {message && <p className="cr-empty" role="status">{message}</p>}
      {riders.length > 0 && <div className="cr-table-scroll"><table className="cr-table">
        <thead><tr><th scope="col">Rider</th><th scope="col">Phone</th><th scope="col">Status</th><th scope="col">Waiting for ops</th><th scope="col">Joined</th></tr></thead>
        <tbody>{riders.map(rider => <tr key={rider.riderId}>
          <td><Link className="font-bold underline" href={`/admin/riders/${rider.riderId}`}>{rider.name}</Link></td>
          <td>{rider.phoneMasked}</td>
          <td><span className="cr-status" data-tone={rider.status === "SUSPENDED" || rider.status === "DEACTIVATED" ? "danger" : undefined}>{readableFleetValue(rider.status)}</span></td>
          <td>{[rider.pendingDocuments ? `${rider.pendingDocuments} document${rider.pendingDocuments === 1 ? "" : "s"}` : "", rider.pendingDevice ? "new phone" : ""].filter(Boolean).join(", ") || "Nothing"}</td>
          <td>{formatAdminTimestamp(rider.createdAt)}</td>
        </tr>)}</tbody>
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

function CreateRider({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "+91", language: "te" });
  const [created, setCreated] = useState<RiderSummary | null>(null);
  const action = useFleetAction();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createRiderSchema.safeParse(form);
    if (!parsed.success) return action.refuse(parsed.error.issues[0]?.message ?? "Check the details.");
    const rider = await action.run("POST", "riders", riderSummarySchema, parsed.data, "Rider added. They can now sign in and upload documents.");
    if (rider) { setCreated(rider); setForm({ name: "", phone: "+91", language: "te" }); onCreated(); }
  }

  return <form className="cr-panel space-y-3" onSubmit={event => void submit(event)}>
    <h2 className="text-lg font-bold">Add a rider</h2>
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
