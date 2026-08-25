import React, { useMemo, useState } from 'react';
import { useScheduledOrdering } from '../../hooks/useScheduledOrdering';

export const ScheduledOrderingComponent: React.FC = () => {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [chefId, setChefId] = useState('101');
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState('');
  const [instructions, setInstructions] = useState('Less oil, extra onions on side');
  const { slots, loading, error, scheduledOrders, loadSlots, createScheduledOrder } = useScheduledOrdering();

  const handleLoadSlots = async () => {
    await loadSlots(chefId, date, 'hyderabad-west');
  };

  const handleSchedule = async () => {
    if (!slot) return;
    await createScheduledOrder({
      chefId: Number(chefId),
      cartId: 501,
      deliveryAddressId: 9001,
      scheduledFor: slot,
      specialInstructions: instructions,
      estimatedTotal: 249
    });
  };

  return (
    <div className="min-h-screen bg-orange-50 p-6 text-slate-900">
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="text-3xl font-bold">Schedule your home-cooked meal</h1>
        <p className="mt-2 text-sm text-slate-600">Reserve lunch and dinner slots from your favourite home chefs.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <input className="rounded-xl border p-3" value={chefId} onChange={(e) => setChefId(e.target.value)} placeholder="Chef ID" />
          <input className="rounded-xl border p-3" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white" onClick={handleLoadSlots}>Check slots</button>
        </div>
        {loading && <p className="mt-4 text-sm">Loading slots…</p>}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          {slots.map((item) => (
            <button
              key={item}
              onClick={() => setSlot(item)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${slot === item ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {new Date(item).toLocaleString()}
            </button>
          ))}
        </div>
        <textarea className="mt-6 w-full rounded-xl border p-3" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        <button className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white" onClick={handleSchedule}>Schedule order</button>
        <div className="mt-10">
          <h2 className="text-xl font-semibold">Upcoming scheduled orders</h2>
          <div className="mt-4 space-y-4">
            {scheduledOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Chef #{order.chefId}</span>
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">{order.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{new Date(order.scheduledFor).toLocaleString()}</p>
                <p className="mt-1 text-sm text-slate-500">Instructions: {order.specialInstructions || 'None'}</p>
                <p className="mt-1 text-sm font-medium">Estimated total: ₹{order.estimatedTotal}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
