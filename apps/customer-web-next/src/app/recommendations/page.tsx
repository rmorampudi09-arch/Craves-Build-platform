"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PersonalisedRecommendation } from "@/lib/personalised-recommendations-contract";

export default function RecommendationsPage() {
  const [items, setItems] = useState<PersonalisedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/recommendations/home", { cache: "no-store", credentials: "same-origin" });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(response.status === 401 ? "Please sign in to see personalised picks." : "Personalised picks are temporarily unavailable.");
        setItems(body as PersonalisedRecommendation[]);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Personalised picks are temporarily unavailable.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-[#0B1426] px-4 py-8 text-[#0B1426] sm:px-6">
      <section className="mx-auto max-w-6xl rounded-3xl bg-[#FFF8EC] p-6 shadow-xl sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">For you</p>
        <h1 className="mt-2 text-3xl font-bold">Your saved cravings, fresh now</h1>
        <p className="mt-2 text-sm text-slate-600">These picks come only from dishes you explicitly saved and their current catalog availability.</p>
        {loading ? <p className="mt-8 text-sm text-slate-600">Loading your picks…</p> : null}
        {error ? <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> : null}
        {!loading && !error && items.length === 0 ? <p className="mt-8 text-sm text-slate-600">Save a few dishes and your personalised picks will appear here.</p> : null}
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.menuItemId} className="rounded-2xl border border-slate-200 bg-white p-5">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Saved by you</span>
              <h2 className="mt-2 text-lg font-semibold">{item.itemName}</h2>
              <p className="mt-1 text-sm text-slate-600">{item.kitchenDisplayName || item.kitchenName}{item.areaName ? ` • ${item.areaName}` : ""}</p>
              <div className="mt-4 flex items-center justify-between text-sm"><span>{item.currency} {item.price.toFixed(2)}</span><Link href={`/dish/${item.menuItemId}`} className="font-semibold text-amber-700">View dish</Link></div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
