"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import { formatAdminTimestamp } from "@/features/admin/shell/lib/admin-navigation";
import { readableFleetValue, UUID } from "@/features/admin/fleet/lib/fleet-common";
import { fleetGet } from "@/features/admin/fleet/lib/fleet-client";
import { formatPaise } from "@/features/admin/fleet/lib/payout-contract";
import { riderPageSchema, type RiderSummary } from "@/features/admin/fleet/lib/rider-contract";
import {
  detourChanges, DISPATCH_INPUTS, DISPATCH_MODES, dispatchForm, dispatchFromForm, dispatchPolicyInputSchema, dispatchPolicySchema, draftFromForm,
  fleetSetupSchema, isScheduled, noticeStart, pilotKitchenSchema, pilotRiderSchema, RATE_CARD_INPUTS, rateCardForm, rateCardSchema, toUnitText, versionState,
  type DispatchMode, type FleetSetup as Setup, type PilotKitchen, type PilotRider, type RateCard, type Unit, type UnitInput,
} from "@/features/admin/fleet/lib/setup-contract";
import { ActionMessage, fieldClass, labelClass, useFleetAction, type FleetAction } from "./fleet-action";

const MODE_LABEL = { off: "Off", shadow: "Shadow — logs only", live: "Live" } as const;
const LIVE_WARNING = "Pilot riders will get real orders now. Borzo and Pidge still take any order a rider doesn't accept in time.";
const STOP_WARNING = "Stop dispatch now? Craves riders get no new offers; Borzo and Pidge take every order.";
const STEP: Record<Unit, string> = { rupees: "0.01", km: "0.1", minutes: "1", seconds: "1", percent: "1" };
const DAY = 86_400_000;
const noteBody = (note: string) => note.trim() ? { note: note.trim() } : undefined;

