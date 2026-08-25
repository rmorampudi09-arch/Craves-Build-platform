import React from 'react';
import { useLiveOrderTrackingTimeline } from '../../hooks/useLiveOrderTrackingTimeline';

export function LiveOrderTrackingTimelineComponent() {
  const events = useLiveOrderTrackingTimeline('33333333-3333-3333-3333-333333333333');

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">Live order tracking</h1>
        <p className="mt-2 text-slate-600">Track every step from chef acceptance to doorstep delivery.</p>
        <ol className="mt-8 space-y-4 border-l-2 border-orange-200 pl-6">
          {events.map((event) => (
            <li key={`${event.status}-${event.eventTime}`} className="relative">
              <span className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-orange-500" />
              <p className="font-semibold text-slate-900">{event.status}</p>
              <p className="text-slate-600">{event.message}</p>
              <p className="text-sm text-slate-400">{new Date(event.eventTime).toLocaleString()}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
