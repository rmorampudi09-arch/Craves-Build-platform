import { useEffect, useState } from 'react';

export type TimelineEvent = { status: string; message: string; eventTime: string };

export function useLiveOrderTrackingTimeline(orderId: string) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/orders/${orderId}/timeline`)
      .then((response) => response.json())
      .then((payload) => {
        if (active) {
          setEvents(payload.events ?? []);
        }
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  return events;
}
