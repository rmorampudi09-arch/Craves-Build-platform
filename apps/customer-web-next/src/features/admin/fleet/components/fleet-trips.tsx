"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { readableFleetValue } from "@/features/admin/fleet/lib/fleet-common";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import {
  dispatchQueueSchema, formatAge, positionsSchema, reassignSchema, tripSchema, tripsSchema,
  type DispatchQueueItem, type RiderPosition, type Trip,
} from "@/features/admin/fleet/lib/trip-contract";
import { ActionMessage, fieldClass, labelClass, ReasonAction, useFleetAction } from "./fleet-action";

const LEVEL_ORDER = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;

export function FleetTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [queue, setQueue] = useState<DispatchQueueItem[]>([]);
  const [positions, setPositions] = useState<RiderPosition[]>([]);
  const [message, setMessage] = useState("Loading trips…");
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [nextTrips, nextQueue, nextPositions] = await Promise.all([
        fleetGet("trips", tripsSchema), fleetGet("dispatch-queue", dispatchQueueSchema), fleetGet("positions", positionsSchema),
      ]);
      setTrips(nextTrips.trips);
      setQueue([...nextQueue.items].sort((a, b) => LEVEL_ORDER[a.alertLevel] - LEVEL_ORDER[b.alertLevel] || a.queuedAt.localeCompare(b.queuedAt)));
      setPositions(nextPositions.positions);
      setLoadedAt(new Date().toISOString());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Trips are unavailable.");
    }
  }, []);

  useEffect(() => {
    void load();
    // The queue is time-critical; refresh while the page is open.
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // A cancelled or reassigned trip can leave the list, so its confirmation shows here.
  const done = async (text: string) => { setNotice(text); await load(); };
  const idleRiders = positions.filter(position => position.onShift && !position.onTrip && !position.mock);
  const critical = queue.filter(item => item.alertLevel === "CRITICAL").length;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="cr-button" onClick={() => void load()}>Refresh</button>
      <span className="cr-muted">{loadedAt ? `Updated ${formatAdminTimestamp(loadedAt)} · refreshes every 30 seconds` : ""}</span>
    </div>
    {message && <p className="cr-alert" role="alert">{message}</p>}
    {notice && <p className="cr-feedback" role="status">{notice}</p>}

    <section className="cr-panel space-y-3" aria-labelledby="fleet-queue-title">
      <h2 id="fleet-queue-title" className="text-lg font-bold">Dispatch queue</h2>
      <p role="status" className={queue.length ? "cr-alert" : "cr-muted"}>{queue.length
        ? `${queue.length} trip${queue.length === 1 ? "" : "s"} without a courier after fleet, Borzo and Pidge${critical ? ` · ${critical} critical` : ""}.`
        : "No trips are waiting for a courier."}</p>
      {queue.map(item => <article key={item.tripId} className="rounded-xl border border-slate-200 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="cr-status" data-tone={item.alertLevel === "CRITICAL" ? "danger" : undefined}>{readableFleetValue(item.alertLevel)}</span>
          <strong>{item.orderCode}</strong><span>{item.kitchenName} → {item.dropArea}</span><span className="cr-muted">queued {formatAdminTimestamp(item.queuedAt)}</span>
        </div>
        <p className="mt-1">{item.alertMessage}</p>
        <p className="cr-muted">Tried: {item.attempts.map(attempt => `${readableFleetValue(attempt.provider)} (${readableFleetValue(attempt.outcome)})`).join(", ") || "nobody yet"}</p>
        <TripActions tripId={item.tripId} orderCode={item.orderCode} idleRiders={idleRiders} onDone={done} />
      </article>)}
    </section>

    <section className="cr-panel" aria-labelledby="fleet-trips-title">
      <h2 id="fleet-trips-title" className="text-lg font-bold">Active trips</h2>
      {trips.length === 0 ? <p className="cr-empty">No active trips.</p> : <div className="mt-3 space-y-3">{trips.map(trip => <article key={trip.tripId} className="rounded-xl border border-slate-200 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <strong>{trip.orderCode}</strong><span className="cr-status">{readableFleetValue(trip.state)}</span>
          <span>{trip.kitchenName} → {trip.dropArea}</span>
          <span>Courier: {trip.provider === "CRAVES_FLEET" && trip.riderId ? <Link className="underline" href={`/admin/riders/${trip.riderId}`}>{trip.riderName}</Link> : readableFleetValue(trip.provider)}</span>
          <span className="cr-muted">updated {formatAdminTimestamp(trip.updatedAt)}</span>
        </div>
        <TripActions tripId={trip.tripId} orderCode={trip.orderCode} idleRiders={idleRiders} onDone={done} />
      </article>)}</div>}
    </section>

    <section className="cr-panel" aria-labelledby="fleet-positions-title">
      <h2 id="fleet-positions-title" className="text-lg font-bold">Rider positions</h2>
      {positions.length === 0 ? <p className="cr-empty">No rider has sent a location in the last 12 hours.</p> : <div className="cr-table-scroll"><table className="cr-table">
        <thead><tr><th scope="col">Rider</th><th scope="col">Last fix</th><th scope="col">Shift</th><th scope="col">Location</th></tr></thead>
        <tbody>{positions.map(position => <tr key={position.riderId}>
          <td><Link className="underline" href={`/admin/riders/${position.riderId}`}>{position.riderName}</Link></td>
          <td>{formatAge(position.ageSeconds)}{position.mock && <strong className="cr-error-text"> · mock location reported</strong>}</td>
          <td>{position.onTrip ? "On a trip" : position.onShift ? "On shift, waiting" : "Off shift"}</td>
          <td><a className="underline" href={`https://www.google.com/maps?q=${position.lat},${position.lng}`} target="_blank" rel="noreferrer">{position.lat.toFixed(5)}, {position.lng.toFixed(5)}</a></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}

function TripActions({ tripId, orderCode, idleRiders, onDone }: { tripId: string; orderCode: string; idleRiders: RiderPosition[]; onDone: (notice: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const action = useFleetAction();
  const targetName = (value: string) => value === "BORZO" ? "Borzo" : value === "PIDGE" ? "Pidge" : idleRiders.find(rider => rider.riderId === value)?.riderName ?? "the rider";

  async function reassign(event: FormEvent) {
    event.preventDefault();
    const parsed = reassignSchema.safeParse({ ...(target === "BORZO" || target === "PIDGE" ? { provider: target } : target ? { riderId: target } : {}), reason });
    if (!parsed.success) return action.refuse(parsed.error.issues[0]?.message ?? "Check the details.");
    if (!window.confirm(`Reassign ${orderCode} to ${targetName(target)}? The current courier is released first.`)) return;
    if (await action.run("POST", `trips/${tripId}/reassign`, tripSchema, parsed.data, "")) {
      setOpen(false);
      await onDone(`${orderCode} reassigned to ${targetName(target)}.`);
    }
  }

  async function cancel(cancelReason: string) {
    if (!window.confirm(`Cancel the delivery of ${orderCode}? The courier is released.`)) return;
    if (await action.run("POST", `trips/${tripId}/cancel`, tripSchema, { reason: cancelReason }, "")) await onDone(`${orderCode} cancelled.`);
  }

  return <div className="mt-2 space-y-2">
    <div className="flex flex-wrap items-start gap-2">
      {!open && <button type="button" className="cr-button" disabled={action.busy} onClick={() => setOpen(true)}>Reassign</button>}
      <ReasonAction label="Cancel trip" action={action} onSubmit={value => void cancel(value)} />
    </div>
    {open && <form className="grid gap-2 sm:grid-cols-2" onSubmit={event => void reassign(event)}>
      <label className={labelClass}>New courier for {orderCode}<select className={fieldClass} value={target} onChange={event => setTarget(event.target.value)}>
        <option value="">Choose…</option>
        {idleRiders.map(rider => <option key={rider.riderId} value={rider.riderId}>{rider.riderName} (waiting, seen {formatAge(rider.ageSeconds)})</option>)}
        <option value="BORZO">Borzo</option><option value="PIDGE">Pidge</option>
      </select></label>
      <label className={labelClass}>Reason<input className={fieldClass} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></label>
      <span className="cr-actions">
        <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Reassign {orderCode}</button>
        <button type="button" className="cr-button" disabled={action.busy} onClick={() => setOpen(false)}>Back</button>
      </span>
    </form>}
    <ActionMessage state={action.state} />
  </div>;
}
