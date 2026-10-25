"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  Bell,
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CookingPot,
  MessageSquareText,
  PackageCheck,
  Volume2,
  XCircle,
} from "lucide-react";
import { ChefFlash, ChefNotice, ChefPill, chefOrderStatus, formatInr, timeAgo } from "@/features/chef/components/chef-ui";
import { ChefOrderActions } from "@/features/chef/components/chef-order-actions";
import { canSpeak, speakOrder } from "@/features/chef/lib/chef-order-alert";
import { shortOrderNumber } from "@/shared/lib/order-number";
import type { ChefOrder } from "@/features/chef/lib/chef-order-contract";
import { format, messages, type Language } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    orderNumber: "Order #{number}", accepted: "Order #{number} accepted. Start cooking.", acceptedReadyIn: "Order #{number} accepted. Start cooking: ready in about {minutes} min.",
    handedOver: "Order #{number} marked as handed over.", ready: "Order #{number} is ready for pickup.", declined: "Order #{number} declined. The customer has been told.", updated: "Order #{number} updated.",
    hear: "Hear order", progress: "Order progress", done: "done", customerNote: "Customer’s note",
    stepNew: "New", stepCooking: "Cooking", stepReady: "Ready", stepOnTheWay: "On the way", stepDelivered: "Delivered",
    minToCook: "{minutes} min to cook", foodToCook: "Food to cook", addressAndBill: "Address and bill",
  },
  te: {
    orderNumber: "ఆర్డర్ #{number}", accepted: "ఆర్డర్ #{number} ఒప్పుకున్నారు. వంట మొదలుపెట్టండి.", acceptedReadyIn: "ఆర్డర్ #{number} ఒప్పుకున్నారు. వంట మొదలుపెట్టండి: సుమారు {minutes} నిమిషాల్లో సిద్ధం.",
    handedOver: "ఆర్డర్ #{number} అప్పగించినట్టు గుర్తించాం.", ready: "ఆర్డర్ #{number} తీసుకెళ్లడానికి సిద్ధం.", declined: "ఆర్డర్ #{number} తిరస్కరించారు. కస్టమర్‌కు చెప్పాం.", updated: "ఆర్డర్ #{number} అప్‌డేట్ అయింది.",
    hear: "ఆర్డర్ వినండి", progress: "ఆర్డర్ ఎక్కడ ఉంది", done: "పూర్తయింది", customerNote: "కస్టమర్ నోట్",
    stepNew: "కొత్తది", stepCooking: "వంట అవుతోంది", stepReady: "సిద్ధం", stepOnTheWay: "దారిలో ఉంది", stepDelivered: "డెలివరీ అయింది",
    minToCook: "వంటకు {minutes} నిమి", foodToCook: "వండాల్సిన ఆహారం", addressAndBill: "చిరునామా, బిల్లు",
  },
  kn: {
    orderNumber: "ಆರ್ಡರ್ #{number}", accepted: "ಆರ್ಡರ್ #{number} ಒಪ್ಪಿಕೊಂಡಿದ್ದೀರಿ. ಅಡುಗೆ ಶುರುಮಾಡಿ.", acceptedReadyIn: "ಆರ್ಡರ್ #{number} ಒಪ್ಪಿಕೊಂಡಿದ್ದೀರಿ. ಅಡುಗೆ ಶುರುಮಾಡಿ: ಸುಮಾರು {minutes} ನಿಮಿಷದಲ್ಲಿ ಸಿದ್ಧ.",
    handedOver: "ಆರ್ಡರ್ #{number} ಹಸ್ತಾಂತರಿಸಿದೆ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ.", ready: "ಆರ್ಡರ್ #{number} ತೆಗೆದುಕೊಂಡು ಹೋಗಲು ಸಿದ್ಧ.", declined: "ಆರ್ಡರ್ #{number} ತಿರಸ್ಕರಿಸಲಾಗಿದೆ. ಗ್ರಾಹಕರಿಗೆ ತಿಳಿಸಲಾಗಿದೆ.", updated: "ಆರ್ಡರ್ #{number} ಅಪ್‌ಡೇಟ್ ಆಗಿದೆ.",
    hear: "ಆರ್ಡರ್ ಕೇಳಿ", progress: "ಆರ್ಡರ್ ಎಲ್ಲಿದೆ", done: "ಮುಗಿದಿದೆ", customerNote: "ಗ್ರಾಹಕರ ಟಿಪ್ಪಣಿ",
    stepNew: "ಹೊಸದು", stepCooking: "ಅಡುಗೆ ಆಗುತ್ತಿದೆ", stepReady: "ಸಿದ್ಧ", stepOnTheWay: "ದಾರಿಯಲ್ಲಿದೆ", stepDelivered: "ಡೆಲಿವರಿ ಆಗಿದೆ",
    minToCook: "ಅಡುಗೆಗೆ {minutes} ನಿಮಿ", foodToCook: "ಅಡುಗೆ ಮಾಡಬೇಕಾದ ಆಹಾರ", addressAndBill: "ವಿಳಾಸ, ಬಿಲ್",
  },
});

/** A picture for every order state, so the state reads without the words. */
export function chefStatusIcon(status: string) {
  switch (status) {
    case "CHEF_ACCEPTANCE_PENDING":
      return Bell;
    case "CHEF_ACCEPTED":
    case "PREPARING":
      return CookingPot;
    case "READY_FOR_PICKUP":
      return PackageCheck;
    case "OUT_FOR_DELIVERY":
      return Bike;
    case "DELIVERED":
      return CheckCircle2;
    case "CHEF_REJECTED":
    case "CANCELLED":
      return XCircle;
    default:
      return Clock3;
  }
}

