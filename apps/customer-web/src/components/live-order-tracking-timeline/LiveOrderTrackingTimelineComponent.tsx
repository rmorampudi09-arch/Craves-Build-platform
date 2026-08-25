import React from 'react';

type TimelineEvent = { status: string; label: string; occurredAt: string; completed: boolean };

type Props = {
  currentStatus: string;
  etaMinutes: number;
  deliveryPartner: string;
  mapUrl: string;
  timeline: TimelineEvent[];
};

export const LiveOrderTrackingTimelineComponent = ({ currentStatus, etaMinutes, deliveryPartner, mapUrl, timeline }: Props) => (
  <section className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
    <div className="rounded-3xl bg-slate-900 p-6 ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-cyan-300">Current status</p>
          <h2 className="text-2xl font-semibold">{currentStatus.replaceAll('_', ' ')}</h2>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-400">ETA</p>
          <p className="text-2xl font-bold text-cyan-300">{etaMinutes} mins</p>
        </div>
      </div>
      <ol className="mt-8 space-y-4">
        {timeline.map((event) => (
          <li key={event.status} className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className={`mt-1 h-3 w-3 rounded-full ${event.completed ? 'bg-cyan-300' : 'bg-slate-600'}`} />
            <div>
              <p className="font-semibold text-white">{event.label}</p>
              <p className="text-sm text-slate-400">{new Date(event.occurredAt).toLocaleString()}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
    <aside className="rounded-3xl bg-slate-900 p-6 ring-1 ring-white/10">
      <h3 className="text-lg font-semibold">Delivery details</h3>
      <p className="mt-3 text-sm text-slate-300">Provider: {deliveryPartner}</p>
      <a href={mapUrl} className="mt-6 inline-flex rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">
        Open tracking map
      </a>
      <div className="mt-6 rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
        <p>Timeline states are normalized across chef prep, pickup and Shiprocket status updates.</p>
      </div>
    </aside>
  </section>
);
