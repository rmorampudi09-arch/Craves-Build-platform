import React, { useMemo, useState } from 'react';
import { UniversalSearchComponent } from '../../components/universal-search/UniversalSearchComponent';
import { useUniversalSearch } from '../../hooks/useUniversalSearch';

const UniversalSearchPage = () => {
  const [query, setQuery] = useState('');
  const { data, suggestions, popular, loading, error, search } = useUniversalSearch();

  const emptyState = useMemo(
    () => (!query ? popular : suggestions).slice(0, 6),
    [popular, query, suggestions],
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-orange-500">Craves Search</p>
          <h1 className="text-3xl font-bold text-slate-900">Search dishes, chefs, kitchens and cuisines</h1>
          <p className="mt-2 text-slate-600">Find homemade food faster with trending suggestions, geo-aware ranking and availability-aware results.</p>
        </header>
        <UniversalSearchComponent
          query={query}
          onQueryChange={setQuery}
          onSearch={() => search(query)}
          loading={loading}
          error={error}
          response={data}
          emptyState={emptyState}
        />
      </div>
    </main>
  );
};

export default UniversalSearchPage;
