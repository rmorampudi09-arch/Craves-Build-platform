"use client";

import { Suspense } from "react";
import TrackingPage from "@/screens/OrderTracking/OrderTracking";

function TrackingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="text-center" role="status">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#E5E7EB] border-t-[#F62E18]" />
        <p className="mt-4 text-sm font-medium text-[#6B6B6B]">
          Loading order tracking…
        </p>
      </div>
    </main>
  );
}

export default function TrackingRoute() {
  return (
    <Suspense fallback={<TrackingFallback />}>
      <TrackingPage />
    </Suspense>
  );
}
