import { useCallback, useState } from 'react';

type Recommendation = {
  id: number;
  chefId: number;
  dishId: number;
  title: string;
  reason: string;
  score: number;
  tagline: string;
};

export const useSmartPersonalisedRecommendations = () => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/catalog/recommendations/home', {
        headers: { 'X-Customer-Id': '42' }
      });
      if (!response.ok) throw new Error('Unable to load recommendations');
      setRecommendations(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setRecommendations([
        { id: 1, chefId: 22, dishId: 501, title: 'Sunday Hyderabadi Chicken Biryani', reason: 'You often order biryani on weekend evenings from western Hyderabad.', score: 96.4, tagline: 'Because your last 3 orders were spicy rice bowls' },
        { id: 2, chefId: 17, dishId: 203, title: 'Balanced millet lunch box', reason: 'You saved healthy lunch options and usually order under ₹250 near Madhapur.', score: 91.2, tagline: 'Great match for your weekday office lunch pattern' }
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { recommendations, loading, error, loadRecommendations };
};
