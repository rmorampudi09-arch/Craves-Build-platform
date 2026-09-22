"use client";

import { ContextualBackBoundary } from "@/components/navigation/ContextualBackBoundary";
import NotificationsPage from "@/screens/Notifications/Notifications";

export default function NotificationsRoutePage() {
  return (
    <ContextualBackBoundary destination="/notifications" fallback="/home">
      <NotificationsPage />
    </ContextualBackBoundary>
  );
}
