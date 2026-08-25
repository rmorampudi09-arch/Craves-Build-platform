import { useEffect, useState } from 'react';

export type SmartSearchResult = {
  kitchenId: string;
  kitchenName: string;
  dishName: string;
  cuisine: string;
  diet: string;
  price: number;
  etaMinutes: number;
};

export type SmartSearchResponse = {
  query: string;
  facets: { category: string; options: { code: string; label: string }[] }[];
  results: SmartSearchResult[];
};

export function useSmartSearchFilter(query: string) {
  const [data, setData] = useState<SmartSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      const payload = await response.json();
      setData(payload);
      setLoading(false);
    }
    load().catch(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  return { data, loading };
}
