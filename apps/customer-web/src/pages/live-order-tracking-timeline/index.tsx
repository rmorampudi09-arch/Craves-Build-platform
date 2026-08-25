import React from 'react';
import { LiveOrderTrackingTimelineComponent } from '../../components/live-order-tracking-timeline/LiveOrderTrackingTimelineComponent';
import { useLiveOrderTrackingTimeline } from '../../hooks/useLiveOrderTrackingTimeline';

const LiveOrderTrackingTimelinePage = () => {
  const tracking = useLiveOrderTrackingTimeline();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">Live tracking</p>
          <h1 className="text-3xl font-bold">Follow your order in real time</h1>
          <p className="mt-2 text-slate-300">A customer-grade delivery timeline with ETA, partner updates and event-level visibility.</p>
        </header>
        <LiveOrderTrackingTimelineComponent {...tracking} />
      </div>
    </main>
  );
};

export default LiveOrderTrackingTimelinePage;
