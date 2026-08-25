import React from 'react';

type Slot = { slotId: string; slotLabel: string; capacityRemaining: number; cutoffAt: string };

type Props = {
  slots: Slot[];
  selectedSlotId: string | null;
  setSelectedSlotId: (slotId: string) => void;
  reserve: () => void;
  status: string;
};

export const ScheduledOrdersComponent = ({ slots, selectedSlotId, setSelectedSlotId, reserve, status }: Props) => (
  <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <div className="grid gap-4 md:grid-cols-2">
      {slots.map((slot) => (
        <button
          key={slot.slotId}
          onClick={() => setSelectedSlotId(slot.slotId)}
          className={`rounded-2xl border p-4 text-left transition ${selectedSlotId === slot.slotId ? 'border-violet-500 bg-violet-50' : 'border-slate-200 hover:border-violet-200'}`}
        >
          <p className="text-base font-semibold text-slate-900">{slot.slotLabel}</p>
          <p className="mt-1 text-sm text-slate-600">{slot.capacityRemaining} slots left</p>
          <p className="mt-1 text-xs text-slate-500">Cutoff: {new Date(slot.cutoffAt).toLocaleTimeString()}</p>
        </button>
      ))}
    </div>
    <div className="mt-6 flex items-center justify-between">
      <p className="text-sm font-medium text-slate-600">Status: {status}</p>
      <button onClick={reserve} disabled={!selectedSlotId} className="rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white disabled:bg-violet-300">
        Reserve slot
      </button>
    </div>
  </section>
);
