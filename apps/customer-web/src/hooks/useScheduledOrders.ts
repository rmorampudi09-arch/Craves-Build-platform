import { useState } from 'react';

const slots = [
  { slotId: 'slot-1', slotLabel: '12:00 PM - 12:30 PM', capacityRemaining: 12, cutoffAt: '2026-08-25T05:00:00Z' },
  { slotId: 'slot-2', slotLabel: '01:00 PM - 01:30 PM', capacityRemaining: 8, cutoffAt: '2026-08-25T06:00:00Z' },
];

export const useScheduledOrders = () => {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(slots[0].slotId);
  const [status, setStatus] = useState('SELECT_SLOT');

  return {
    slots,
    selectedSlotId,
    setSelectedSlotId,
    status,
    reserve: () => setStatus(selectedSlotId ? `RESERVED:${selectedSlotId}` : 'SELECT_SLOT'),
  };
};
