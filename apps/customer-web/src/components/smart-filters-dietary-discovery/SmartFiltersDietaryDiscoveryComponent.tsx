import React from 'react';

type Card = { id: string; title: string; subtitle: string; priceForTwo: number; deliveryEtaMinutes: number; tags: string[]; relevance: number };

type Props = {
  veg: boolean;
  healthy: boolean;
  cards: Card[];
  collections: string[];
  toggleVeg: () => void;
  toggleHealthy: () => void;
};

export const SmartFiltersDietaryDiscoveryComponent = ({ veg, healthy, cards, collections, toggleVeg, toggleHealthy }: Props) => (
  <section className="space-y-6">
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap gap-3">
        <button onClick={toggleVeg} className={`rounded-full px-4 py-2 text-sm font-semibold ${veg ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700'}`}>Veg</button>
        <button onClick={toggleHealthy} className={`rounded-full px-4 py-2 text-sm font-semibold ${healthy ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700'}`}>Healthy</button>
        {collections.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">{item}</span>)}
      </div>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <article key={card.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
            <span className="text-xs font-semibold text-emerald-600">#{card.relevance}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{card.subtitle}</p>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>₹{card.priceForTwo} for two</span>
            <span>{card.deliveryEtaMinutes} mins</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {card.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{tag}</span>)}
          </div>
        </article>
      ))}
    </div>
  </section>
);
