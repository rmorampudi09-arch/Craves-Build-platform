import { shortOrderNumber } from "../../../shared/lib/order-number.ts";
import { format, messages, type Language } from "../../../shared/i18n/language.ts";
import type { ChefOrder } from "./chef-order-contract.ts";

export type CountdownTone = "danger" | "warning" | "success";
/** detail: a second line, such as the time the chef promised. */
export type Countdown = { label: string; tone: CountdownTone; fill: number | null; detail?: string };

/** "12:40 pm" in India time, as chef pages show times. */
export function indiaClock(at: string | number): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(date).toLowerCase();
}

const WORDS = messages({
  en: {
    respondIn: "Respond in {time}", respondPassed: "Time to respond has passed", late: "{minutes} min late", readyIn: "Ready in {minutes} min", promised: "You promised {time}",
    refund: "The customer is told right away and gets a full refund.",
    mealPlan: "The customer is told right away. This meal-plan day moves to the end of their plan.",
    arriving: "Arriving in {minutes} min", hereNow: "Should be here now",
  },
  te: {
    respondIn: "{time} లో జవాబు ఇవ్వండి", respondPassed: "జవాబు ఇచ్చే సమయం అయిపోయింది", late: "{minutes} నిమి ఆలస్యం", readyIn: "సిద్ధం కావడానికి {minutes} నిమి", promised: "మీరు {time} కి ఇస్తానన్నారు",
    refund: "కస్టమర్‌కు వెంటనే తెలుస్తుంది, మొత్తం డబ్బు తిరిగి వస్తుంది.",
    mealPlan: "కస్టమర్‌కు వెంటనే తెలుస్తుంది. ఈ మీల్ ప్లాన్ రోజు వారి ప్లాన్ చివరికి జరుగుతుంది.",
    arriving: "{minutes} నిమిషాల్లో వస్తారు", hereNow: "ఈపాటికి వచ్చి ఉండాలి",
  },
  kn: {
    respondIn: "{time} ಒಳಗೆ ಉತ್ತರಿಸಿ", respondPassed: "ಉತ್ತರಿಸುವ ಸಮಯ ಮುಗಿದಿದೆ", late: "{minutes} ನಿಮಿ ತಡ", readyIn: "ಸಿದ್ಧವಾಗಲು {minutes} ನಿಮಿ", promised: "ನೀವು {time} ಕ್ಕೆ ಕೊಡುತ್ತೇನೆ ಎಂದಿದ್ದೀರಿ",
    refund: "ಗ್ರಾಹಕರಿಗೆ ತಕ್ಷಣ ತಿಳಿಸಲಾಗುತ್ತದೆ, ಪೂರ್ತಿ ಹಣ ಹಿಂದಿರುಗಿಸಲಾಗುತ್ತದೆ.",
    mealPlan: "ಗ್ರಾಹಕರಿಗೆ ತಕ್ಷಣ ತಿಳಿಸಲಾಗುತ್ತದೆ. ಈ ಮೀಲ್ ಪ್ಲಾನ್ ದಿನ ಅವರ ಪ್ಲಾನ್‌ನ ಕೊನೆಗೆ ಹೋಗುತ್ತದೆ.",
    arriving: "{minutes} ನಿಮಿಷದಲ್ಲಿ ಬರುತ್ತಾರೆ", hereNow: "ಈಗಾಗಲೇ ಬಂದಿರಬೇಕು",
  },
});

