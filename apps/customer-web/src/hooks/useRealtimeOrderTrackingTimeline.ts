import { useCallback, useState } from 'react';

type TimelineEvent = {
  id: number;
  status: string;
  title: string;
  description: string;
  occurredAt: string;
  actor: string;
  live: boolean;
};

export const useRealtimeOrderTrackingTimeline = () => {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTimeline = useCallback(async (orderId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/orders/${orderId}/timeline`, {
        headers: { 'X-Customer-Id': '42' }
      });
      if (!response.ok) throw new Error('Unable to load timeline');
      setTimeline(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setTimeline([
        { id: 1, status: 'CONFIRMED', title: 'Chef confirmed your order', description: 'Your home chef has accepted the order and started prep planning.', occurredAt: new Date().toISOString(), actor: 'chef-console', live: false },
        { id: 2, status: 'PREPARING', title: 'Fresh cooking in progress', description: 'Ingredients are prepped and your meal is being cooked to order.', occurredAt: new Date().toISOString(), actor: 'kitchen-ops', live: true }
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { timeline, loading, error, loadTimeline };
};
