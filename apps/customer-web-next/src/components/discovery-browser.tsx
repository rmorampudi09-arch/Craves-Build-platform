"use client";

import { useState } from "react";
import type { NearbyKitchenDiscovery, NearbyMenuDiscovery } from "@/lib/discovery-contract";
import { formatDistance } from "@/lib/discovery-contract";

type Mode = "kitchens" | "menu-items";

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function DiscoveryBrowser() {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusMeters, setRadiusMeters] = useState("5000");
  const [mode, setMode] = useState<Mode>("menu-items");
  const [result, setResult] = useState<NearbyKitchenDiscovery | NearbyMenuDiscovery | null>(null);
  const [message, setMessage] = useState("Use your current location or enter coordinates to discover nearby home food.");
  const [busy, setBusy] = useState(false);

  function useLocation() {
    if (!navigator.geolocation) {
      setMessage("This browser does not provide location access. Enter coordinates manually.");
      return;
    }
    setMessage("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      position => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setMessage("Location ready. Select Discover.");
      },
      () => setMessage("Location permission was not granted. Enter coordinates manually."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  async function discover() {
    const lat = Number(latitude);
    const lon = Number(longitude);
    const radius = Number(radiusMeters);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isInteger(radius) || radius < 1 || radius > 100_000) {
      setMessage("Enter valid latitude, longitude and radius values.");
      return;
    }
    setBusy(true);
    setResult(null);
    setMessage("Finding nearby home food…");
    try {
      const query = new URLSearchParams({ latitude: String(lat), longitude: String(lon), radiusMeters: String(radius), page: "0", size: "20" });
      const response = await fetch(`/api/discovery/${mode}?${query}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || "Discovery failed");
      setResult(body);
      const count = mode === "kitchens" ? body.kitchens?.length ?? 0 : body.menuItems?.length ?? 0;
      setMessage(count ? `${count} nearby result${count === 1 ? "" : "s"} found.` : "No nearby results were found for this location and radius.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Discovery is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 shadow-2xl shadow-black/20 sm:p-8">
        <div className="flex flex-wrap gap-2">
          {(["menu-items", "kitchens"] as Mode[]).map(value => (
            <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${mode === value ? "bg-[#6930CA] text-white" : "border border-[#6930CA] text-[#6930CA]"}`}>
              {value === "menu-items" ? "Nearby dishes" : "Home kitchens"}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-semibold">Latitude<input aria-label="Latitude" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" inputMode="decimal" value={latitude} onChange={event => setLatitude(event.target.value)} /></label>
          <label className="text-sm font-semibold">Longitude<input aria-label="Longitude" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" inputMode="decimal" value={longitude} onChange={event => setLongitude(event.target.value)} /></label>
          <label className="text-sm font-semibold">Radius in metres<input aria-label="Radius in metres" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" inputMode="numeric" value={radiusMeters} onChange={event => setRadiusMeters(event.target.value)} /></label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={useLocation} className="rounded-full border border-[#6930CA] px-5 py-3 text-sm font-bold text-[#6930CA]">Use my location</button>
          <button type="button" onClick={discover} disabled={busy} className="rounded-full bg-[#6930CA] px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Discovering…" : "Discover"}</button>
        </div>
        <p role="status" className="mt-4 text-sm text-slate-600">{message}</p>
      </section>

      {result && "menuItems" in result && (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {result.menuItems.map(item => (
            <article key={item.id} className="overflow-hidden rounded-[28px] bg-white shadow-xl shadow-black/15">
              {item.primaryImageUrl ? <img src={item.primaryImageUrl} alt="" className="h-48 w-full object-cover" referrerPolicy="no-referrer" /> : <div className="flex h-48 items-center justify-center bg-[#FFF8EC] text-5xl">🍲</div>}
              <div className="p-5 text-slate-950">
                <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[#6930CA]">{item.category} · {item.foodType.replace("_", " ")}</p><h2 className="mt-2 text-xl font-bold">{item.itemName}</h2></div><strong>{money(item.price, item.currency)}</strong></div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{item.description ?? "Prepared by a nearby home kitchen."}</p>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-600"><span>{item.kitchenDisplayName ?? item.kitchenName}</span><span>{formatDistance(item.distanceMeters)}</span></div>
                <p className="mt-2 text-xs text-slate-500">{item.areaName ? `${item.areaName}, ` : ""}{item.city}</p>
              </div>
            </article>
          ))}
        </section>
      )}

      {result && "kitchens" in result && (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {result.kitchens.map(kitchen => (
            <article key={kitchen.id} className="rounded-[28px] bg-[#FFF8EC] p-6 text-slate-950 shadow-xl shadow-black/15">
              <p className="text-xs font-bold uppercase tracking-wider text-[#6930CA]">Home kitchen</p>
              <h2 className="mt-2 text-2xl font-bold">{kitchen.displayName ?? kitchen.kitchenName}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{kitchen.description ?? "Homemade food from a nearby Craves kitchen."}</p>
              <div className="mt-5 flex items-center justify-between text-sm"><span>{kitchen.areaName ? `${kitchen.areaName}, ` : ""}{kitchen.city}</span><strong>{formatDistance(kitchen.distanceMeters)}</strong></div>
              <p className="mt-2 text-sm text-slate-600">{kitchen.activeMenuItemCount} active dish{kitchen.activeMenuItemCount === 1 ? "" : "es"}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
