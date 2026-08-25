import React from 'react';

type Item = { id: string; dishName: string; chefName: string; cuisine: string; locality: string; veg: boolean; healthy: boolean; price: number; rating: number; etaMinutes: number; tags: string; };

type Props = { results: Item[]; suggestions: string[]; loading: boolean; error: string | null; };

export const AdvancedSearchSmartFiltersComponent = ({ results, suggestions, loading, error }: Props) => (
  <div className="space-y-4">
    {suggestions.length > 0 && <div className="flex flex-wrap gap-2">{suggestions.map((s) => <span key={s} className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">{s}</span>)}</div>}
    {error && <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {loading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-stone-200" />) : results.map((item) => (
        <div key={item.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-stone-900">{item.dishName}</h3>
            <span className="text-sm font-medium text-stone-600">₹{item.price}</span>
          </div>
          <p className="mt-1 text-sm text-stone-500">{item.chefName} • {item.cuisine} • {item.locality}</p>
          <p className="mt-3 text-sm text-stone-600">ETA {item.etaMinutes} min • ★ {item.rating}</p>
          <div className="mt-3 flex gap-2">
            {item.veg && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">Veg</span>}
            {item.healthy && <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-700">Healthy</span>}
          </div>
        </div>
      ))}
    </div>
  </div>
);
