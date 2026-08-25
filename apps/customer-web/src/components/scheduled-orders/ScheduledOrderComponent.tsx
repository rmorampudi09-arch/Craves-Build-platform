import React from 'react';
import { useScheduledOrder } from '../../hooks/useScheduledOrder';

export function ScheduledOrderComponent() {
  const { createScheduledOrder, submitting } = useScheduledOrder();
  const [message, setMessage] = React.useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createScheduledOrder({
      customerId: '11111111-1111-1111-1111-111111111111',
      kitchenId: '22222222-2222-2222-2222-222222222222',
      scheduledDate: String(form.get('scheduledDate')),
      slotWindow: String(form.get('slotWindow'))
    });
    setMessage('Scheduled successfully. We will remind you before prep starts.');
  }

  return (
    <div className="min-h-screen bg-amber-50 p-6">
      <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-amber-950">Schedule your order</h1>
        <p className="mt-2 text-amber-800">Perfect for lunch plans, office meals and family dinners.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <input type="date" name="scheduledDate" className="w-full rounded-2xl border px-4 py-3" required />
          <select name="slotWindow" className="w-full rounded-2xl border px-4 py-3" required>
            <option value="12:00 PM - 12:30 PM">12:00 PM - 12:30 PM</option>
            <option value="1:00 PM - 1:30 PM">1:00 PM - 1:30 PM</option>
            <option value="7:30 PM - 8:00 PM">7:30 PM - 8:00 PM</option>
          </select>
          <button disabled={submitting} className="rounded-2xl bg-amber-600 px-5 py-3 font-semibold text-white">
            {submitting ? 'Scheduling...' : 'Confirm scheduled order'}
          </button>
        </form>
        {message && <p className="mt-4 text-green-700">{message}</p>}
      </div>
    </div>
  );
}
