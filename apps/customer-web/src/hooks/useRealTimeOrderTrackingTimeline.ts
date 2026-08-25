import { useEffect, useState } from 'react';

type Event = { id: string; status: string; description: string; source: string; occurredAt: string; };

export const useRealTimeOrderTrackingTimeline = (orderId: string) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: number;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/v1/orders/${encodeURIComponent(orderId)}/tracking`);
        if (!response.ok) throw new Error('Failed to load tracking events');
        setEvents(await response.json());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unexpected error');
      } finally {
        setLoading(false);
      }
      timer = window.setTimeout(load, 15000);
    };
    load();
    return () => window.clearTimeout(timer);
  }, [orderId]);

  return { events, loading, error };
};
