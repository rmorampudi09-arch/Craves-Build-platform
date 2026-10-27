// The order page's Status steps with their times, as the app builds them (app chefOrders/domain/chefOrderTimeline.ts).
import { format, messages, type Language } from "../../../shared/i18n/language.ts";
import type { ChefOrder, ChefOrderStatus } from "./chef-order-contract.ts";
import { indiaClock } from "./chef-order-presentation.ts";

export type ChefTimelineStep = { label: string; state: "done" | "now" | "todo"; detail?: string };

// Where an order is from placed (0) to delivered (4). Rejected, cancelled and refunded orders stop the line instead.
const PROGRESS: Partial<Record<ChefOrderStatus, number>> = {
  PAYMENT_PENDING: 0, PAID: 0, CHEF_ACCEPTANCE_PENDING: 0, CHEF_ACCEPTED: 1, PREPARING: 1, READY_FOR_PICKUP: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4,
};

const WORDS = messages({
  en: {
    placed: "Order placed", accepted: "You accepted", cooking: "Cooking", acceptedTodo: "Accepted", markedReady: "Marked ready", ready: "Ready for pickup",
    pickedUpBy: "Picked up by {name}", pickedUp: "Picked up", onTheWay: "On the way", delivered: "Delivered",
    rejected: "You rejected the order", cancelled: "Order cancelled", readyIn: "ready in {minutes} min",
  },
  te: {
    placed: "ఆర్డర్ వచ్చింది", accepted: "మీరు ఒప్పుకున్నారు", cooking: "వంట అవుతోంది", acceptedTodo: "ఒప్పుకోవడం", markedReady: "సిద్ధం అని గుర్తించారు", ready: "తీసుకెళ్లడానికి సిద్ధం",
    pickedUpBy: "{name} తీసుకెళ్లారు", pickedUp: "తీసుకెళ్లారు", onTheWay: "దారిలో ఉంది", delivered: "డెలివరీ అయింది",
    rejected: "మీరు ఆర్డర్ తిరస్కరించారు", cancelled: "ఆర్డర్ రద్దయింది", readyIn: "{minutes} నిమిషాల్లో సిద్ధం",
  },
  kn: {
    placed: "ಆರ್ಡರ್ ಬಂತು", accepted: "ನೀವು ಒಪ್ಪಿಕೊಂಡಿರಿ", cooking: "ಅಡುಗೆ ಆಗುತ್ತಿದೆ", acceptedTodo: "ಒಪ್ಪಿಗೆ", markedReady: "ಸಿದ್ಧ ಎಂದು ಗುರುತಿಸಿದಿರಿ", ready: "ತೆಗೆದುಕೊಂಡು ಹೋಗಲು ಸಿದ್ಧ",
    pickedUpBy: "{name} ತೆಗೆದುಕೊಂಡು ಹೋದರು", pickedUp: "ತೆಗೆದುಕೊಂಡು ಹೋದರು", onTheWay: "ದಾರಿಯಲ್ಲಿದೆ", delivered: "ಡೆಲಿವರಿ ಆಗಿದೆ",
    rejected: "ನೀವು ಆರ್ಡರ್ ತಿರಸ್ಕರಿಸಿದಿರಿ", cancelled: "ಆರ್ಡರ್ ರದ್ದಾಗಿದೆ", readyIn: "{minutes} ನಿಮಿಷದಲ್ಲಿ ಸಿದ್ಧ",
  },
});

const joined = (parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ") || undefined;

/**
 * "Order placed 12:02", "You accepted 12:04 · ready in 20 min", "Marked ready", "Picked up by Ravi". Times come from the
 * status history when the order page has it; without it only the placed time and the current step's (the order's last
 * change) are known, so no other step shows one.
 */
export function chefOrderTimeline(
  order: Pick<ChefOrder, "status" | "createdAt" | "updatedAt" | "prepTimeMinutes" | "deliveryPartner" | "statusHistory">,
  language: Language = "en",
): ChefTimelineStep[] {
  const words = WORDS[language];
  const history = order.statusHistory ?? [];
  const at = (...statuses: ChefOrderStatus[]) => history.find((entry) => statuses.includes(entry.status))?.at;
  const clock = (iso: string | undefined) => (iso ? indiaClock(iso) || undefined : undefined);
  const placedAt = at("CHEF_ACCEPTANCE_PENDING") ?? order.createdAt;
  const progress = PROGRESS[order.status];

  if (progress === undefined) {
    // Rejected, cancelled or refunded: the line stops where the order did.
    return [
      { label: words.placed, state: "done", detail: clock(placedAt) },
      { label: order.status === "CHEF_REJECTED" ? words.rejected : words.cancelled, state: "done", detail: clock(at(order.status) ?? order.updatedAt) },
    ];
  }

  const partner = order.deliveryPartner?.name;
  const steps = [
    { done: words.placed, now: words.placed, todo: words.placed, at: placedAt },
    { done: words.accepted, now: words.cooking, todo: words.acceptedTodo, at: at("CHEF_ACCEPTED", "PREPARING"), extra: order.prepTimeMinutes ? format(words.readyIn, { minutes: order.prepTimeMinutes }) : undefined },
    { done: words.markedReady, now: words.ready, todo: words.ready, at: at("READY_FOR_PICKUP") },
    { done: partner ? format(words.pickedUpBy, { name: partner }) : words.pickedUp, now: words.onTheWay, todo: words.onTheWay, at: at("OUT_FOR_DELIVERY") },
    { done: words.delivered, now: words.delivered, todo: words.delivered, at: at("DELIVERED") },
  ];

  return steps.map((step, index): ChefTimelineStep => {
    // A delivered order is the end of the line, so every step reads as done rather than "now".
    const state = index < progress || progress === 4 ? "done" : index === progress ? "now" : "todo";
    if (state === "todo") return { label: step.todo, state };
    // The current step may have no time of its own: it last changed when the order did.
    const time = step.at ?? (index === progress && index > 0 ? order.updatedAt : undefined);
    return { label: state === "done" ? step.done : step.now, state, detail: joined([clock(time), step.extra]) };
  });
}
