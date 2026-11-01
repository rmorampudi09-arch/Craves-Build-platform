import { notFound } from "next/navigation";
import { isUuid } from "@/shared/lib/server-api";
import { OrderDetailsPage } from "./order-details-page";

export const metadata = {
  title: "Order details | Craves",
  robots: { index: false, follow: false },
};

export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ paid?: string | string[] }>;
}) {
  const [{ orderId }, { paid }] = await Promise.all([params, searchParams]);
  if (!isUuid(orderId)) notFound();
  // Checkout adds ?paid=1 once it has verified the payment; it only changes what the page says.
  return <OrderDetailsPage orderId={orderId} justPaid={paid === "1"} />;
}
