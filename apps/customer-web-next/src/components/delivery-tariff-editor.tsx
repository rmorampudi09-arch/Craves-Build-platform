"use client";

import { useState } from "react";
import { deliveryPreviewSchema, deliveryTariffSchema, type DeliveryTariff } from "@/lib/finance-contract";
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
      setResult({key: capturedKey, error: "Complete the tariff, distance basis, billing increment and preview distance first. Enter charges with two decimal places."}); return;
    }
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/admin/finance/delivery-preview", {method: "POST", cache: "no-store",
        headers: {"Content-Type": "application/json"}, body: capturedKey});
      if (!response.ok) throw new Error("Delivery preview is unavailable or outside the configured distance. No rates were activated.");
      const quote = deliveryPreviewSchema.parse(await response.json());
      if (quote.distanceBasis !== value?.distanceBasis || quote.increment !== value?.increment || Number(quote.distanceKm) !== Number(distance))
        throw new Error("The preview did not match the requested tariff.");
      setResult({key: capturedKey, quote});
    } catch (error) {setResult({key: capturedKey, error: error instanceof Error ? error.message : "Preview unavailable. No rates were activated."});}
    finally {setBusy(false);}
  }
  return <fieldset disabled={disabled} className="mt-5 rounded-xl border border-slate-200 p-5">
    <legend className="px-2 font-semibold">Craves distance-based delivery tariff</legend>
    <p className="text-sm text-slate-600">These are Craves customer charges, not the delivery partner’s price. Values are saved with the finance policy; accepted orders keep their original quote. Charges below are before delivery GST.</p>
    <label className="mt-4 flex gap-3"><input type="checkbox" checked={!!value} onChange={event => onChange(event.target.checked ? {
      baseCharge: "", includedKm: "", perKmCharge: "", maximumKm: "", distanceBasis: "UNCONFIRMED", increment: "UNCONFIRMED",
    } : null)} />Configure a distance tariff for this policy</label>
    {!value ? <p className="mt-3 text-sm">No distance tariff selected. Existing checkout delivery pricing remains unchanged; this is not a free-delivery setting.</p> : <>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {([{key: "baseCharge", label: "Base delivery charge, INR"}, {key: "includedKm", label: "Distance included in base charge, km"},
          {key: "perKmCharge", label: "Additional charge per km, INR"}, {key: "maximumKm", label: "Maximum delivery distance, km"}] as const).map(field =>
          <label key={field.key} className="text-sm">{field.label}<input className={inputClass} inputMode="decimal" value={value[field.key]} onChange={event => onChange({...value, [field.key]: event.target.value})} /></label>)}
        <label className="text-sm">Distance basis<select className={inputClass} value={value.distanceBasis} onChange={event => onChange({...value, distanceBasis: event.target.value as DeliveryTariff["distanceBasis"]})}>
          <option value="UNCONFIRMED">Choose explicitly</option><option value="STRAIGHT_LINE">Straight-line distance between saved coordinates</option><option value="ROAD_ROUTE">Road-route distance — activation not available yet</option>
        </select></label>
        <label className="text-sm">Additional distance billing<select className={inputClass} value={value.increment} onChange={event => onChange({...value, increment: event.target.value as DeliveryTariff["increment"]})}>
          <option value="UNCONFIRMED">Choose explicitly</option><option value="PRO_RATA">Pro rata, measured to the nearest metre</option><option value="STARTED_KILOMETRE">Charge each started additional kilometre</option>
        </select></label>
      </div>
      {value.distanceBasis === "ROAD_ROUTE" && <p role="status" className="mt-3 text-sm">Road-route distance is not connected. A draft and arithmetic preview are allowed, but live activation is blocked. Straight-line distance will never be substituted.</p>}
      <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Preview distance, km<input className={inputClass} inputMode="decimal" value={distance} onChange={event => setDistance(event.target.value)} /></label>
        <button type="button" disabled={busy} onClick={() => void preview()} className="rounded-xl border border-slate-300 px-4 py-3 font-semibold disabled:opacity-40">{busy ? "Calculating…" : "Preview delivery charge"}</button></div>
      {current?.error && <p role="alert" className="mt-3 text-sm">{current.error}</p>}
      {current?.quote && <p role="status" className="mt-3 text-sm">Delivery ₹{current.quote.beforeTax} + GST ₹{current.quote.gst} = ₹{current.quote.total}. Arithmetic preview only; no order, rate activation or payment was created.</p>}
    </>}
  </fieldset>;
}
