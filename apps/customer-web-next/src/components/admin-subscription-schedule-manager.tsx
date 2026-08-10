"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminSubscriptionPlan } from "@/lib/admin-subscription-plan-contract";
import type { AdminSubscriptionSchedule } from "@/lib/admin-subscription-runtime-contract";

type Row = { menuItemId: string; quantity: string; day: string; mealSlotCode: string; serviceTime: string; sequenceNumber: string };
const emptyRow = (): Row => ({ menuItemId: "", quantity: "1", day: "", mealSlotCode: "", serviceTime: "", sequenceNumber: "1" });

function rowsFromSchedule(schedule: AdminSubscriptionSchedule): Row[] {
  return schedule.items.map(item => ({
    menuItemId: item.menuItemId,
    quantity: String(item.quantity),
    day: String(schedule.recurrenceType === "WEEKLY" ? item.isoDayOfWeek : item.dayOfMonth),
    mealSlotCode: item.mealSlotCode,
    serviceTime: item.serviceTime.slice(0, 5),
    sequenceNumber: String(item.sequenceNumber),
  }));
}

export function AdminSubscriptionScheduleManager({ plan, onChanged }: { plan: AdminSubscriptionPlan; onChanged: () => Promise<void> }) {
  const [schedule, setSchedule] = useState<AdminSubscriptionSchedule | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [generationLeadHours, setGenerationLeadHours] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/subscription-plans/${plan.id}/schedule`, { cache: "no-store" });
    if (response.status === 404) { setSchedule(null); setRows([emptyRow()]); setGenerationLeadHours(""); return; }
    if (response.status === 401) throw new Error("Administrator session expired.");
    if (response.status === 403) throw new Error("Subscription administrator access is required.");
    if (!response.ok) throw new Error("Plan schedule is unavailable.");
    const value = await response.json() as AdminSubscriptionSchedule;
    setSchedule(value); setTimezone(value.timezone); setGenerationLeadHours(String(value.generationLeadHours)); setRows(rowsFromSchedule(value));
  }, [plan.id]);

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "Plan schedule is unavailable.")); }, [load]);

  function update(index: number, field: keyof Row, value: string) {
    setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  }

  async function save() {
    const lead = Number(generationLeadHours);
    if (!Number.isInteger(lead) || lead < 1 || lead > 168) { setMessage("Generation lead hours must be 1–168."); return; }
    const items = rows.map(row => {
      const quantity = Number(row.quantity), day = Number(row.day), sequenceNumber = Number(row.sequenceNumber);
      if (!row.menuItemId.trim() || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || !Number.isInteger(day) || !Number.isInteger(sequenceNumber) || sequenceNumber < 1 || sequenceNumber > 100 || !row.mealSlotCode.trim() || !row.serviceTime) return null;
      return {
        menuItemId: row.menuItemId.trim(), quantity,
        isoDayOfWeek: plan.billingPeriod === "WEEKLY" ? day : null,
        dayOfMonth: plan.billingPeriod === "MONTHLY" ? day : null,
        mealSlotCode: row.mealSlotCode.trim().toUpperCase(), serviceTime: row.serviceTime, sequenceNumber,
      };
    });
    if (!timezone.trim() || items.length === 0 || items.some(item => item === null)) { setMessage("Complete every schedule field before saving."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/subscription-plans/${plan.id}/schedule`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recurrenceType: plan.billingPeriod, timezone: timezone.trim(), generationLeadHours: lead, items }) });
      if (!response.ok) throw new Error(response.status === 409 ? "Schedule conflicts with the assigned chef/menu configuration." : "Schedule draft could not be saved.");
      await load(); await onChanged(); setMessage("Schedule draft saved. The current active schedule remains live until activation.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Schedule draft could not be saved."); } finally { setBusy(false); }
  }

  async function activate() {
    if (!reason.trim()) { setMessage("Enter an activation reason."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/subscription-plans/${plan.id}/schedule/activate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }) });
      if (!response.ok) throw new Error("Schedule activation failed. Menu ownership/sellability is revalidated at activation.");
      setReason(""); await load(); await onChanged(); setMessage("Schedule activated atomically.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Schedule activation failed."); } finally { setBusy(false); }
  }

  return <section className="rounded-[24px] bg-white p-5 text-slate-950">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-lg font-bold">Meal schedule</h4><p className="mt-1 text-xs text-slate-500">{schedule ? `${schedule.status} · version ${schedule.version}` : "No schedule configured"}. Admin defines every day, meal-slot code, service time, menu item and quantity.</p></div><button type="button" disabled={busy} onClick={() => setRows(current => [...current, emptyRow()])} className="rounded-xl border px-3 py-2 text-sm font-bold">Add item</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Timezone<input value={timezone} onChange={event => setTimezone(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label><label className="text-sm font-bold">Generation lead hours<input type="number" min="1" max="168" value={generationLeadHours} onChange={event => setGenerationLeadHours(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label></div>
    <p className="mt-3 text-xs text-slate-500">{plan.billingPeriod === "WEEKLY" ? "Day uses ISO weekday 1=Monday … 7=Sunday." : "Day uses 1–28 of the month."} Menu UUIDs are validated by Subscription Service against the assigned chef through Catalog Service.</p>
    <div className="mt-3 space-y-3">{rows.map((row, index) => <div key={index} className="grid gap-2 rounded-2xl bg-[#FFF8EC] p-3 md:grid-cols-[2fr_.6fr_.6fr_1fr_1fr_.6fr_auto]">
      <input aria-label={`Menu item ${index + 1} UUID`} placeholder="Menu item UUID" value={row.menuItemId} onChange={event => update(index, "menuItemId", event.target.value)} className="min-h-10 rounded-xl bg-white px-3 text-sm" />
      <input aria-label="Quantity" type="number" min="1" max="100" value={row.quantity} onChange={event => update(index, "quantity", event.target.value)} className="min-h-10 rounded-xl bg-white px-3 text-sm" />
      <input aria-label="Service day" type="number" min="1" max={plan.billingPeriod === "WEEKLY" ? "7" : "28"} value={row.day} onChange={event => update(index, "day", event.target.value)} className="min-h-10 rounded-xl bg-white px-3 text-sm" />
      <input aria-label="Meal slot code" maxLength={40} placeholder="Slot code" value={row.mealSlotCode} onChange={event => update(index, "mealSlotCode", event.target.value.toUpperCase())} className="min-h-10 rounded-xl bg-white px-3 text-sm" />
      <input aria-label="Service time" type="time" value={row.serviceTime} onChange={event => update(index, "serviceTime", event.target.value)} className="min-h-10 rounded-xl bg-white px-3 text-sm" />
      <input aria-label="Sequence" type="number" min="1" max="100" value={row.sequenceNumber} onChange={event => update(index, "sequenceNumber", event.target.value)} className="min-h-10 rounded-xl bg-white px-3 text-sm" />
      <button type="button" disabled={rows.length === 1} onClick={() => setRows(current => current.filter((_, rowIndex) => rowIndex !== index))} className="rounded-xl border px-3 text-sm font-bold disabled:opacity-40">Remove</button>
    </div>)}</div>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-[#6930CA] px-4 py-2 font-bold text-white">Save draft</button><input maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Activation reason" className="min-h-10 flex-1 rounded-xl border px-3 text-sm" /><button type="button" disabled={busy || schedule?.status !== "DRAFT"} onClick={() => void activate()} className="rounded-xl border border-[#6930CA] px-4 py-2 font-bold text-[#6930CA] disabled:opacity-40">Activate schedule</button></div>
    {message && <p className="mt-3 text-sm text-slate-600" role="status">{message}</p>}
  </section>;
}
