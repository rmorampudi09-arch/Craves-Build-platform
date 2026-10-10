import { redirect } from "next/navigation";
import { isUuid } from "@/lib/delivery-status";

// One tracking screen: old /tracking?id= links land on the order's tracking page.
export default async function TrackingRoute({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const { id } = await searchParams;
  const orderId = typeof id === "string" ? id.trim() : "";
  redirect(isUuid(orderId) ? `/orders/${orderId}/tracking` : "/orders");
}
