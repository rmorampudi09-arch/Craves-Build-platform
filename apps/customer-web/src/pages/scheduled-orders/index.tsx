import React from 'react';
import { ScheduledOrdersComponent } from '../../components/scheduled-orders/ScheduledOrdersComponent';
import { useScheduledOrders } from '../../hooks/useScheduledOrders';

const ScheduledOrdersPage = () => {
  const scheduled = useScheduledOrders();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-600">Order planning</p>
          <h1 className="text-3xl font-bold text-slate-900">Schedule your order around chef prep windows</h1>
          <p className="mt-2 text-slate-600">Reserve slots for office lunch, family dinner and next-day homemade meals.</p>
        </header>
        <ScheduledOrdersComponent {...scheduled} />
      </div>
    </main>
  );
};

export default ScheduledOrdersPage;
