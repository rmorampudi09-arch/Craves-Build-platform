import { useCallback, useState } from 'react';

type SearchResponse = {
  hits: Array<{
    id: string;
    type: string;
    title: string;
    subtitle: string;
    imageUrl: string;
    distanceKm?: number;
    deliveryEtaMinutes?: number;
    availableNow: boolean;
    score: number;
    tags: string[];
  }>;
  suggestions: string[];
  counts: Record<string, number>;
};

const fallback: SearchResponse = {
  hits: [
    {
      id: 'dish-1',
      type: 'DISH',
      title: 'Andhra Chicken Curry',
      subtitle: 'Spicy home-style curry · Chef Lakshmi',
      imageUrl: '',
      distanceKm: 2.1,
      deliveryEtaMinutes: 32,
      availableNow: true,
      score: 0.94,
      tags: ['SPICY', 'NON_VEG'],
    },
  ],
  suggestions: ['andhra chicken curry', 'andhra meals', 'chef lakshmi'],
  counts: { DISH: 1 },
};

export const useUniversalSearch = () => {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(['biryani', 'healthy meals', 'jain thali']);
  const [popular] = useState<string[]>(['chicken curry', 'healthy meals', 'high protein', 'today specials']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
      }
      const payload = (await response.json()) as SearchResponse;
      setData(payload);
      setSuggestions(payload.suggestions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to search right now');
      setData(fallback);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, suggestions, popular, loading, error, search };
};
