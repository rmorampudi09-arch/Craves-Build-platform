import { redirect } from "next/navigation";
import { isUuid } from "@/features/orders/lib/delivery-status";

// One post-order screen: old /confirmation?id= links land on the order's status page,
// where checkout itself sends customers after payment.
export default async function ConfirmationRoute({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const { id } = await searchParams;
  const orderId = typeof id === "string" ? id.trim() : "";
  redirect(isUuid(orderId) ? `/orders/${orderId}` : "/orders");
}
