import React from 'react';
import { useChefTrustBadge } from '../../hooks/useChefTrustBadge';

export function ChefTrustBadgeComponent() {
  const badges = useChefTrustBadge('44444444-4444-4444-4444-444444444444');

  return (
    <div className="min-h-screen bg-cyan-50 p-6">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-cyan-950">Chef trust badges</h1>
        <p className="mt-2 text-cyan-700">Build customer confidence with verification, hygiene and repeat-order trust signals.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {badges.map((badge) => (
            <div key={badge.code} className="rounded-2xl bg-cyan-50 p-5">
              <p className="font-semibold text-cyan-950">{badge.label}</p>
              <p className="mt-2 text-sm text-gray-600">{badge.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
