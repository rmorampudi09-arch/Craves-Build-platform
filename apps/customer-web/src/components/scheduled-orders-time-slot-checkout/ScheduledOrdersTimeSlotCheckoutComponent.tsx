import React from 'react';

type Slot = {
  chefId: string;
  addressId: string;
  slotStart: string;
  slotEnd: string;
  available: boolean;
  remainingCapacity: number;
  label: string;
};

type Props = {
  chefId: string;
  addressId: string;
  date: string;
  slots: Slot[];
  loading: boolean;
  error: string | null;
  booking: boolean;
  successMessage: string | null;
  onBook: (slot: Slot) => Promise<void>;
};

export const ScheduledOrdersTimeSlotCheckoutComponent = ({ slots, loading, error, booking, successMessage, onBook }: Props) => {
  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
      {successMessage && <div className="rounded-xl bg-emerald-50 p-4 text-emerald-700">{successMessage}</div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? Array.from({ length: 6 }).map((_, idx) => <div key={idx} className="h-40 animate-pulse rounded-2xl bg-stone-200" />) : slots.map((slot) => (
          <div key={slot.slotStart} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-stone-900">{new Date(slot.slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</h3>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${slot.available ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{slot.label}</span>
            </div>
            <p className="mt-2 text-sm text-stone-600">Ends at {new Date(slot.slotEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="mt-4 text-sm text-stone-500">Remaining capacity: {slot.remainingCapacity}</p>
            <button
              className="mt-5 w-full rounded-xl bg-stone-900 px-4 py-3 text-white disabled:cursor-not-allowed disabled:bg-stone-300"
              disabled={!slot.available || booking}
              onClick={() => onBook(slot)}
            >
              {booking ? 'Booking…' : slot.available ? 'Reserve slot' : 'Unavailable'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
