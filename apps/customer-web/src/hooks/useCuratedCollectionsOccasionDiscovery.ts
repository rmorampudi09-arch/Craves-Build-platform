import { useEffect, useState } from 'react';

type Collection = { id: string; slug: string; title: string; subtitle: string; heroTag: string; itemsCsv: string; priority: number; };

export const useCuratedCollectionsOccasionDiscovery = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/catalog/collections')
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load collections');
        return response.json();
      })
      .then(setCollections)
      .catch((e) => setError(e instanceof Error ? e.message : 'Unexpected error'))
      .finally(() => setLoading(false));
  }, []);

  return { collections, loading, error };
};
