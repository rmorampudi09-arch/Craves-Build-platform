"use client";

import { useMemo, useState } from "react";
import type { NotificationPreference, NotificationPreferenceCategory } from "@/lib/notification-preference-contract";

const labels: Record<NotificationPreferenceCategory, { title: string; description: string }> = {
  ORDER_UPDATES: {
    title: "Order updates",
    description: "Delivery milestones, delays and status changes.",
  },
  PROMOTIONAL: {
    title: "Promotions",
    description: "Offers, launches and kitchen campaigns.",
  },
  REMINDERS: {
    title: "Reminders",
    description: "Scheduled order reminders and meal nudges.",
  },
  LOYALTY: {
    title: "Loyalty",
    description: "Coins, rewards and savings activity.",
  },
  CHEF_UPDATES: {
    title: "Chef updates",
    description: "Chef application, menu and availability updates.",
  },
};

type Props = {
  initialPreferences: NotificationPreference[];
};

export function NotificationPreferencesCard({ initialPreferences }: Props) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...preferences].sort((left, right) => left.category.localeCompare(right.category)),
    [preferences],
  );

  async function updatePreference(index: number, field: keyof Pick<NotificationPreference, "inAppEnabled" | "pushEnabled" | "emailEnabled" | "smsEnabled">, value: boolean) {
    const next = ordered.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [field]: value } : item,
    );
    setPreferences(next);
    setBusy(true);
    setError(null);
    const response = await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preferences: next.map((item) => ({
          category: item.category,
          inAppEnabled: item.inAppEnabled,
          pushEnabled: item.pushEnabled,
          emailEnabled: item.emailEnabled,
          smsEnabled: item.smsEnabled,
        })),
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body)) {
      setError(body?.message ?? "Notification preferences could not be updated.");
      setPreferences(ordered);
      setBusy(false);
      return;
    }
    setPreferences(body);
    setBusy(false);
  }

  return (
    <section className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(17,24,39,0.04)] sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-[#1A1A1A] sm:text-xl">Notification preferences</h2>
        <p className="mt-1 text-sm text-[#6B6B6B] sm:text-base">
          Choose how Craves reaches you for each notification category.
        </p>
      </div>
      {error ? <p className="mb-4 text-sm font-medium text-[#F62E18]">{error}</p> : null}
      <div className="space-y-4">
        {ordered.map((preference, index) => {
          const label = labels[preference.category];
          return (
            <div key={preference.id} className="rounded-2xl border border-[#F1F3F5] p-4">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-[#1A1A1A]">{label.title}</h3>
                <p className="mt-1 text-sm text-[#6B6B6B]">{label.description}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["In-app", "inAppEnabled"],
                  ["Push", "pushEnabled"],
                  ["Email", "emailEnabled"],
                  ["SMS", "smsEnabled"],
                ].map(([title, field]) => {
                  const typedField = field as keyof Pick<NotificationPreference, "inAppEnabled" | "pushEnabled" | "emailEnabled" | "smsEnabled">;
                  return (
                    <label key={field} className="flex items-center justify-between rounded-2xl bg-[#FAFAFA] px-4 py-3 text-sm font-medium text-[#1A1A1A]">
                      <span>{title}</span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#F62E18]"
                        checked={preference[typedField]}
                        disabled={busy}
                        onChange={(event) => void updatePreference(index, typedField, event.target.checked)}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
