import React from 'react';

type SearchHit = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  distanceKm?: number;
  deliveryEtaMinutes?: number;
  availableNow: boolean;
  score: number;
  tags: string[];
};

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
  error: string | null;
  response: { hits: SearchHit[]; suggestions: string[]; counts: Record<string, number> } | null;
  emptyState: string[];
};

export const UniversalSearchComponent = ({ query, onQueryChange, onSearch, loading, error, response, emptyState }: Props) => (
  <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <div className="flex flex-col gap-3 md:flex-row">
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && onSearch()}
        placeholder="Search for biryani, Jain meals, Chef Lakshmi, Banjara Hills..."
        className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      />
      <button
        onClick={onSearch}
        disabled={loading}
        className="rounded-2xl bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
      >
        {loading ? 'Searching…' : 'Search'}
      </button>
    </div>

    {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

    {!response ? (
      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Trending & recent</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {emptyState.map((item) => (
            <button
              key={item}
              onClick={() => {
                onQueryChange(item);
                setTimeout(onSearch, 0);
              }}
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-orange-50 hover:text-orange-600"
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    ) : (
      <div className="mt-6 space-y-5">
        <div className="flex flex-wrap gap-3 text-sm text-slate-600">
          {Object.entries(response.counts).map(([key, value]) => (
            <span key={key} className="rounded-full bg-slate-100 px-3 py-1 font-medium">
              {key}: {value}
            </span>
          ))}
        </div>

        <div className="grid gap-4">
          {response.hits.map((hit) => (
            <article key={hit.id} className="rounded-2xl border border-slate-200 p-4 transition hover:border-orange-200 hover:shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">{hit.type}</span>
                    {hit.availableNow ? <span className="text-xs font-semibold text-emerald-600">Available now</span> : null}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{hit.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{hit.subtitle}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hit.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-sm text-slate-500 md:text-right">
                  <p>Score {hit.score.toFixed(2)}</p>
                  <p>{hit.distanceKm ? `${hit.distanceKm.toFixed(1)} km away` : 'Location flexible'}</p>
                  <p>{hit.deliveryEtaMinutes ? `${hit.deliveryEtaMinutes} min ETA` : 'ETA varies'}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    )}
  </section>
);
