import { useEffect, useState } from 'react';

type Item = { id: string; dishName: string; chefName: string; cuisine: string; locality: string; veg: boolean; healthy: boolean; price: number; rating: number; etaMinutes: number; tags: string; };

export const useAdvancedSearchSmartFilters = ({ query, vegOnly, healthyOnly, maxPrice }: { query: string; vegOnly: boolean; healthyOnly: boolean; maxPrice: string; }) => {
  const [results, setResults] = useState<Item[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const searchUrl = `/api/v1/catalog/search?query=${encodeURIComponent(query)}&vegOnly=${vegOnly}&healthyOnly=${healthyOnly}&maxPrice=${encodeURIComponent(maxPrice)}`;
        const suggestionUrl = `/api/v1/catalog/suggestions?query=${encodeURIComponent(query)}`;
        const [searchResponse, suggestionResponse] = await Promise.all([fetch(searchUrl), fetch(suggestionUrl)]);
        if (!searchResponse.ok || !suggestionResponse.ok) throw new Error('Search request failed');
        const searchJson = await searchResponse.json();
        const suggestionJson = await suggestionResponse.json();
        setResults(searchJson);
        setSuggestions(suggestionJson.map((entry: { dishName: string }) => entry.dishName));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unexpected error');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [query, vegOnly, healthyOnly, maxPrice]);

  return { results, suggestions, loading, error };
};
