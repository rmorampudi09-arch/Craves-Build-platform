import React from 'react';

type Event = { id: string; status: string; description: string; source: string; occurredAt: string; };

type Props = { events: Event[]; loading: boolean; error: string | null; };

export const RealTimeOrderTrackingTimelineComponent = ({ events, loading, error }: Props) => (
  <div className="rounded-2xl bg-white p-6 shadow-sm">
    {error && <div className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="space-y-4">
      {loading ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-stone-200" />) : events.map((event) => (
        <div key={event.id} className="flex gap-4 rounded-xl border border-stone-200 p-4">
          <div className="mt-1 h-3 w-3 rounded-full bg-amber-500" />
          <div>
            <p className="font-semibold text-stone-900">{event.status}</p>
            <p className="text-sm text-stone-600">{event.description}</p>
            <p className="mt-1 text-xs text-stone-500">{event.source} • {new Date(event.occurredAt).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);
