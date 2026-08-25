import React from 'react';
import { usePersonalizedHomeFeed } from '../../hooks/usePersonalizedHomeFeed';

export function PersonalizedHomeFeedComponent() {
  const data = usePersonalizedHomeFeed('11111111-1111-1111-1111-111111111111');

  return (
    <div className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-emerald-950">Personalized home feed</h1>
          <p className="text-emerald-700">Dynamic discovery rails powered by repeat behavior, cuisine affinity and locality.</p>
        </div>
        {data.rails.map((rail) => (
          <section key={rail.title} className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">{rail.title}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {rail.items.map((item) => (
                <div key={item} className="rounded-2xl bg-emerald-50 p-4 text-emerald-950">{item}</div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
