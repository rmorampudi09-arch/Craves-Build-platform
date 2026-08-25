import { useState } from 'react';

type ScheduledOrder = {
  id: number;
  chefId: number;
  scheduledFor: string;
  specialInstructions: string;
  estimatedTotal: number;
  status: string;
};

type CreateRequest = {
  chefId: number;
  cartId: number;
  deliveryAddressId: number;
  scheduledFor: string;
  specialInstructions: string;
  estimatedTotal: number;
};

export const useScheduledOrdering = () => {
  const [slots, setSlots] = useState<string[]>([]);
  const [scheduledOrders, setScheduledOrders] = useState<ScheduledOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSlots = async (chefId: string, date: string, zone: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/orders/scheduled/slots?chefId=${chefId}&date=${date}&zone=${zone}`);
      if (!response.ok) throw new Error('Failed to load scheduling slots');
      setSlots(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const createScheduledOrder = async (request: CreateRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/orders/scheduled', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-Id': '42'
        },
        body: JSON.stringify(request)
      });
      if (!response.ok) throw new Error('Failed to schedule order');
      const created = await response.json();
      setScheduledOrders((current) => [...current, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return { slots, scheduledOrders, loading, error, loadSlots, createScheduledOrder };
};
