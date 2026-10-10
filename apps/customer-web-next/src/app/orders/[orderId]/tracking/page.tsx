import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TrackingPage from "@/screens/OrderTracking/OrderTracking";
import { isUuid } from "@/lib/delivery-status";

export const metadata: Metadata = {
  title: "Track order | Craves",
  robots: { index: false, follow: false },
};

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!isUuid(orderId)) notFound();
  return <TrackingPage orderId={orderId} />;
}
