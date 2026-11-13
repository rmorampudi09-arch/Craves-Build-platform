"use client";

import { useState } from "react";
import { deliveryPreviewSchema, deliveryTariffSchema, type DeliveryTariff } from "@/features/admin/finance/lib/finance-contract";
import type { z } from "zod";

export function DeliveryTariffEditor({value, gstRate, disabled, onChange}: {
  value: DeliveryTariff | null | undefined; gstRate: string; disabled: boolean;
  onChange: (value: DeliveryTariff | null) => void;
}) {
  const [distance, setDistance] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{key: string; quote?: z.infer<typeof deliveryPreviewSchema>; error?: string} | null>(null);
  const key = JSON.stringify({tariff: value, distanceKm: distance, gstRate});
  const current = result?.key === key ? result : null;
  const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5";
  async function preview() {
    const capturedKey = key;
    if (!deliveryTariffSchema.safeParse(value).success || !/^\d{1,5}(\.\d{1,3})?$/.test(distance)) {
      setResult({key: capturedKey, error: "Fill in every delivery price field and a distance to try first. Charges need two decimals, like 39.00."}); return;
    }
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/admin/finance/delivery-preview", {method: "POST", cache: "no-store",
        headers: {"Content-Type": "application/json"}, body: capturedKey});
      if (!response.ok) throw new Error("The charge couldn’t be worked out, or the distance is farther than the limit. Nothing was changed.");
      const quote = deliveryPreviewSchema.parse(await response.json());
      if (quote.distanceBasis !== value?.distanceBasis || quote.increment !== value?.increment || Number(quote.distanceKm) !== Number(distance))
        throw new Error("The answer was for different prices than the ones entered, so it isn’t shown.");
      setResult({key: capturedKey, quote});
    } catch (error) {setResult({key: capturedKey, error: error instanceof Error ? error.message : "The charge couldn’t be worked out. Nothing was changed."});}
    finally {setBusy(false);}
  }
  return <fieldset disabled={disabled} className="mt-5 rounded-xl border border-slate-200 p-5">
    <legend className="px-2 font-semibold">Delivery price by distance</legend>
    <p className="text-sm text-slate-600">This is what Craves charges a customer for delivery, not what a delivery partner charges Craves. It is saved with the settings above, and orders already accepted keep the price they were given. Amounts here are before GST.</p>
    <label className="mt-4 flex gap-3"><input type="checkbox" checked={!!value} onChange={event => onChange(event.target.checked ? {
      baseCharge: "", includedKm: "", perKmCharge: "", maximumKm: "", distanceBasis: "UNCONFIRMED", increment: "UNCONFIRMED",
    } : null)} />Set a delivery price by distance</label>
    {!value ? <p className="mt-3 text-sm">No price by distance is set. Checkout keeps charging for delivery the way it does today; this does not make delivery free.</p> : <>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {([{key: "baseCharge", label: "Starting delivery charge, in rupees"}, {key: "includedKm", label: "Kilometres covered by the starting charge"},
          {key: "perKmCharge", label: "Charge for each extra kilometre, in rupees"}, {key: "maximumKm", label: "Farthest delivery distance, in kilometres"}] as const).map(field =>
          <label key={field.key} className="text-sm">{field.label}<input className={inputClass} inputMode="decimal" value={value[field.key]} onChange={event => onChange({...value, [field.key]: event.target.value})} /></label>)}
        <label className="text-sm">How distance is measured<select className={inputClass} value={value.distanceBasis} onChange={event => onChange({...value, distanceBasis: event.target.value as DeliveryTariff["distanceBasis"]})}>
          <option value="UNCONFIRMED">Choose one</option><option value="STRAIGHT_LINE">In a straight line from the kitchen to the customer</option><option value="ROAD_ROUTE">By road (can’t be switched on yet)</option>
        </select></label>
        <label className="text-sm">How extra distance is charged<select className={inputClass} value={value.increment} onChange={event => onChange({...value, increment: event.target.value as DeliveryTariff["increment"]})}>
          <option value="UNCONFIRMED">Choose one</option><option value="PRO_RATA">Exactly, to the nearest metre</option><option value="STARTED_KILOMETRE">A full kilometre for every kilometre started</option>
        </select></label>
      </div>
      {value.distanceBasis === "ROAD_ROUTE" && <p role="status" className="mt-3 text-sm">Road distance is not connected yet. You can save a draft and try a price, but these settings can’t be switched on. Straight-line distance is never used in its place.</p>}
      <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Try a distance, in kilometres<input className={inputClass} inputMode="decimal" value={distance} onChange={event => setDistance(event.target.value)} /></label>
        <button type="button" disabled={busy} onClick={() => void preview()} className="rounded-xl border border-slate-300 px-4 py-3 font-semibold disabled:opacity-40">{busy ? "Working it out…" : "Work out the delivery charge"}</button></div>
      {current?.error && <p role="alert" className="mt-3 text-sm">{current.error}</p>}
      {current?.quote && <p role="status" className="mt-3 text-sm">Delivery ₹{current.quote.beforeTax} + GST ₹{current.quote.gst} = ₹{current.quote.total}. This is only a calculation: no order, price change or payment was made.</p>}
    </>}
  </fieldset>;
}
