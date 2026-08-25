import React, { useEffect } from 'react';
import { useSmartPersonalisedRecommendations } from '../../hooks/useSmartPersonalisedRecommendations';

export const SmartPersonalisedRecommendationsComponent: React.FC = () => {
  const { recommendations, loading, error, loadRecommendations } = useSmartPersonalisedRecommendations();

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  return (
    <div className="min-h-screen bg-amber-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Picked for your cravings</h1>
            <p className="mt-2 text-sm text-slate-600">Recommendations tuned to your favourite cuisines, orders and locality.</p>
          </div>
        </div>
        {loading && <p className="text-sm text-slate-500">Curating your feed…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid gap-5 md:grid-cols-3">
          {recommendations.map((item) => (
            <article key={item.id} className="rounded-3xl bg-white p-6 shadow-md">
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">Score {item.score.toFixed(1)}</span>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
              <p className="mt-4 text-sm font-medium text-emerald-700">{item.tagline}</p>
              <div className="mt-6 text-xs text-slate-400">Chef #{item.chefId} • Dish #{item.dishId}</div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};