export function FleetSetup() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [message, setMessage] = useState("Loading the pilot setup…");

  const load = useCallback(async () => {
    try {
      setSetup(await fleetGet("setup", fleetSetupSchema));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The pilot setup is unavailable.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-6">
    {message && <p className={setup ? "cr-alert" : "cr-empty"} role="status">{message}</p>}
    {setup && <>
      <SetupStatus setup={setup} />
      <DispatchPanel setup={setup} onDone={load} />
      <RateCards setup={setup} onDone={load} />
      <PilotRiders riders={setup.pilotRiders} onDone={load} />
      <PilotKitchens kitchens={setup.pilotKitchens} onDone={load} />
    </>}
  </div>;
}

function SetupStatus({ setup }: { setup: Setup }) {
  const policy = setup.dispatchPolicy;
  const mode = policy?.mode ?? "off";
  return <section className="cr-panel space-y-3" aria-labelledby="setup-status-title">
    <h2 id="setup-status-title" className="text-lg font-bold">In force now</h2>
    <div className="grid gap-3 md:grid-cols-3">
      <article className="cr-metric" data-tone={mode === "live" ? "success" : mode === "shadow" ? "info" : undefined}>
        <span className="cr-metric-label">Dispatch</span>
        <strong>{MODE_LABEL[mode]}</strong>
        <span className="cr-muted">{policy ? `Version ${policy.version}, since ${formatAdminTimestamp(policy.effectiveFrom)}` : "No dispatch policy is in force, so dispatch is off."}</span>
      </article>
      <article className="cr-metric" data-tone={setup.rateCard ? undefined : "warning"}>
        <span className="cr-metric-label">Rate card</span>
        <strong>{setup.rateCard?.version ?? "None"}</strong>
        <span className="cr-muted">{setup.rateCard ? `In force since ${formatAdminTimestamp(setup.rateCard.effectiveFrom)}` : "No rate card published yet"}</span>
      </article>
      <article className="cr-metric" data-tone={setup.testMode ? "info" : "warning"}>
        <span className="cr-metric-label">Test mode</span>
        <strong>{setup.testMode ? "On" : "Off"}</strong>
        <span className="cr-muted">{setup.testMode
          ? "Test mode is on: only the riders and kitchens listed below get Craves riders."
          : "Test mode is off: every active rider and kitchen can get Craves riders."} It is a server setting; this page can&apos;t change it.</span>
      </article>
    </div>
  </section>;
}

function NumberInputs<F extends string>({ inputs, values, onChange, disabled }: {
  inputs: readonly UnitInput<F>[]; values: Record<F, string>; onChange: (field: F, value: string) => void; disabled?: boolean;
}) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {inputs.map(({ field, label, unit }) => <label key={field} className={labelClass}>{label}
      <input className={fieldClass} type="number" min={0} step={STEP[unit]} disabled={disabled} value={values[field]} onChange={event => onChange(field, event.target.value)} />
    </label>)}
  </div>;
}

function DispatchPanel({ setup, onDone }: { setup: Setup; onDone: () => Promise<void> }) {
  const inForce = setup.dispatchPolicy;
  // The values riders are shown: the policy in force (never a withdrawn one), else the newest draft.
  const shown = inForce ?? setup.dispatchPolicies.find(policy => policy.status === "DRAFT") ?? null;
  // A detour change needs 14 days' notice only once riders have terms, that is a published rate card.
  const reference = setup.rateCard || setup.rateCards.some(card => card.status === "PUBLISHED") ? shown : null;
  const [form, setForm] = useState(() => dispatchForm(shown ?? setup.dispatchPolicies.find(policy => !policy.withdrawnAt) ?? null));
  const save = useFleetAction();
  const stop = useFleetAction();
  const off = form.mode === "off";
  const notice = !off && detourChanges(form, reference);

  /** An off starting now withdraws every scheduled version; any other change now leaves the next one to take over on its date. */
  function scheduledNote(mode: DispatchMode) {
    const scheduled = setup.dispatchPolicies.filter(policy => isScheduled(policy)).sort((a, b) => Date.parse(a.effectiveFrom) - Date.parse(b.effectiveFrom));
    if (scheduled.length === 0) return "";
    if (mode !== "off") return `Version ${scheduled[0].version} (${MODE_LABEL[scheduled[0].mode]}) still takes over on ${formatAdminTimestamp(scheduled[0].effectiveFrom)}.`;
    const list = scheduled.map(policy => `${policy.version} (${MODE_LABEL[policy.mode]}, from ${formatAdminTimestamp(policy.effectiveFrom)})`).join(", ");
    return `${scheduled.length === 1 ? "Version" : "Versions"} ${list} will be withdrawn.`;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (off) return stopDispatch(save);
    const input = dispatchFromForm(form, reference);
    if (typeof input === "string") return save.refuse(input);
    const warning = [input.mode === "live" ? LIVE_WARNING : "", input.effectiveFrom ? "" : scheduledNote(input.mode)].filter(Boolean).join(" ");
    if (warning && !window.confirm(warning)) return;
    if (await save.run("POST", "dispatch-policies", dispatchPolicySchema, input, "Dispatch policy saved.")) await onDone();
  }

  /** An off that starts now is the emergency stop: the server keeps the values riders are shown and withdraws scheduled versions. */
  async function stopDispatch(action: FleetAction) {
    const input = shown ? dispatchPolicyInputSchema.parse({ ...shown, mode: "off", effectiveFrom: undefined }) : dispatchFromForm({ ...form, mode: "off" }, null);
    if (typeof input === "string") return action.refuse(input);
    if (!window.confirm([STOP_WARNING, scheduledNote("off")].filter(Boolean).join(" "))) return;
    if (await action.run("POST", "dispatch-policies", dispatchPolicySchema, input, "Dispatch is off.")) await onDone();
  }

  return <section className="cr-panel space-y-4" aria-labelledby="setup-dispatch-title">
    <h2 id="setup-dispatch-title" className="text-lg font-bold">Dispatch</h2>
    {inForce && inForce.mode !== "off" && <div className="cr-alert space-y-2">
      <strong>Emergency stop</strong>
      <p>Switches dispatch off at once, keeping the other values in force.</p>
      <button type="button" className="cr-button cr-primary" disabled={stop.busy} onClick={() => void stopDispatch(stop)}>Stop dispatch now</button>
    </div>}
    {/* Outside the box, which goes once dispatch is off. */}
    <ActionMessage state={stop.state} />
    <form noValidate className="space-y-3" onSubmit={event => void submit(event)}>
      <p className="cr-muted">A new version takes effect at once. Off: Craves riders get nothing. Shadow: dispatch only writes logs. Live: pilot riders get real offers; it needs a rate card in force.</p>
      <fieldset>
        <legend className={labelClass}>Mode</legend>
        <div className="mt-1 flex flex-wrap gap-4">{DISPATCH_MODES.map(mode => <label key={mode} className="flex items-center gap-2 text-sm">
          <input type="radio" name="dispatch-mode" value={mode} checked={form.mode === mode} onChange={() => setForm(current => ({ ...current, mode }))} />{MODE_LABEL[mode]}
        </label>)}</div>
      </fieldset>
      {off && <p className="cr-muted">Off stops dispatch now and keeps today&apos;s values.</p>}
      <NumberInputs inputs={DISPATCH_INPUTS} values={off && shown ? dispatchForm(shown) : form} disabled={off} onChange={(field, value) => setForm(current => ({ ...current, [field]: value }))} />
      <p className="cr-muted">The cost guard offers a trip to riders only when rider pay plus the overhead is at most the Borzo or Pidge quote plus the premium.</p>
      {notice && reference && <div>
        <label className={labelClass}>New detour starts (IST)<input className={fieldClass} type="datetime-local" aria-describedby="setup-detour-help" value={form.effectiveFrom} onChange={event => setForm(current => ({ ...current, effectiveFrom: event.target.value }))} /></label>
        <p id="setup-detour-help" className="cr-muted mt-1 text-xs">The detour changes rider pay (pickup km = straight line × detour), so riders get 14 days&apos; notice. This whole version, mode included, starts at this time, at least 14 days and 1 hour from now. To change anything sooner, keep the detour at {reference.pickupDetourPercent}%.</p>
      </div>}
      <button type="submit" className="cr-button cr-primary" disabled={save.busy}>Save dispatch policy</button>
      <ActionMessage state={save.state} />
    </form>
    {setup.dispatchPolicies.length > 0 && <div className="cr-table-scroll"><table className="cr-table">
      <caption className="text-left font-bold">Latest versions</caption>
      <thead><tr><th scope="col">Version</th><th scope="col">Mode</th><th scope="col">From</th><th scope="col">Status</th></tr></thead>
      <tbody>{setup.dispatchPolicies.slice(0, 5).map(policy => <tr key={policy.version}>
        <td>{policy.version}</td><td>{MODE_LABEL[policy.mode]}</td><td>{formatAdminTimestamp(policy.effectiveFrom)}</td>
        <td><span className="cr-status">{versionState(policy, inForce)}{policy.withdrawnAt ? ` ${formatAdminTimestamp(policy.withdrawnAt)}` : ""}</span></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}

function RateCards({ setup, onDone }: { setup: Setup; onDone: () => Promise<void> }) {
  const published = setup.rateCards.some(card => card.status === "PUBLISHED");
  return <section className="cr-panel space-y-4" aria-labelledby="setup-rate-title">
    <h2 id="setup-rate-title" className="text-lg font-bold">Rate card</h2>
    <p className="cr-muted">Rider pay terms. The first rate card can take effect at once. Every later one needs 14 days&apos; notice: it must start at least 14 days after you publish it.</p>
    {setup.rateCards.length === 0 ? <p className="cr-empty">No rate card versions yet.</p> : <div className="cr-table-scroll"><table className="cr-table">
      <thead><tr><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Effective from</th><th scope="col">Published</th><th scope="col">Base</th><th scope="col">Base km</th><th scope="col">Each drop km</th><th scope="col">Slot, an hour</th><th scope="col">Action</th></tr></thead>
      <tbody>{setup.rateCards.map(card => <RateCardRow key={card.version} card={card} inForce={setup.rateCard} published={published} onDone={onDone} />)}</tbody>
    </table></div>}
    <NewDraft newest={setup.rateCards[0] ?? null} published={published} onDone={onDone} />
  </section>;
}

function RateCardRow({ card, inForce, published, onDone }: { card: RateCard; inForce: RateCard | null; published: boolean; onDone: () => Promise<void> }) {
  const action = useFleetAction();
  async function publish() {
    const start = formatAdminTimestamp(card.effectiveFrom);
    if (!window.confirm(published
      ? `Publish rate card ${card.version}? Rate cards after the first need 14 days' notice: it starts ${start}, which must be on or after ${formatAdminTimestamp(new Date(Date.now() + 14 * DAY).toISOString())}.`
      : `Publish rate card ${card.version}? It is the first rate card, so it takes effect at once (or at ${start}, if that is later). Riders are paid by it from then.`)) return;
    if (await action.run("POST", `rate-cards/${card.version}/publish`, rateCardSchema, undefined, "Rate card published.")) await onDone();
  }
  return <tr>
    <td>{card.version}</td><td><span className="cr-status">{versionState(card, inForce)}</span></td>
    <td>{formatAdminTimestamp(card.effectiveFrom)}</td><td>{card.publishedAt ? formatAdminTimestamp(card.publishedAt) : "—"}</td>
    <td>{formatPaise(card.basePaise)}</td><td>{toUnitText("km", card.baseDropM)} km</td><td>{formatPaise(card.dropPerKmPaise)}</td><td>{formatPaise(card.slotGuaranteePerHourPaise)}</td>
    <td>{card.status === "DRAFT" && <button type="button" className="cr-button" aria-label={`Publish ${card.version}`} disabled={action.busy} onClick={() => void publish()}>Publish</button>}<ActionMessage state={action.state} /></td>
  </tr>;
}

function NewDraft({ newest, published, onDone }: { newest: RateCard | null; published: boolean; onDone: () => Promise<void> }) {
  const [form, setForm] = useState(() => rateCardForm(newest, published ? noticeStart() : ""));
  const action = useFleetAction();
  const text = (field: "effectiveFrom" | "en" | "te" | "hi" | "fullTextUrl") => ({
    value: form[field], onChange: (event: { target: { value: string } }) => setForm(current => ({ ...current, [field]: event.target.value })),
  });
  const setRange = (field: keyof typeof form.ranges, side: 0 | 1, value: string) => setForm(current => {
    const pair: [string, string] = [...current.ranges[field]];
    pair[side] = value;
    return { ...current, ranges: { ...current.ranges, [field]: pair } };
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = draftFromForm(form, !published);
    if (typeof input === "string") return action.refuse(input);
    if (await action.run("POST", "rate-cards", rateCardSchema, input, "Draft saved. Check it in the table, then publish it.")) await onDone();
  }

  return <form noValidate className="space-y-3 border-t border-slate-200 pt-4" aria-labelledby="setup-draft-title" onSubmit={event => void submit(event)}>
    <h3 id="setup-draft-title" className="font-bold">New draft</h3>
    <p className="cr-muted">Filled in from the newest version. Amounts in ₹, distances in km.</p>
    <NumberInputs inputs={RATE_CARD_INPUTS} values={form} onChange={(field, value) => setForm(current => ({ ...current, [field]: value }))} />
    {!published && <fieldset className="space-y-2">
      <legend className="font-bold">Allowed ranges</legend>
      <p className="cr-muted">The first rate card sets the lowest and highest each value may ever be. Every later card must stay inside them, and they can&apos;t change after the first card is published.</p>
      <div className="cr-table-scroll"><table className="cr-table">
        <thead><tr><th scope="col">Value</th><th scope="col">Lowest</th><th scope="col">Highest</th></tr></thead>
        <tbody>{RATE_CARD_INPUTS.map(({ field, label, unit }) => <tr key={field}>
          <th scope="row">{label}</th>
          {([0, 1] as const).map(side => <td key={side}><input className={fieldClass} type="number" min={0} step={STEP[unit]} aria-label={`${label}: ${side ? "highest" : "lowest"}`}
            value={form.ranges[field][side]} onChange={event => setRange(field, side, event.target.value)} /></td>)}
        </tr>)}</tbody>
      </table></div>
    </fieldset>}
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass}>Starts (IST)<input className={fieldClass} type="datetime-local" aria-describedby="setup-draft-start" {...text("effectiveFrom")} /></label>
        <p id="setup-draft-start" className="cr-muted mt-1 text-xs">{published ? "At least 14 days after you publish it; filled in as 14 days and 1 hour from now." : "If this time has passed when you publish, the card starts then."}</p>
      </div>
      <label className={labelClass}>Full terms link (optional)<input className={fieldClass} type="url" maxLength={400} placeholder="https://" {...text("fullTextUrl")} /></label>
    </div>
    <label className={labelClass}>What changes, in English: one line each, 1 to 10 lines<textarea className={fieldClass} rows={3} {...text("en")} /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>In Telugu (optional)<textarea className={fieldClass} rows={3} {...text("te")} /></label>
      <label className={labelClass}>In Hindi (optional)<textarea className={fieldClass} rows={3} {...text("hi")} /></label>
    </div>
    <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Save draft</button>
    <ActionMessage state={action.state} />
  </form>;
}

function PilotRiders({ riders, onDone }: { riders: PilotRider[]; onDone: () => Promise<void> }) {
  return <section className="cr-panel space-y-3" aria-labelledby="setup-riders-title">
    <h2 id="setup-riders-title" className="text-lg font-bold">Pilot riders</h2>
    <p className="cr-muted">While test mode is on, only these riders get Craves offers.</p>
    {riders.length === 0 ? <p className="cr-empty">No pilot riders yet.</p> : <div className="cr-table-scroll"><table className="cr-table">
      <thead><tr><th scope="col">Rider</th><th scope="col">Status</th><th scope="col">Note</th><th scope="col">Added</th><th scope="col">Action</th></tr></thead>
      <tbody>{riders.map(rider => <PilotRow key={rider.riderId} path={`pilot/riders/${rider.riderId}`} name={rider.name} addedAt={rider.addedAt} note={rider.note} onDone={onDone}
        confirm={`Remove ${rider.name} from the pilot? While test mode is on, they get no new Craves offers.`}>
        <td><Link className="font-bold underline" href={`/admin/riders/${rider.riderId}`}>{rider.name}</Link></td>
        <td><span className="cr-status" data-tone={rider.status === "ACTIVE" ? undefined : "danger"}>{readableFleetValue(rider.status)}</span></td>
      </PilotRow>)}</tbody>
    </table></div>}
    <AddPilotRider onDone={onDone} />
  </section>;
}

function PilotRow({ path, name, note, addedAt, confirm, onDone, children }: {
  path: string; name: string; note?: string | null; addedAt: string; confirm: string; onDone: () => Promise<void>; children: ReactNode;
}) {
  const action = useFleetAction();
  async function remove() {
    if (!window.confirm(confirm)) return;
    // DELETE answers 204 (null), so reload either way; the row stays with its error if the remove failed.
    await action.run("DELETE", path, z.null(), undefined, "Removed.");
    await onDone();
  }
  return <tr>
    {children}<td>{note || "—"}</td><td>{formatAdminTimestamp(addedAt)}</td>
    <td><button type="button" className="cr-button" aria-label={`Remove ${name}`} disabled={action.busy} onClick={() => void remove()}>Remove</button><ActionMessage state={action.state} /></td>
  </tr>;
}

function AddPilotRider({ onDone }: { onDone: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<RiderSummary[]>([]);
  const [riderId, setRiderId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const action = useFleetAction();

  async function find(event: FormEvent) {
    event.preventDefault();
    if (!search.trim()) return setMessage("Type a name or the last digits of the phone.");
    setMessage("Searching…");
    try {
      const page = await fleetGet(`riders?${new URLSearchParams({ search: search.trim() })}`, riderPageSchema);
      setFound(page.riders);
      setRiderId(page.riders[0]?.riderId ?? "");
      setMessage(page.riders.length ? "" : "No riders match.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Riders are unavailable.");
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!riderId) return action.refuse("Find and choose a rider first.");
    if (await action.run("PUT", `pilot/riders/${riderId}`, pilotRiderSchema, noteBody(note), "Rider added to the pilot.")) {
      setNote("");
      await onDone();
    }
  }

  return <div className="space-y-3 border-t border-slate-200 pt-4">
    <h3 className="font-bold">Add a pilot rider</h3>
    <form role="search" noValidate className="cr-filter-row" onSubmit={event => void find(event)}>
      <label className={labelClass}>Find a rider<input className={fieldClass} type="search" maxLength={80} placeholder="Name or last digits of the phone" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <button type="submit" className="cr-button">Find riders</button>
    </form>
    {message && <p className="cr-empty" role="status">{message}</p>}
    {found.length > 0 && <form noValidate className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={event => void add(event)}>
      <label className={labelClass}>Rider to add<select className={fieldClass} value={riderId} onChange={event => setRiderId(event.target.value)}>
        {found.map(rider => <option key={rider.riderId} value={rider.riderId}>{`${rider.name} · ${rider.phoneMasked} · ${readableFleetValue(rider.status)}`}</option>)}
      </select></label>
      <label className={labelClass}>Note (optional)<input className={fieldClass} maxLength={200} value={note} onChange={event => setNote(event.target.value)} /></label>
      <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Add to pilot</button>
      <span className="sm:col-span-3"><ActionMessage state={action.state} /></span>
    </form>}
  </div>;
}

function PilotKitchens({ kitchens, onDone }: { kitchens: PilotKitchen[]; onDone: () => Promise<void> }) {
  const [chefId, setChefId] = useState("");
  const [note, setNote] = useState("");
  const action = useFleetAction();

  async function add(event: FormEvent) {
    event.preventDefault();
    const id = chefId.trim().toLowerCase();
    if (!UUID.test(id)) return action.refuse("Paste the chef's Identity ID: 36 letters, digits and dashes.");
    if (await action.run("PUT", `pilot/kitchens/${id}`, pilotKitchenSchema, noteBody(note), "Kitchen added to the pilot.")) {
      setChefId("");
      setNote("");
      await onDone();
    }
  }

  return <section className="cr-panel space-y-3" aria-labelledby="setup-kitchens-title">
    <h2 id="setup-kitchens-title" className="text-lg font-bold">Pilot kitchens</h2>
    <p className="cr-muted">While test mode is on, only orders from these kitchens go to Craves riders.</p>
    {kitchens.length === 0 ? <p className="cr-empty">No pilot kitchens yet.</p> : <div className="cr-table-scroll"><table className="cr-table">
      <thead><tr><th scope="col">Chef ID</th><th scope="col">Note</th><th scope="col">Added</th><th scope="col">Action</th></tr></thead>
      <tbody>{kitchens.map(kitchen => <PilotRow key={kitchen.chefId} path={`pilot/kitchens/${kitchen.chefId}`} name={`kitchen ${kitchen.chefId}`} note={kitchen.note} addedAt={kitchen.addedAt} onDone={onDone}
        confirm={`Remove kitchen ${kitchen.chefId} from the pilot? While test mode is on, its orders go to Borzo and Pidge only.`}>
        <td><code>{kitchen.chefId}</code></td>
      </PilotRow>)}</tbody>
    </table></div>}
    <form noValidate className="space-y-3 border-t border-slate-200 pt-4" aria-labelledby="setup-kitchen-add-title" onSubmit={event => void add(event)}>
      <h3 id="setup-kitchen-add-title" className="font-bold">Add a pilot kitchen</h3>
      <p id="setup-chef-help" className="cr-muted">Open the chef in <Link className="underline" href="/admin/explorer/chefs">All chef applications</Link> and copy their Identity ID (not the Record ID). On their orders in All orders the same ID shows as Chef ID.</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className={labelClass}>Chef ID<input className={fieldClass} maxLength={36} spellCheck={false} aria-describedby="setup-chef-help" value={chefId} onChange={event => setChefId(event.target.value)} /></label>
        <label className={labelClass}>Note (optional)<input className={fieldClass} maxLength={200} value={note} onChange={event => setNote(event.target.value)} /></label>
        <button type="submit" className="cr-button cr-primary" disabled={action.busy}>Add kitchen</button>
      </div>
      <ActionMessage state={action.state} />
    </form>
  </section>;
}
