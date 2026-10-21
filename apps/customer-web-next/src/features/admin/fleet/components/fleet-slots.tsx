"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { readableFleetValue } from "@/features/admin/fleet/lib/fleet-common";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import { addDays, formatPaise, istDay } from "@/features/admin/fleet/lib/payout-contract";
import { riderPageSchema, type RiderSummary } from "@/features/admin/fleet/lib/rider-contract";
import {
  bannerFromForm, slotFromForm, slotRangeProblem, slotSchema, slotsSchema, zoneBannerSchema, type Slot, type SlotForm, type ZoneBanner,
} from "@/features/admin/fleet/lib/slot-contract";
import { ActionMessage, fieldClass, labelClass, ReasonAction, useFleetAction } from "./fleet-action";

const istTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", timeStyle: "short" });
// Slots booked here start and end on the same IST day, so the end needs only its time.
const slotWindow = (slot: Slot) => `${formatAdminTimestamp(slot.startsAt).replace(/ IST$/, "")} – ${istTime.format(new Date(slot.endsAt))} IST`;

export function FleetSlots() {
  const [riders, setRiders] = useState<RiderSummary[]>([]);
  const [ridersMessage, setRidersMessage] = useState("");
  const [range, setRange] = useState(() => ({ from: istDay(), to: addDays(istDay(), 6), riderId: "" }));
  const [applied, setApplied] = useState(range);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [message, setMessage] = useState("Loading slots…");

  useEffect(() => {
    // shortcut: the rider pickers list the first 100 active riders; follow nextCursor once the fleet passes 100.
    fleetGet("riders?status=ACTIVE", riderPageSchema)
      .then(page => setRiders(page.riders))
      .catch((error: unknown) => setRidersMessage(error instanceof Error ? error.message : "Riders are unavailable."));
  }, []);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ from: applied.from, to: applied.to });
    if (applied.riderId) query.set("riderId", applied.riderId);
    try {
      const page = await fleetGet(`slots?${query}`, slotsSchema);
      setSlots(page.slots);
      setMessage(page.slots.length ? "" : "No slots on these days.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Slots are unavailable.");
    }
  }, [applied]);
  useEffect(() => { void load(); }, [load]);

  function show(event: FormEvent) {
    event.preventDefault();
    const problem = slotRangeProblem(range.from, range.to);
    if (problem) return setMessage(problem);
    setApplied({ ...range });
  }

  return <div className="space-y-6">
    <BannerPanel />
    <section className="cr-panel space-y-3" aria-labelledby="fleet-slots-title">
      <h2 id="fleet-slots-title" className="text-lg font-bold">Slots</h2>
      <form noValidate className="cr-filter-row" onSubmit={show}>
        <label className={labelClass}>First day<input className={fieldClass} type="date" value={range.from} onChange={event => setRange({ ...range, from: event.target.value })} /></label>
        <label className={labelClass}>Last day<input className={fieldClass} type="date" value={range.to} onChange={event => setRange({ ...range, to: event.target.value })} /></label>
        <label className={labelClass}>Rider<select className={fieldClass} value={range.riderId} onChange={event => setRange({ ...range, riderId: event.target.value })}>
          <option value="">All riders</option>{riders.map(rider => <option key={rider.riderId} value={rider.riderId}>{rider.name}</option>)}
        </select></label>
        <button type="submit" className="cr-button cr-primary">Show slots</button>
      </form>
      {message && <p className="cr-empty" role="status">{message}</p>}
      {slots.length > 0 && <div className="cr-table-scroll"><table className="cr-table">
        <thead><tr><th scope="col">Rider</th><th scope="col">Zone</th><th scope="col">When</th><th scope="col">Guarantee</th><th scope="col">Status</th><th scope="col">Online in zone</th><th scope="col">Top-up</th><th scope="col">Action</th></tr></thead>
        <tbody>{slots.map(slot => <SlotRow key={slot.slotId} slot={slot} onDone={load} />)}</tbody>
      </table></div>}
    </section>
    <CreateSlot riders={riders} ridersMessage={ridersMessage} onCreated={load} />
  </div>;
}

function SlotRow({ slot, onDone }: { slot: Slot; onDone: () => Promise<void> }) {
  const action = useFleetAction();
  async function cancel(reason: string) {
    if (!window.confirm(`Cancel ${slot.riderName}'s slot, ${slotWindow(slot)}? The rider loses its guarantee.`)) return;
    if (await action.run("POST", `slots/${slot.slotId}/cancel`, slotSchema, { reason }, "Slot cancelled.")) await onDone();
  }
  return <tr>
    <td><Link className="underline" href={`/admin/riders/${slot.riderId}`}>{slot.riderName}</Link></td>
    <td>{slot.zoneName}</td><td>{slotWindow(slot)}</td><td>{formatPaise(slot.guaranteedPerHourPaise)} an hour</td>
    <td><span className="cr-status" data-tone={slot.status === "CANCELLED" ? "danger" : undefined}>{readableFleetValue(slot.status)}</span></td>
    <td>{slot.onlineInZoneMinutes == null ? "—" : `${slot.onlineInZoneMinutes} min`}</td>
    <td>{slot.topUpPaise == null ? "—" : formatPaise(slot.topUpPaise)}</td>
    <td>{slot.status === "BOOKED" && <ReasonAction label="Cancel slot" action={action} onSubmit={reason => void cancel(reason)} />}<ActionMessage state={action.state} /></td>
  </tr>;
}

