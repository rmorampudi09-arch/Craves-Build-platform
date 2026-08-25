import React from 'react';
import { useSmartSearchFilter } from '../../hooks/useSmartSearchFilter';

export function SmartSearchFilterComponent() {
  const [query, setQuery] = React.useState('biryani');
  const { data, loading } = useSmartSearchFilter(query);

  return (
    <div className="min-h-screen bg-orange-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-orange-950">Smart search</h1>
          <p className="text-orange-800">Find home-chef meals by cuisine, diet, occasion and budget.</p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 shadow-sm"
          placeholder="Search biryani, homely meals, office lunch..."
        />
        <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
          <aside className="rounded-3xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Filters</h2>
            <div className="mt-4 space-y-4">
              {data?.facets.map((facet) => (
                <div key={facet.category}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{facet.category}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {facet.options.map((option) => (
                      <span key={option.code} className="rounded-full bg-orange-100 px-3 py-1 text-sm text-orange-900">
                        {option.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
          <section className="space-y-4">
            {loading && <div className="rounded-3xl bg-white p-6 shadow-sm">Loading search results...</div>}
            {data?.results.map((result) => (
              <article key={result.kitchenId + result.dishName} className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{result.dishName}</h3>
                    <p className="text-gray-600">{result.kitchenName} · {result.cuisine} · {result.diet}</p>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <p>₹{result.price}</p>
                    <p>{result.etaMinutes} mins</p>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
