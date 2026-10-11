"use client";

import { ContextualBackBoundary } from "@/shared/components/navigation/ContextualBackBoundary";
import NotificationsPage from "@/features/notifications/screens/Notifications";

export default function NotificationsRoutePage() {
  return (
    <ContextualBackBoundary destination="/notifications" fallback="/home">
      <NotificationsPage />
    </ContextualBackBoundary>
  );
}