function CreateSlot({ riders, ridersMessage, onCreated }: { riders: RiderSummary[]; ridersMessage: string; onCreated: () => Promise<void> }) {
  const empty: SlotForm = { riderId: "", zoneName: "", date: istDay(), startTime: "", endTime: "", rupeesPerHour: "" };
  const [form, setForm] = useState(empty);
  const action = useFleetAction();
  const set = (field: keyof SlotForm) => (event: { target: { value: string } }) => setForm({ ...form, [field]: event.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = slotFromForm(form);
    if (typeof input === "string") return action.refuse(input);
    if (await action.run("POST", "slots", slotSchema, input, "Slot booked.")) {
      setForm({ ...empty, date: form.date, zoneName: form.zoneName });
      await onCreated();
    }
  }

  return <form noValidate className="cr-panel space-y-3" onSubmit={event => void submit(event)}>
    <h2 className="text-lg font-bold">Book a slot</h2>
    <p className="cr-muted">Times are IST. The rider is paid at least this much for each hour online in the zone, counted only from real (non-mock) locations; the server refuses an amount outside the current rate card&apos;s range.</p>
    {ridersMessage && <p className="cr-empty" role="status">{ridersMessage}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <label className={labelClass}>Rider for the slot<select className={fieldClass} value={form.riderId} onChange={set("riderId")}>
        <option value="">Choose…</option>{riders.map(rider => <option key={rider.riderId} value={rider.riderId}>{rider.name}</option>)}
      </select></label>
      <label className={labelClass}>Zone<input className={fieldClass} value={form.zoneName} maxLength={80} onChange={set("zoneName")} /></label>
      <label className={labelClass}>Day<input className={fieldClass} type="date" min={istDay()} value={form.date} onChange={set("date")} /></label>
      <label className={labelClass}>Starts (IST)<input className={fieldClass} type="time" value={form.startTime} onChange={set("startTime")} /></label>
      <label className={labelClass}>Ends (IST)<input className={fieldClass} type="time" value={form.endTime} onChange={set("endTime")} /></label>
      <label className={labelClass}>Guarantee, ₹ an hour<input className={fieldClass} inputMode="decimal" maxLength={9} value={form.rupeesPerHour} onChange={set("rupeesPerHour")} /></label>
    </div>
    <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Book slot</button>
    <ActionMessage state={action.state} />
  </form>;
}

function BannerPanel() {
  const [banner, setBanner] = useState<ZoneBanner | null>(null);
  const [message, setMessage] = useState("Loading the banner…");
  const [form, setForm] = useState({ tone: "info", text: "", until: "" });
  const save = useFleetAction();
  const clear = useFleetAction();

  const load = useCallback(async () => {
    try {
      const current = await fleetGet("banner", zoneBannerSchema.nullable());
      setBanner(current);
      setMessage(current ? "" : "No banner is showing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The banner is unavailable.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = bannerFromForm(form);
    if (typeof input === "string") return save.refuse(input);
    const shown = await save.run("PUT", "banner", zoneBannerSchema, input, "Banner is showing on riders' Home.");
    if (shown) { setBanner(shown); setMessage(""); setForm({ tone: "info", text: "", until: "" }); }
  }

  async function clearBanner() {
    if (!window.confirm("Stop showing the banner to riders?")) return;
    await clear.run("DELETE", "banner", z.null(), undefined, "Banner cleared.");
    await load();
  }

  return <section className="cr-panel space-y-3" aria-labelledby="fleet-banner-title">
    <h2 id="fleet-banner-title" className="text-lg font-bold">Zone banner</h2>
    {message && <p className="cr-empty" role="status">{message}</p>}
    {banner && <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="cr-status">{banner.tone === "warning" ? "Warning" : "Info"}</span>
      <span>{banner.text}</span><span className="cr-muted">until {formatAdminTimestamp(banner.until)}</span>
      <button type="button" className="cr-button" disabled={clear.busy} onClick={() => void clearBanner()}>Clear banner</button>
    </div>}
    <ActionMessage state={clear.state} />
    <form noValidate className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[10rem_1fr_14rem]" onSubmit={event => void submit(event)}>
      <label className={labelClass}>Tone<select className={fieldClass} value={form.tone} onChange={event => setForm({ ...form, tone: event.target.value })}>
        <option value="info">Info</option><option value="warning">Warning</option>
      </select></label>
      <div>
        <label className={labelClass}>Banner text<input className={fieldClass} value={form.text} maxLength={160} aria-describedby="fleet-banner-count" placeholder="Heavy rain in Madhapur. Ride slowly." onChange={event => setForm({ ...form, text: event.target.value })} /></label>
        <p id="fleet-banner-count" className="cr-muted mt-1 text-xs">{form.text.length} of 160 characters</p>
      </div>
      <label className={labelClass}>Show until (IST)<input className={fieldClass} type="datetime-local" value={form.until} onChange={event => setForm({ ...form, until: event.target.value })} /></label>
      <span className="sm:col-span-3"><button type="submit" className="cr-button cr-primary" disabled={save.busy}>{banner ? "Replace banner" : "Show banner"}</button><ActionMessage state={save.state} /></span>
    </form>
  </section>;
}
