import React, { useState } from 'react';
import { AdvancedSearchSmartFiltersComponent } from '../../components/advanced-search-smart-filters/AdvancedSearchSmartFiltersComponent';
import { useAdvancedSearchSmartFilters } from '../../hooks/useAdvancedSearchSmartFilters';

const AdvancedSearchPage = () => {
  const [query, setQuery] = useState('biryani');
  const [vegOnly, setVegOnly] = useState(false);
  const [healthyOnly, setHealthyOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState('300');
  const hook = useAdvancedSearchSmartFilters({ query, vegOnly, healthyOnly, maxPrice });

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-bold text-stone-900">Advanced Search + Smart Filters</h1>
        <div className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-xl border p-3" placeholder="Search dishes, chefs, cuisines" />
          <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="rounded-xl border p-3" placeholder="Max price" />
          <label className="flex items-center gap-2 rounded-xl border p-3"><input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} /> Veg only</label>
          <label className="flex items-center gap-2 rounded-xl border p-3"><input type="checkbox" checked={healthyOnly} onChange={(e) => setHealthyOnly(e.target.checked)} /> Healthy only</label>
        </div>
        <AdvancedSearchSmartFiltersComponent {...hook} />
      </div>
    </div>
  );
};

export default AdvancedSearchPage;
