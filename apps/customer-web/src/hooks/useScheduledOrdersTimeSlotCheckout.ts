import { useEffect, useState } from 'react';

type Slot = {
  chefId: string;
  addressId: string;
  slotStart: string;
  slotEnd: string;
  available: boolean;
  remainingCapacity: number;
  label: string;
};

export const useScheduledOrdersTimeSlotCheckout = ({ chefId, addressId, date }: { chefId: string; addressId: string; date: string; }) => {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/orders/slots?chefId=${encodeURIComponent(chefId)}&addressId=${encodeURIComponent(addressId)}&date=${encodeURIComponent(date)}`);
        if (!response.ok) throw new Error('Unable to load slots');
        setSlots(await response.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unexpected error');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [chefId, addressId, date]);

  const onBook = async (slot: Slot) => {
    setBooking(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/v1/checkout/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'customer-demo-001' },
        body: JSON.stringify({
          chefId,
          cartId: 'cart-demo-001',
          addressId,
          slotStart: slot.slotStart,
          slotEnd: slot.slotEnd,
          orderValue: 249.0,
          notes: 'Please prepare less spicy food.'
        })
      });
      if (!response.ok) throw new Error('Unable to reserve selected slot');
      const data = await response.json();
      setSuccessMessage(data.message ?? 'Scheduled order confirmed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setBooking(false);
    }
  };

  return { slots, loading, error, booking, successMessage, onBook };
};
