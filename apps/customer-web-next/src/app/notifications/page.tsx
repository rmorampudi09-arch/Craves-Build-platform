"use client";
import { BottomNav } from "@/components/layout/BottomNav";
import NotificationsPage from "@/screens/Notifications/Notifications";
export default function NotificationsRoutePage() {
  return (
    <div className="pb-20 md:pb-0">
      <NotificationsPage />
      <BottomNav />
    </div>
  );
}
