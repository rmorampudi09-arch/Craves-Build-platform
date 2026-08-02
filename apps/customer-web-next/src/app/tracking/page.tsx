"use client";

import TrackingPage from "@/screens/OrderTracking/OrderTracking";
import { Suspense } from "react";

export default function TrackingRoute() {
  return <Suspense fallback={<div className="min-h-screen bg-cream p-8 text-center text-sm text-muted-foreground">Loading tracking…</div>}><TrackingPage /></Suspense>;
}
