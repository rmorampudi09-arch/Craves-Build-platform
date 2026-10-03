import { notFound } from "next/navigation";
import { CustomerOrderStatus } from "@/components/order/CustomerOrderStatus";
import { isUuid } from "@/lib/server-api";

export const metadata = {
  title: "Order status | Craves",
  robots: { index: false, follow: false },
};

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!isUuid(orderId)) notFound();
  return <CustomerOrderStatus orderId={orderId} />;
}
