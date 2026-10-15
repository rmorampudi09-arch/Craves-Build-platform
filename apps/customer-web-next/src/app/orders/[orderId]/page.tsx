import { notFound } from "next/navigation";
import { isUuid } from "@/shared/lib/server-api";
import { OrderDetailsPage } from "./order-details-page";

export const metadata = {
  title: "Order details | Craves",
  robots: { index: false, follow: false },
};

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!isUuid(orderId)) notFound();
  return <OrderDetailsPage orderId={orderId} />;
}