/** "Respond in 4:32" with a bar that empties towards the deadline: red under 5 minutes, amber under 10 (as the app). */
export function respondCountdown(
  order: Pick<ChefOrder, "createdAt"> & { chefAcceptanceExpiresAt: string },
  now: number,
  language: Language = "en",
): Countdown {
  const deadline = Date.parse(order.chefAcceptanceExpiresAt);
  const remaining = Math.max(0, deadline - now);
  if (remaining === 0) return { label: WORDS[language].respondPassed, tone: "danger", fill: null };
  const total = deadline - Date.parse(order.createdAt);
  const seconds = Math.floor(remaining / 1000);
  return {
    label: format(WORDS[language].respondIn, { time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` }),
    tone: remaining < 5 * 60_000 ? "danger" : remaining < 10 * 60_000 ? "warning" : "success",
    fill: total > 0 ? Math.min(1, remaining / total) : null,
  };
}

/**
 * "Ready in 8 min · You promised 12:40 pm", then "5 min late". It counts from when the chef accepted: the status history's
 * time when the order page has it, else the order's last update (as the app).
 */
export function prepCountdown(order: Pick<ChefOrder, "status" | "prepTimeMinutes" | "updatedAt" | "statusHistory">, now: number, language: Language = "en"): Countdown | null {
  if ((order.status !== "CHEF_ACCEPTED" && order.status !== "PREPARING") || !order.prepTimeMinutes) return null;
  const started = Date.parse(order.statusHistory?.find((entry) => entry.status === "CHEF_ACCEPTED" || entry.status === "PREPARING")?.at ?? order.updatedAt);
  if (Number.isNaN(started)) return null;
  const due = started + order.prepTimeMinutes * 60_000;
  const detail = format(WORDS[language].promised, { time: indiaClock(due) });
  return now > due
    ? { label: format(WORDS[language].late, { minutes: Math.max(1, Math.round((now - due) / 60_000)) }), tone: "danger", fill: 1, detail }
    : { label: format(WORDS[language].readyIn, { minutes: Math.max(1, Math.ceil((due - now) / 60_000)) }), tone: "success", fill: Math.max(0, now - started) / (due - started), detail };
}

export const DEFAULT_PREP_MINUTES = 15;

/** Minutes the one-tap Accept promises: the time the order already holds, else its slowest dish, else 15 (as the app). */
export function acceptReadyMinutes(
  order: Pick<ChefOrder, "prepTimeMinutes" | "items">,
  dishes: readonly { id: string; itemName: string; preparationTimeMinutes: number | null }[],
): number {
  if (order.prepTimeMinutes != null) return order.prepTimeMinutes;
  const byId = new Map(dishes.map((dish) => [dish.id, dish.preparationTimeMinutes]));
  const byName = new Map(dishes.map((dish) => [dish.itemName.trim().toLowerCase(), dish.preparationTimeMinutes]));
  const minutes = order.items.map((item) => byId.get(item.menuItemId) ?? byName.get(item.itemName.trim().toLowerCase()) ?? DEFAULT_PREP_MINUTES);
  // The accept route takes 1 to 1,440 minutes.
  return Math.min(1_440, minutes.length ? Math.max(...minutes) : DEFAULT_PREP_MINUTES);
}

/** What declining means for the customer: a paid order has a checkout; a meal-plan day has none, so nothing is refunded. */
export function declineConsequence(order: Pick<ChefOrder, "checkoutId">, language: Language = "en"): string {
  return order.checkoutId ? WORDS[language].refund : WORDS[language].mealPlan;
}

/** Why the courier didn't collect an order: the chef reads it in their language, support gets the English. */
export const NOT_PICKED_UP_REASONS = messages({
  en: { notArrived: "Partner hasn’t arrived yet", leftWithout: "Partner left without the order", askedCancel: "Partner asked me to cancel", other: "Something else" },
  te: { notArrived: "డెలివరీ వ్యక్తి ఇంకా రాలేదు", leftWithout: "డెలివరీ వ్యక్తి ఆర్డర్ తీసుకోకుండానే వెళ్లిపోయారు", askedCancel: "డెలివరీ వ్యక్తి రద్దు చేయమన్నారు", other: "ఇంకేదో కారణం" },
  kn: { notArrived: "ಡೆಲಿವರಿ ವ್ಯಕ್ತಿ ಇನ್ನೂ ಬಂದಿಲ್ಲ", leftWithout: "ಡೆಲಿವರಿ ವ್ಯಕ್ತಿ ಆರ್ಡರ್ ತೆಗೆದುಕೊಳ್ಳದೆ ಹೋದರು", askedCancel: "ಡೆಲಿವರಿ ವ್ಯಕ್ತಿ ರದ್ದುಮಾಡಲು ಹೇಳಿದರು", other: "ಬೇರೆ ಕಾರಣ" },
});

/** The support ticket for an order the courier has not collected, with the order attached (as the app). */
export function notPickedUpCase(orderId: string, reason: string, note: string) {
  const details = note.trim();
  return {
    contextRole: "CHEF" as const,
    orderId,
    subject: `Not picked up · #${shortOrderNumber(orderId)}`,
    message: details ? `${reason}\n\n${details}` : reason,
  };
}

/** "Priya S.": the first name and the last initial, as the app's order cards; never the full name. */
export function shortCustomerName(fullName: string | null | undefined): string | null {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

/** "Arriving in 6 min", "Should be here now", or null without a pickup time. */
export function pickupEtaLabel(pickupEtaAt: string | null, now: number, language: Language = "en"): string | null {
  const eta = pickupEtaAt ? Date.parse(pickupEtaAt) : NaN;
  if (Number.isNaN(eta)) return null;
  const minutes = Math.ceil((eta - now) / 60_000);
  return minutes > 0 ? format(WORDS[language].arriving, { minutes }) : WORDS[language].hereNow;
}
