"use client";

import { ChefError, chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock3,
  LifeBuoy,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
} from "lucide-react";
import {
  ChefEmpty,
  ChefNotice,
  ChefPageHead,
  ChefPill,
  ChefSection,
  chefOrderStatus,
  dateTime,
  formatInr,
  isUnpaidOrder,
  needsCustomerContact,
} from "@/features/chef/components/chef-ui";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { ChefOrderActions } from "@/features/chef/components/chef-order-actions";
import { CustomerNote, HearOrderButton, chefStatusIcon } from "@/features/chef/components/chef-order-card";
import { useChefOrderPolling } from "@/features/chef/lib/chef-order-alert";
import { chefOrderTimeline } from "@/features/chef/lib/chef-order-timeline";
import { sessionFetch } from "@/shared/lib/session-fetch";
import {
  parseChefOrderResponse,
  type ChefOrder,
} from "@/features/chef/lib/chef-order-contract";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import { format, messages, type Language } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    unavailable: "This order isn’t available for your kitchen.", loadFailed: "We couldn’t load this order right now.", readFailed: "We couldn’t read this order. Please refresh it.",
    loading: "Loading chef order", orders: "Orders", order: "Order", openFailed: "This order couldn’t open", tryAgain: "Try again", backToOrders: "Back to orders",
    orderNumber: "Order #{number}", getHelp: "Get help", placed: "Placed {date}", minPrep: "{minutes} min prep", whereItIs: "Where this order is",
    unpaid: "The customer hasn’t paid yet. Nothing to cook now. If they pay, it rings as a new order.",
    toCookOne: "{count} item to cook", toCookMany: "{count} items to cook", delivery: "Delivery", call: "Call {phone}", message: "Message customer",
    bill: "Customer’s bill", food: "Food", platformFee: "Platform fee", tax: "Tax", customerPaid: "Customer paid", orderTotal: "Order total",
    billNote: "This is what the customer paid, not your earning. Your earning for this order appears in Earnings once it is delivered.",
    refreshOrder: "Refresh order", updated: "Updated {time}", openMap: "Open in Google Maps", done: "done",
  },
  te: {
    unavailable: "ఈ ఆర్డర్ మీ వంటగదికి అందుబాటులో లేదు.", loadFailed: "ఇప్పుడు ఈ ఆర్డర్ లోడ్ చేయలేకపోయాం.", readFailed: "ఈ ఆర్డర్ చదవలేకపోయాం. దయచేసి మళ్లీ చూడండి.",
    loading: "ఆర్డర్ లోడ్ అవుతోంది", orders: "ఆర్డర్లు", order: "ఆర్డర్", openFailed: "ఈ ఆర్డర్ తెరుచుకోలేదు", tryAgain: "మళ్లీ ప్రయత్నించండి", backToOrders: "ఆర్డర్లకు వెనక్కి వెళ్లండి",
    orderNumber: "ఆర్డర్ #{number}", getHelp: "సహాయం పొందండి", placed: "ఆర్డర్ చేసిన సమయం: {date}", minPrep: "వంటకు {minutes} నిమి", whereItIs: "ఈ ఆర్డర్ ఎక్కడ ఉంది",
    unpaid: "కస్టమర్ ఇంకా చెల్లించలేదు. ఇప్పుడు వండాల్సింది ఏమీ లేదు. వాళ్లు చెల్లిస్తే, కొత్త ఆర్డర్‌గా మోగుతుంది.",
    toCookOne: "వండాల్సినవి: {count} ఐటమ్", toCookMany: "వండాల్సినవి: {count} ఐటమ్‌లు", delivery: "డెలివరీ", call: "{phone} కి కాల్ చేయండి", message: "కస్టమర్‌కు మెసేజ్ చేయండి",
    bill: "కస్టమర్ బిల్లు", food: "ఆహారం", platformFee: "ప్లాట్‌ఫామ్ ఫీజు", tax: "పన్ను", customerPaid: "కస్టమర్ చెల్లించినది", orderTotal: "ఆర్డర్ మొత్తం",
    billNote: "ఇది కస్టమర్ చెల్లించిన మొత్తం, మీ సంపాదన కాదు. ఈ ఆర్డర్ డెలివరీ అయిన తర్వాత మీ సంపాదన 'సంపాదన'లో కనిపిస్తుంది.",
    refreshOrder: "ఆర్డర్ మళ్లీ చూడండి", updated: "{time} కి అప్‌డేట్ అయింది", openMap: "Google Maps లో తెరవండి", done: "పూర్తయింది",
  },
  kn: {
    unavailable: "ಈ ಆರ್ಡರ್ ನಿಮ್ಮ ಅಡುಗೆಮನೆಗೆ ಲಭ್ಯವಿಲ್ಲ.", loadFailed: "ಈಗ ಈ ಆರ್ಡರ್ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.", readFailed: "ಈ ಆರ್ಡರ್ ಓದಲಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ನೋಡಿ.",
    loading: "ಆರ್ಡರ್ ಲೋಡ್ ಆಗುತ್ತಿದೆ", orders: "ಆರ್ಡರ್‌ಗಳು", order: "ಆರ್ಡರ್", openFailed: "ಈ ಆರ್ಡರ್ ತೆರೆಯಲಿಲ್ಲ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", backToOrders: "ಆರ್ಡರ್‌ಗಳಿಗೆ ಹಿಂತಿರುಗಿ",
    orderNumber: "ಆರ್ಡರ್ #{number}", getHelp: "ಸಹಾಯ ಪಡೆಯಿರಿ", placed: "ಆರ್ಡರ್ ಮಾಡಿದ ಸಮಯ: {date}", minPrep: "ಅಡುಗೆಗೆ {minutes} ನಿಮಿ", whereItIs: "ಈ ಆರ್ಡರ್ ಎಲ್ಲಿದೆ",
    unpaid: "ಗ್ರಾಹಕರು ಇನ್ನೂ ಪಾವತಿಸಿಲ್ಲ. ಈಗ ಅಡುಗೆ ಮಾಡಬೇಕಾದ್ದು ಏನೂ ಇಲ್ಲ. ಅವರು ಪಾವತಿಸಿದರೆ, ಹೊಸ ಆರ್ಡರ್ ಆಗಿ ರಿಂಗ್ ಆಗುತ್ತದೆ.",
    toCookOne: "ಅಡುಗೆ ಮಾಡಬೇಕಾದ್ದು: {count} ಐಟಮ್", toCookMany: "ಅಡುಗೆ ಮಾಡಬೇಕಾದ್ದು: {count} ಐಟಮ್‌ಗಳು", delivery: "ಡೆಲಿವರಿ", call: "{phone} ಗೆ ಕರೆ ಮಾಡಿ", message: "ಗ್ರಾಹಕರಿಗೆ ಮೆಸೇಜ್ ಮಾಡಿ",
    bill: "ಗ್ರಾಹಕರ ಬಿಲ್", food: "ಆಹಾರ", platformFee: "ಪ್ಲಾಟ್‌ಫಾರ್ಮ್ ಶುಲ್ಕ", tax: "ತೆರಿಗೆ", customerPaid: "ಗ್ರಾಹಕರು ಪಾವತಿಸಿದ್ದು", orderTotal: "ಆರ್ಡರ್ ಒಟ್ಟು",
    billNote: "ಇದು ಗ್ರಾಹಕರು ಪಾವತಿಸಿದ ಮೊತ್ತ, ನಿಮ್ಮ ಗಳಿಕೆ ಅಲ್ಲ. ಈ ಆರ್ಡರ್ ಡೆಲಿವರಿ ಆದ ನಂತರ ನಿಮ್ಮ ಗಳಿಕೆ 'ಗಳಿಕೆ'ಯಲ್ಲಿ ಕಾಣುತ್ತದೆ.",
    refreshOrder: "ಆರ್ಡರ್ ಮತ್ತೆ ನೋಡಿ", updated: "{time} ಕ್ಕೆ ಅಪ್‌ಡೇಟ್ ಆಗಿದೆ", openMap: "Google Maps ನಲ್ಲಿ ತೆರೆಯಿರಿ", done: "ಮುಗಿದಿದೆ",
  },
});