const noSubscribe = () => () => {};

/** What the chef hears and sees after answering: the card itself may move or leave the list. */
export function orderUpdateText(order: ChefOrder, language: Language = "en"): string {
  const words = TEXT[language];
  const values = { number: shortOrderNumber(order.id), minutes: order.prepTimeMinutes ?? 0 };
  switch (order.status) {
    case "CHEF_ACCEPTED":
    case "PREPARING":
      return format(order.prepTimeMinutes ? words.acceptedReadyIn : words.accepted, values);
    case "READY_FOR_PICKUP":
      return format(order.chefHandedOverAt ? words.handedOver : words.ready, values);
    case "CHEF_REJECTED":
      return format(words.declined, values);
    default:
      return format(words.updated, values);
  }
}

/** Focus follows the order to its new place, or lands on the update notice when it left the list. */
export function focusOrderAfterUpdate(orderId: string, noticeId: string): void {
  window.requestAnimationFrame(() => {
    const target = document.getElementById(`chef-order-${orderId}`) ?? document.getElementById(noticeId);
    if (!target) return;
    target.setAttribute("tabindex", "-1");
    target.focus();
  });
}

/** Always in the page, so screen readers announce each answer; the latest shows for a moment. */
export function OrderUpdateNotice({ id, text }: { id: string; text: string }) {
  const [closed, setClosed] = useState("");
  return <ChefFlash id={id} message={text === closed ? "" : text} onClose={() => setClosed(text)} />;
}

/** Reads the order out loud, for chefs who'd rather listen than read. Hidden where the phone can't speak. */
export function HearOrderButton({ order }: { order: ChefOrder }) {
  // Decided after hydration, so the server and the first client render agree.
  const speakable = useSyncExternalStore(noSubscribe, canSpeak, () => false);
  const label = useText(TEXT).hear;
  if (!speakable) return null;
  return (
    <button
      type="button"
      onClick={() => speakOrder(order, { number: shortOrderNumber(order.id) })}
      className="chef-btn is-small is-quiet"
    >
      <Volume2 className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

const STEPS = [
  { key: "stepNew", icon: Bell },
  { key: "stepCooking", icon: CookingPot },
  { key: "stepReady", icon: PackageCheck },
  { key: "stepOnTheWay", icon: Bike },
  { key: "stepDelivered", icon: CheckCircle2 },
] as const;

const STEP_OF: Record<string, number> = {
  CHEF_ACCEPTANCE_PENDING: 0,
  CHEF_ACCEPTED: 1,
  PREPARING: 1,
  READY_FOR_PICKUP: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
};

/** Where the order is, as five picture steps. Declined, cancelled and refunded orders show none. */
export function ChefOrderProgress({ status }: { status: string }) {
  const text = useText(TEXT);
  const current = STEP_OF[status];
  if (current === undefined) return null;
  return (
    <ol className="chef-progress" aria-label={text.progress}>
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const state = index < current ? "done" : index === current ? "now" : "later";
        return (
          <li key={step.key} className={`chef-progress-step is-${state}`} aria-current={state === "now" ? "step" : undefined}>
            <span className="chef-progress-dot">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="chef-progress-label">
              {text[step.key]}
              {state === "done" ? <span className="sr-only"> ({text.done})</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** What the customer wrote at checkout, in their words. */
export function CustomerNote({ note }: { note: string }) {
  const label = useText(TEXT).customerNote;
  return (
    <ChefNotice icon={MessageSquareText}>
      <p><span className="sr-only">{label}: </span>“{note}”</p>
    </ChefNotice>
  );
}

/** One order on Home or in Orders: what to cook, big, and the next answer right on the card. */
export function ChefOrderCard({ order, onUpdated }: { order: ChefOrder; onUpdated(order: ChefOrder): void }) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const status = chefOrderStatus(order.status, language);
  const headingId = `chef-order-${order.id}`;
  return (
    <article
      className={`chef-order-card${order.status === "CHEF_ACCEPTANCE_PENDING" ? " is-new" : ""}`}
      aria-labelledby={headingId}
    >
      <div className="chef-order-card-head">
        <ChefPill tone={status.tone} icon={chefStatusIcon(order.status)}>
          {status.label}
        </ChefPill>
        <span className="chef-amount ml-auto text-[1.0625rem] font-bold">
          {formatInr(order.foodSubtotal, { currency: order.currency })}
        </span>
      </div>
      <h3 id={headingId} className="chef-order-card-title">
        {format(text.orderNumber, { number: shortOrderNumber(order.id) })}
        <span className="font-normal text-[#6B6B6B]">
          {" · "}
          {timeAgo(order.createdAt, undefined, language)}
          {order.prepTimeMinutes ? ` · ${format(text.minToCook, { minutes: order.prepTimeMinutes })}` : ""}
        </span>
      </h3>
      <ul className="chef-order-items" aria-label={text.foodToCook}>
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="chef-order-qty">{item.quantity}×</span>
            <span className="min-w-0">{item.itemName}</span>
          </li>
        ))}
      </ul>
      {order.customerNote ? (
        <div className="mt-3">
          <CustomerNote note={order.customerNote} />
        </div>
      ) : null}
      <div className="chef-order-card-tools">
        <HearOrderButton order={order} />
        <Link href={`/chef/orders/${order.id}`} className="chef-btn is-small is-quiet">
          {text.addressAndBill}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <ChefOrderActions order={order} onUpdated={onUpdated} inline />
    </article>
  );
}
