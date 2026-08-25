import React, { useMemo, useState } from 'react';
import { ScheduledOrdersTimeSlotCheckoutComponent } from '../../components/scheduled-orders-time-slot-checkout/ScheduledOrdersTimeSlotCheckoutComponent';
import { useScheduledOrdersTimeSlotCheckout } from '../../hooks/useScheduledOrdersTimeSlotCheckout';

const ScheduledOrdersPage = () => {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [chefId, setChefId] = useState('chef-demo-001');
  const [addressId, setAddressId] = useState('address-demo-001');
  const hook = useScheduledOrdersTimeSlotCheckout({ chefId, addressId, date });

  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">Schedule your order</h1>
          <p className="text-stone-600">Reserve a chef slot for lunch, dinner, office meals, or tomorrow’s craving.</p>
        </div>
        <div className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-3">
          <input className="rounded-xl border p-3" value={chefId} onChange={(e) => setChefId(e.target.value)} placeholder="Chef ID" />
          <input className="rounded-xl border p-3" value={addressId} onChange={(e) => setAddressId(e.target.value)} placeholder="Address ID" />
          <input className="rounded-xl border p-3" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <ScheduledOrdersTimeSlotCheckoutComponent {...hook} chefId={chefId} addressId={addressId} date={date} />
      </div>
    </div>
  );
};

export default ScheduledOrdersPage;
