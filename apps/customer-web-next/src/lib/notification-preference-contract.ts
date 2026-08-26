export type NotificationPreferenceCategory =
  | "ORDER_UPDATES"
  | "PROMOTIONAL"
  | "REMINDERS"
  | "LOYALTY"
  | "CHEF_UPDATES";

export type NotificationPreference = {
  id: string;
  recipientIdentityId: string;
  userRole: string | null;
  category: NotificationPreferenceCategory;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  updatedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories: NotificationPreferenceCategory[] = [
  "ORDER_UPDATES",
  "PROMOTIONAL",
  "REMINDERS",
  "LOYALTY",
  "CHEF_UPDATES",
];

function isInstant(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isPreference(value: unknown): value is NotificationPreference {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    UUID.test(item.id) &&
    typeof item.recipientIdentityId === "string" &&
    UUID.test(item.recipientIdentityId) &&
    (typeof item.userRole === "string" || item.userRole === null) &&
    typeof item.category === "string" &&
    categories.includes(item.category as NotificationPreferenceCategory) &&
    typeof item.inAppEnabled === "boolean" &&
    typeof item.pushEnabled === "boolean" &&
    typeof item.emailEnabled === "boolean" &&
    typeof item.smsEnabled === "boolean" &&
    isInstant(item.updatedAt)
  );
}

export function parseNotificationPreferences(value: unknown): NotificationPreference[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  return value.every(isPreference) ? (value as NotificationPreference[]) : null;
}
