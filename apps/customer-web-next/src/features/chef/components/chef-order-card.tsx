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
import { ChefFlash, ChefNotice, ChefPill, chefOrderStatus, formatInr, needsCustomerContact, timeAgo } from "@/features/chef/components/chef-ui";
import { ChefOrderActions } from "@/features/chef/components/chef-order-actions";
import { canSpeak, speakOrder } from "@/features/chef/lib/chef-order-alert";
import { shortCustomerName } from "@/features/chef/lib/chef-order-presentation";
import { shortOrderNumber } from "@/shared/lib/order-number";
import type { ChefOrder } from "@/features/chef/lib/chef-order-contract";
import { format, messages, type Language } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    orderNumber: "Order #{number}", accepted: "Order #{number} accepted. Start cooking.", acceptedReadyIn: "Order #{number} accepted. Start cooking: ready in about {minutes} min.",
    handedOver: "Order #{number} marked as handed over.", ready: "Order #{number} is ready for pickup.", declined: "Order #{number} declined. The customer has been told.", updated: "Order #{number} updated.",
    hear: "Hear order", customerNote: "Customer’s note",
    minToCook: "{minutes} min to cook", foodToCook: "Food to cook", addressAndBill: "Address and bill",
    VEG: "Veg", NON_VEG: "Non-veg", EGG: "Egg",
  },
  te: {
    orderNumber: "ఆర్డర్ #{number}", accepted: "ఆర్డర్ #{number} ఒప్పుకున్నారు. వంట మొదలుపెట్టండి.", acceptedReadyIn: "ఆర్డర్ #{number} ఒప్పుకున్నారు. వంట మొదలుపెట్టండి: సుమారు {minutes} నిమిషాల్లో సిద్ధం.",
    handedOver: "ఆర్డర్ #{number} అప్పగించినట్టు గుర్తించాం.", ready: "ఆర్డర్ #{number} తీసుకెళ్లడానికి సిద్ధం.", declined: "ఆర్డర్ #{number} తిరస్కరించారు. కస్టమర్‌కు చెప్పాం.", updated: "ఆర్డర్ #{number} అప్‌డేట్ అయింది.",
    hear: "ఆర్డర్ వినండి", customerNote: "కస్టమర్ నోట్",
    minToCook: "వంటకు {minutes} నిమి", foodToCook: "వండాల్సిన ఆహారం", addressAndBill: "చిరునామా, బిల్లు",
    VEG: "వెజ్", NON_VEG: "నాన్-వెజ్", EGG: "ఎగ్",
  },
  kn: {
    orderNumber: "ಆರ್ಡರ್ #{number}", accepted: "ಆರ್ಡರ್ #{number} ಒಪ್ಪಿಕೊಂಡಿದ್ದೀರಿ. ಅಡುಗೆ ಶುರುಮಾಡಿ.", acceptedReadyIn: "ಆರ್ಡರ್ #{number} ಒಪ್ಪಿಕೊಂಡಿದ್ದೀರಿ. ಅಡುಗೆ ಶುರುಮಾಡಿ: ಸುಮಾರು {minutes} ನಿಮಿಷದಲ್ಲಿ ಸಿದ್ಧ.",
    handedOver: "ಆರ್ಡರ್ #{number} ಹಸ್ತಾಂತರಿಸಿದೆ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ.", ready: "ಆರ್ಡರ್ #{number} ತೆಗೆದುಕೊಂಡು ಹೋಗಲು ಸಿದ್ಧ.", declined: "ಆರ್ಡರ್ #{number} ತಿರಸ್ಕರಿಸಲಾಗಿದೆ. ಗ್ರಾಹಕರಿಗೆ ತಿಳಿಸಲಾಗಿದೆ.", updated: "ಆರ್ಡರ್ #{number} ಅಪ್‌ಡೇಟ್ ಆಗಿದೆ.",
    hear: "ಆರ್ಡರ್ ಕೇಳಿ", customerNote: "ಗ್ರಾಹಕರ ಟಿಪ್ಪಣಿ",
    minToCook: "ಅಡುಗೆಗೆ {minutes} ನಿಮಿ", foodToCook: "ಅಡುಗೆ ಮಾಡಬೇಕಾದ ಆಹಾರ", addressAndBill: "ವಿಳಾಸ, ಬಿಲ್",
    VEG: "ವೆಜ್", NON_VEG: "ನಾನ್-ವೆಜ್", EGG: "ಎಗ್",
  },
});

// Dark enough to read on white (3:1 for a mark): green, red, and amber for egg.
const FOOD_MARK = { VEG: "#2E7D32", NON_VEG: "#D92D20", EGG: "#B45309" } as const;

/** The veg / non-veg / egg square: a dot, or a triangle for non-veg, read out as its word. Unknown types show nothing. */
export function FoodTypeMark({ type }: { type: string | null }) {
  const words = useText(TEXT);
  if (!type || !Object.prototype.hasOwnProperty.call(FOOD_MARK, type)) return null;
  const key = type as keyof typeof FOOD_MARK;
  const color = FOOD_MARK[key];
  return (
    <span role="img" aria-label={words[key]} className="grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border-[1.5px] bg-white" style={{ borderColor: color }}>
      {key === "NON_VEG" ? (
        <span className="h-0 w-0 border-x-4 border-b-[7px] border-x-transparent" style={{ borderBottomColor: color }} />
      ) : (
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      )}
    </span>
  );
}

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
  // "Priya S. · Madhapur · 5 min ago": who and where, never the full name, address or phone on a card.
  const address = needsCustomerContact(order.status) ? order.deliveryAddress : null;
  const who = [
    shortCustomerName(address?.recipientName),
    address ? (address.areaName ?? address.city) : null,
    timeAgo(order.createdAt, undefined, language),
    order.prepTimeMinutes ? format(text.minToCook, { minutes: order.prepTimeMinutes }) : null,
  ].filter(Boolean).join(" · ");
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
        <span className="block font-normal text-[#6B6B6B]">{who}</span>
      </h3>
      <ul className="chef-order-items" aria-label={text.foodToCook}>
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="chef-order-qty">{item.quantity}×</span>
            <FoodTypeMark type={item.foodType} />
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
