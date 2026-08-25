import React from 'react';
import { SmartFiltersDietaryDiscoveryComponent } from '../../components/smart-filters-dietary-discovery/SmartFiltersDietaryDiscoveryComponent';
import { useSmartFiltersDietaryDiscovery } from '../../hooks/useSmartFiltersDietaryDiscovery';

const SmartFiltersDietaryDiscoveryPage = () => {
  const discovery = useSmartFiltersDietaryDiscovery();

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">Discovery</p>
          <h1 className="text-3xl font-bold text-slate-900">Smart filters for dietary-first food discovery</h1>
          <p className="mt-2 text-slate-600">Surface the right homemade meals for Hyderabad customers using diet, delivery promise and budget filters.</p>
        </header>
        <SmartFiltersDietaryDiscoveryComponent {...discovery} />
      </div>
    </main>
  );
};

export default SmartFiltersDietaryDiscoveryPage;
