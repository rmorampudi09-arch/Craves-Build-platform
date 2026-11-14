import { AdminOrdersAttention } from "@/features/admin/dashboard/components/admin-orders-attention";

export const metadata = { title: "Orders that need attention | Craves Admin", robots: { index: false, follow: false } };

export default function AdminOrdersPage() {
  return <AdminOrdersAttention />;
}
