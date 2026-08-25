import { useCallback, useState } from 'react';

export type ScheduledOrderPayload = {
  customerId: string;
  kitchenId: string;
  scheduledDate: string;
  slotWindow: string;
};

export function useScheduledOrder() {
  const [submitting, setSubmitting] = useState(false);

  const createScheduledOrder = useCallback(async (payload: ScheduledOrderPayload) => {
    setSubmitting(true);
    const response = await fetch('/api/orders/scheduled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setSubmitting(false);
    if (!response.ok) {
      throw new Error('Unable to schedule order');
    }
    return response.json();
  }, []);

  return { createScheduledOrder, submitting };
}
