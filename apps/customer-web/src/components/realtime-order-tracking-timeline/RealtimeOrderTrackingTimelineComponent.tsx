import React, { useEffect } from 'react';
import { useRealtimeOrderTrackingTimeline } from '../../hooks/useRealtimeOrderTrackingTimeline';

export const RealtimeOrderTrackingTimelineComponent: React.FC = () => {
  const { timeline, loading, error, loadTimeline } = useRealtimeOrderTrackingTimeline();

  useEffect(() => {
    loadTimeline(88001);
  }, [loadTimeline]);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl bg-slate-900 p-8 shadow-2xl">
        <h1 className="text-3xl font-bold">Live order timeline</h1>
        <p className="mt-2 text-sm text-slate-300">Track each handoff from chef confirmation to delivery.</p>
        {loading && <p className="mt-6 text-sm text-slate-400">Refreshing live status…</p>}
        {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
        <div className="mt-8 space-y-5">
          {timeline.map((event, index) => (
            <div key={event.id} className="relative rounded-2xl border border-slate-700 bg-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-orange-300">{event.status}</p>
                  <h2 className="text-lg font-semibold">{event.title}</h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${event.live ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                  {event.live ? 'Live' : 'Completed'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{event.description}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>{new Date(event.occurredAt).toLocaleString()}</span>
                <span>Updated by {event.actor}</span>
              </div>
              {index < timeline.length - 1 && <div className="absolute left-8 top-full h-5 border-l border-dashed border-slate-600" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
