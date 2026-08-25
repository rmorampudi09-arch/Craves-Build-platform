import React, { useState } from 'react';
import { RealTimeOrderTrackingTimelineComponent } from '../../components/real-time-order-tracking-timeline/RealTimeOrderTrackingTimelineComponent';
import { useRealTimeOrderTrackingTimeline } from '../../hooks/useRealTimeOrderTrackingTimeline';

const TrackingPage = () => {
  const [orderId, setOrderId] = useState('order-demo-001');
  const hook = useRealTimeOrderTrackingTimeline(orderId);
  return (
    <div className="min-h-screen bg-stone-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold text-stone-900">Real-Time Order Tracking Timeline</h1>
        <input className="w-full rounded-xl border p-3" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
        <RealTimeOrderTrackingTimelineComponent {...hook} />
      </div>
    </div>
  );
};

export default TrackingPage;
