"use client";

import { FormEvent, useState } from "react";
import type { AdvancedSearchResponse } from "@/lib/advanced-search-contract";
import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/lib/catalog-discovery-policy";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [foodType, setFoodType] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [maxPreparationMinutes, setMaxPreparationMinutes] = useState("");
  const [results, setResults] = useState<AdvancedSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }
    if (!("geolocation" in navigator)) {
      setError("Location access is required to search nearby home kitchens.");
      return;
    }

    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
          radiusMeters: String(DEFAULT_DISCOVERY_RADIUS_METERS),
          page: "0",
          size: "20",
        });
        if (foodType) params.set("foodType", foodType);
        if (maxPrice) params.set("maxPrice", maxPrice);
        if (maxPreparationMinutes) params.set("maxPreparationMinutes", maxPreparationMinutes);
        const response = await fetch(`/api/discovery/search?${params}`, { cache: "no-store", credentials: "same-origin" });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error("Search is temporarily unavailable.");
        setResults(body as AdvancedSearchResponse);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Search is temporarily unavailable.");
      } finally {
        setLoading(false);
      }
    }, () => {
      setError("Allow location access to search nearby home kitchens.");
      setLoading(false);
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }

  return (
    <main className="min-h-screen bg-[#0B1426] px-4 py-8 text-[#0B1426] sm:px-6">
      <section className="mx-auto max-w-6xl rounded-3xl bg-[#FFF8EC] p-6 shadow-xl sm:p-8">
        <h1 className="text-3xl font-bold">Search nearby home-cooked food</h1>
        <form className="mt-6 grid gap-3 md:grid-cols-4" onSubmit={submit}>
          <input aria-label="Search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder="Dish, category or kitchen" className="rounded-xl border border-slate-300 bg-white p-3 md:col-span-2" />
          <select aria-label="Food type" value={foodType} onChange={(event) => setFoodType(event.target.value)} className="rounded-xl border border-slate-300 bg-white p-3">
            <option value="">All food types</option><option value="VEG">Vegetarian</option><option value="NON_VEG">Non-vegetarian</option><option value="EGG">Egg</option>
          </select>
          <button type="submit" disabled={loading} className="rounded-xl bg-[#F6B545] p-3 font-semibold disabled:opacity-60">{loading ? "Searching…" : "Search"}</button>
          <input aria-label="Maximum price" inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Max price (optional)" className="rounded-xl border border-slate-300 bg-white p-3" />
          <input aria-label="Maximum preparation minutes" inputMode="numeric" value={maxPreparationMinutes} onChange={(event) => setMaxPreparationMinutes(event.target.value)} placeholder="Max prep minutes" className="rounded-xl border border-slate-300 bg-white p-3" />
        </form>

        {error ? <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> : null}
        {results ? <p className="mt-6 text-sm text-slate-600">{results.totalElements} matching dishes nearby</p> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results?.items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{item.itemName}</h2>
              <p className="mt-1 text-sm text-slate-600">{item.kitchenDisplayName || item.kitchenName}{item.areaName ? ` • ${item.areaName}` : ""}</p>
              <div className="mt-4 flex items-center justify-between text-sm"><span>{item.currency} {item.price.toFixed(2)}</span><span>{Math.round(item.distanceMeters / 100) / 10} km away</span></div>
              <p className="mt-2 text-xs text-slate-500">{item.category}{item.preparationTimeMinutes ? ` • ${item.preparationTimeMinutes} min prep` : ""}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
