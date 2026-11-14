import { AdminToday } from "@/features/admin/dashboard/components/admin-today";

export const metadata = { title: "Today | Craves Admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminToday />;
}
