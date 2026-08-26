import { redirect } from "next/navigation";
import { NotificationPreferencesCard } from "@/components/notifications/NotificationPreferencesCard";
import { parseNotificationPreferences } from "@/lib/notification-preference-contract";
import { apiBaseUrl } from "@/lib/server-api";
import { cookies } from "next/headers";

async function loadPreferences() {
  const token = cookies().get("craves_access_token")?.value;
  if (!token) {
    redirect("/sign-in");
  }
  const response = await fetch(`${apiBaseUrl()}/notifications/preferences`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (response.status === 401) {
    redirect("/sign-in");
  }
  if (!response.ok) {
    throw new Error("Notification preferences could not be loaded.");
  }
  const body = await response.json().catch(() => null);
  const preferences = parseNotificationPreferences(body);
  if (!preferences) {
    throw new Error("Notification preferences response validation failed.");
  }
  return preferences;
}

export default async function NotificationPreferencesPage() {
  const preferences = await loadPreferences();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl bg-[#FCFCFD] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#F62E18]">Notifications</p>
        <h1 className="mt-2 text-3xl font-bold text-[#1A1A1A]">Preferences center</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#6B6B6B] sm:text-base">
          Manage order updates, promotions, reminders, loyalty activity and chef updates across in-app, push, email and SMS channels.
        </p>
      </div>
      <NotificationPreferencesCard initialPreferences={preferences} />
    </main>
  );
}