const FOOD_TYPE = messages({
  en: { VEG: "Veg", NON_VEG: "Non-veg", EGG: "Egg" },
  te: { VEG: "వెజ్", NON_VEG: "నాన్-వెజ్", EGG: "ఎగ్" },
  kn: { VEG: "ವೆಜ್", NON_VEG: "ನಾನ್-ವೆಜ್", EGG: "ಎಗ್" },
});
/** Steps with their times, done ones ticked green, the current one dark (app Status card). */
function OrderTimeline({ order }: { order: ChefOrder }) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const steps = chefOrderTimeline(order, language);
  return (
    <ol className="grid">
      {steps.map((step, index) => (
        <li key={index} className="relative flex gap-3 pb-4 last:pb-0" aria-current={step.state === "now" ? "step" : undefined}>
          {index < steps.length - 1 ? (
            <span aria-hidden="true" className={`absolute bottom-0 left-[11px] top-7 w-0.5 rounded-full ${step.state === "done" ? "bg-[#17803D]" : "bg-[#E3E6EA]"}`} />
          ) : null}
          <span
            aria-hidden="true"
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ${step.state === "done" ? "bg-[#17803D]" : step.state === "now" ? "bg-[#1A1A1A]" : "border-2 border-[#D3D7DD] bg-white"}`}
          >
            {step.state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
          </span>
          <span className="min-w-0 pt-0.5">
            <span className={`block font-semibold leading-5 ${step.state === "todo" ? "text-[#6B6B6B]" : "text-[#1A1A1A]"}`}>
              {step.label}
              {step.state === "done" ? <span className="sr-only"> ({text.done})</span> : null}
            </span>
            {step.detail ? <span className="mt-0.5 block text-[0.875rem] text-[#6B6B6B]">{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function itemMetadata(item: ChefOrder["items"][number], language: Language = "en"): string {
  const foodTypes: Record<string, string> = FOOD_TYPE[language];
  return [item.category, item.foodType ? foodTypes[item.foodType] ?? item.foodType : null]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

export function ChefOrderDetails({ orderId }: { orderId: string }) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [order, setOrder] = useState<ChefOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await sessionFetch(`/api/chef/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw chefApiError(response, body, response.status === 404 || response.status === 403
          ? text.unavailable
          : text.loadFailed);
      }
      const parsed = parseChefOrderResponse(body);
      if (!parsed || parsed.id.toLowerCase() !== orderId.toLowerCase()) {
        throw new ChefError(text.readFailed, "INVALID_CHEF_ORDER_RESPONSE", response.status);
      }
      setOrder(parsed);
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(chefErrorText(caught, text.loadFailed));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, text]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only this page's own read carries the status history; a newer copy from the list or an answer keeps it.
  const withHistory = (fresh: ChefOrder, current: ChefOrder | null): ChefOrder => ({ ...fresh, statusHistory: fresh.statusHistory ?? current?.statusHistory });

  // The order moves on by itself (picked up, delivered): keep it current without a refresh.
  useChefOrderPolling(Boolean(order), (orders) => {
    const fresh = orders.find((candidate) => candidate.id.toLowerCase() === orderId.toLowerCase());
    if (!fresh) return;
    setOrder((current) =>
      current && Date.parse(current.updatedAt) > Date.parse(fresh.updatedAt) ? current : withHistory(fresh, current),
    );
    setLastUpdatedAt(new Date());
  });

  if (loading) return <ChefLoading shape="order" label={text.loading} />;

  if (!order) {
    return (
      <div>
        <ChefPageHead back={{ href: "/chef/orders", label: text.orders }} title={text.order} />
        <ChefSection>
          <ChefEmpty
            icon={AlertTriangle}
            title={text.openFailed}
            text={error}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => void load()} className="chef-btn is-primary">{text.tryAgain}</button>
                <Link href="/chef/orders" className="chef-btn">{text.backToOrders}</Link>
              </div>
            }
          />
        </ChefSection>
      </div>
    );
  }

  const address = order.deliveryAddress
    ? [
        order.deliveryAddress.addressLine1,
        order.deliveryAddress.addressLine2,
        order.deliveryAddress.landmark,
        order.deliveryAddress.areaName,
        order.deliveryAddress.city,
        order.deliveryAddress.state,
        order.deliveryAddress.postalCode,
      ]
        .filter(Boolean)
        .join(", ")
    : null;
  const phone = order.deliveryAddress?.contactPhoneNumber.replace(/[^\d+]/g, "");
  const pin = order.deliveryAddress?.latitude != null && order.deliveryAddress.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${order.deliveryAddress.latitude},${order.deliveryAddress.longitude}`
    : null;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const status = chefOrderStatus(order.status, language);
  const currency = { currency: order.currency };
  // Not paid yet: nothing to cook, and the customer's contact details stay private until they pay.
  const unpaid = isUnpaidOrder(order.status);
  // A new order's page is its question; a finished one's is its story, so the steps lead; otherwise they follow the work.
  const timeline = unpaid || order.status === "CHEF_ACCEPTANCE_PENDING" ? null : (
    <ChefSection title={text.whereItIs} labelledBy="chef-order-status">
      <OrderTimeline order={order} />
    </ChefSection>
  );
  const finished = ["OUT_FOR_DELIVERY", "DELIVERED", "CHEF_REJECTED", "CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_FAILED"].includes(order.status);

  return (
    <div>
      <ChefPageHead
        back={{ href: "/chef/orders", label: text.orders }}
        title={format(text.orderNumber, { number: shortOrderNumber(order.id) })}
        action={
          <Link href={`/chef/support?orderId=${order.id}`} className="chef-btn">
            <LifeBuoy className="h-4 w-4" aria-hidden="true" />
            {text.getHelp}
          </Link>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ChefPill tone={status.tone} icon={chefStatusIcon(order.status)}>{status.label}</ChefPill>
            <span>{format(text.placed, { date: dateTime(order.createdAt) })}{order.prepTimeMinutes ? ` · ${format(text.minPrep, { minutes: order.prepTimeMinutes })}` : ""}</span>
          </span>
        }
      />

      <div className="chef-stack">
        {unpaid ? <ChefNotice icon={Clock3}>{text.unpaid}</ChefNotice> : null}
        {finished ? timeline : null}
        <ChefSection
          title={format(itemCount === 1 ? text.toCookOne : text.toCookMany, { count: itemCount })}
          flush
          labelledBy="chef-order-items"
          action={<span className="chef-amount text-[0.9375rem] font-bold">{formatInr(order.foodSubtotal, currency)}</span>}
        >
          <ul className="chef-list border-t border-[#E3E6EA]">
            {order.items.map((item) => {
              const metadata = itemMetadata(item, language);
              return (
                <li key={item.id} className="chef-row items-start">
                  <span className="chef-amount grid h-9 min-w-9 shrink-0 place-items-center rounded-xl bg-[#F1F3F5] px-2 text-[0.9375rem] font-bold text-[#1A1A1A]">{item.quantity}×</span>
                  <span className="chef-row-main">
                    <span className="chef-row-title block text-base">{item.itemName}</span>
                    {metadata ? <span className="chef-row-meta block">{metadata}</span> : null}
                  </span>
                  <span className="chef-row-value chef-amount text-[0.9375rem] font-semibold">{formatInr(item.lineTotal, currency)}</span>
                </li>
              );
            })}
          </ul>
          {order.customerNote && !unpaid ? (
            <div className="border-t border-[#E3E6EA] px-4 py-3 md:px-5">
              <CustomerNote note={order.customerNote} />
            </div>
          ) : null}
          <div className="border-t border-[#E3E6EA] px-4 py-3 empty:hidden md:px-5">
            <HearOrderButton order={order} />
          </div>
        </ChefSection>

        {unpaid ? null : <ChefOrderActions order={order} onUpdated={(next) => setOrder((current) => withHistory(next, current))} />}

        {order.deliveryAddress && address && needsCustomerContact(order.status) ? (
          <ChefSection title={text.delivery} labelledBy="chef-order-delivery">
            <p className="font-semibold text-[#1A1A1A]">{order.deliveryAddress.recipientName}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={`tel:${phone}`} className="chef-btn is-small">
                <Phone className="h-4 w-4" aria-hidden="true" />
                {format(text.call, { phone: order.deliveryAddress.contactPhoneNumber })}
              </a>
              <a href={`sms:${phone}`} className="chef-btn is-small">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                {text.message}
              </a>
            </div>
            {pin ? (
              // The pin the customer dropped, in Google Maps (its app on a phone).
              <a href={pin} target="_blank" rel="noopener noreferrer" className="mt-2 flex min-h-11 gap-2 rounded-xl text-[0.9375rem] leading-6 text-[#1A1A1A] no-underline">
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-[#D92714]" aria-hidden="true" />
                <span className="min-w-0">
                  {address}
                  <span className="mt-0.5 block font-semibold text-[#D92714] underline underline-offset-2">{text.openMap}</span>
                </span>
              </a>
            ) : (
              <p className="mt-2 flex gap-2 text-[0.9375rem] leading-6 text-[#6B6B6B]"><MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{address}</p>
            )}
          </ChefSection>
        ) : null}

        {finished ? null : timeline}

        <details className="chef-section group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold text-[#1A1A1A] md:px-5 [&::-webkit-details-marker]:hidden">
            {text.bill}
            <ChevronDown className="h-5 w-5 text-[#6B6B6B] transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <dl className="space-y-2.5 border-t border-[#E3E6EA] px-4 py-4 text-[0.9375rem] md:px-5">
            <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">{text.food}</dt><dd className="chef-amount font-semibold">{formatInr(order.foodSubtotal, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">{text.platformFee}</dt><dd className="chef-amount font-semibold">{formatInr(order.platformFee, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">{text.tax}</dt><dd className="chef-amount font-semibold">{formatInr(order.taxAmount, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">{text.delivery}</dt><dd className="chef-amount font-semibold">{formatInr(order.deliveryFee, currency)}</dd></div>
            <div className="flex justify-between gap-3 border-t border-[#E3E6EA] pt-2.5"><dt className="font-semibold">{isUnpaidOrder(order.status) ? text.orderTotal : text.customerPaid}</dt><dd className="chef-amount font-bold">{formatInr(order.grandTotal, currency)}</dd></div>
            <p className="pt-1 text-[0.8125rem] leading-5 text-[#6B6B6B]">{text.billNote}</p>
          </dl>
        </details>

        <div className="flex flex-col items-center gap-2 pt-1">
          <button type="button" disabled={refreshing} onClick={() => void load(true)} className="chef-btn is-small" aria-busy={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            {text.refreshOrder}
          </button>
          {lastUpdatedAt ? <p className="text-[0.8125rem] text-[#6B6B6B]">{format(text.updated, { time: lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase() })}</p> : null}
        </div>
        {error ? <ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice> : null}
      </div>
    </div>
  );
}

export default ChefOrderDetails;
