import React from 'react';

type Collection = { id: string; slug: string; title: string; subtitle: string; heroTag: string; itemsCsv: string; priority: number; };

type Props = { collections: Collection[]; loading: boolean; error: string | null; };

export const CuratedCollectionsOccasionDiscoveryComponent = ({ collections, loading, error }: Props) => (
  <div className="space-y-4">
    {error && <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {loading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-stone-200" />) : collections.map((collection) => (
        <div key={collection.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{collection.heroTag}</span>
          <h3 className="mt-4 text-xl font-semibold text-stone-900">{collection.title}</h3>
          <p className="mt-2 text-sm text-stone-600">{collection.subtitle}</p>
          <p className="mt-4 text-sm text-stone-500">Includes: {collection.itemsCsv}</p>
        </div>
      ))}
    </div>
  </div>
);
