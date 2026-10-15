"use client";

import { ChefError, chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
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
} from "@/features/chef/components/chef-ui";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { ChefOrderActions } from "@/features/chef/components/chef-order-actions";
import { ChefOrderProgress, CustomerNote, HearOrderButton, chefStatusIcon } from "@/features/chef/components/chef-order-card";
import { useChefOrderPolling } from "@/features/chef/lib/chef-order-alert";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import {
  parseChefOrderResponse,
  type ChefOrder,
} from "@/features/chef/lib/chef-order-contract";
import { ChefLoading } from "@/features/chef/components/chef-loading";

const FOOD_TYPE: Record<string, string> = { VEG: "Veg", NON_VEG: "Non-veg", EGG: "Egg" };
/** Orders on the normal path show the picture steps; declined or refunded ones don't. */
const PROGRESS_STATES = {
  CHEF_ACCEPTANCE_PENDING: true,
  CHEF_ACCEPTED: true,
  PREPARING: true,
  READY_FOR_PICKUP: true,
  OUT_FOR_DELIVERY: true,
  DELIVERED: true,
};

function itemMetadata(item: ChefOrder["items"][number]): string {
  return [item.category, item.foodType ? FOOD_TYPE[item.foodType] ?? item.foodType : null]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

export function ChefOrderDetails({ orderId }: { orderId: string }) {
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
          ? "This order isn’t available for your kitchen."
          : "We couldn’t load this order right now.");
      }
      const parsed = parseChefOrderResponse(body);
      if (!parsed || parsed.id.toLowerCase() !== orderId.toLowerCase()) {
        throw new ChefError("We couldn’t read this order. Please refresh it.", "INVALID_CHEF_ORDER_RESPONSE", response.status);
      }
      setOrder(parsed);
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(chefErrorText(caught, "We couldn’t load this order right now."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The order moves on by itself (picked up, delivered): keep it current without a refresh.
  useChefOrderPolling(Boolean(order), (orders) => {
    const fresh = orders.find((candidate) => candidate.id.toLowerCase() === orderId.toLowerCase());
    if (!fresh) return;
    setOrder((current) =>
      current && Date.parse(current.updatedAt) > Date.parse(fresh.updatedAt) ? current : fresh,
    );
    setLastUpdatedAt(new Date());
  });

  if (loading) return <ChefLoading shape="order" label="Loading chef order" />;

  if (!order) {
    return (
      <div>
        <ChefPageHead back={{ href: "/chef/orders", label: "Orders" }} title="Order" />
        <ChefSection>
          <ChefEmpty
            icon={AlertTriangle}
            title="This order couldn’t open"
            text={error}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => void load()} className="chef-btn is-primary">Try again</button>
                <Link href="/chef/orders" className="chef-btn">Back to orders</Link>
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
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const status = chefOrderStatus(order.status);
  const currency = { currency: order.currency };

  return (
    <div>
      <ChefPageHead
        back={{ href: "/chef/orders", label: "Orders" }}
        title={`Order #${shortOrderNumber(order.id)}`}
        action={
          <Link href={`/chef/support?orderId=${order.id}`} className="chef-btn">
            <LifeBuoy className="h-4 w-4" aria-hidden="true" />
            Get help
          </Link>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ChefPill tone={status.tone} icon={chefStatusIcon(order.status)}>{status.label}</ChefPill>
            <span>Placed {dateTime(order.createdAt)}{order.prepTimeMinutes ? ` · ${order.prepTimeMinutes} min prep` : ""}</span>
          </span>
        }
      />

      <div className="chef-stack">
        {order.status in PROGRESS_STATES ? (
          <section className="chef-section px-2 py-4" aria-label="Where this order is">
            <ChefOrderProgress status={order.status} />
          </section>
        ) : null}
        <ChefSection
          title={`${itemCount} item${itemCount === 1 ? "" : "s"} to cook`}
          flush
          labelledBy="chef-order-items"
          action={<span className="chef-amount text-[0.9375rem] font-bold">{formatInr(order.foodSubtotal, currency)}</span>}
        >
          <ul className="chef-list border-t border-[#E3E6EA]">
            {order.items.map((item) => {
              const metadata = itemMetadata(item);
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
          {order.customerNote ? (
            <div className="border-t border-[#E3E6EA] px-4 py-3 md:px-5">
              <CustomerNote note={order.customerNote} />
            </div>
          ) : null}
          <div className="border-t border-[#E3E6EA] px-4 py-3 empty:hidden md:px-5">
            <HearOrderButton order={order} />
          </div>
        </ChefSection>

        <ChefOrderActions order={order} onUpdated={setOrder} />

        {order.deliveryAddress && address ? (
          <ChefSection title="Delivery" labelledBy="chef-order-delivery">
            <p className="font-semibold text-[#1A1A1A]">{order.deliveryAddress.recipientName}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={`tel:${phone}`} className="chef-btn is-small">
                <Phone className="h-4 w-4" aria-hidden="true" />
                Call {order.deliveryAddress.contactPhoneNumber}
              </a>
              <a href={`sms:${phone}`} className="chef-btn is-small">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Message customer
              </a>
            </div>
            <p className="mt-2 flex gap-2 text-[0.9375rem] leading-6 text-[#6B6B6B]"><MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{address}</p>
          </ChefSection>
        ) : null}

        <details className="chef-section group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold text-[#1A1A1A] md:px-5 [&::-webkit-details-marker]:hidden">
            Customer’s bill
            <ChevronDown className="h-5 w-5 text-[#6B6B6B] transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <dl className="space-y-2.5 border-t border-[#E3E6EA] px-4 py-4 text-[0.9375rem] md:px-5">
            <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Food</dt><dd className="chef-amount font-semibold">{formatInr(order.foodSubtotal, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Platform fee</dt><dd className="chef-amount font-semibold">{formatInr(order.platformFee, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Tax</dt><dd className="chef-amount font-semibold">{formatInr(order.taxAmount, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#6B6B6B]">Delivery</dt><dd className="chef-amount font-semibold">{formatInr(order.deliveryFee, currency)}</dd></div>
            <div className="flex justify-between gap-3 border-t border-[#E3E6EA] pt-2.5"><dt className="font-semibold">Customer paid</dt><dd className="chef-amount font-bold">{formatInr(order.grandTotal, currency)}</dd></div>
            <p className="pt-1 text-[0.8125rem] leading-5 text-[#6B6B6B]">This is what the customer paid, not your earning. Your earning for this order appears in Earnings once it is delivered.</p>
          </dl>
        </details>

        <div className="flex flex-col items-center gap-2 pt-1">
          <button type="button" disabled={refreshing} onClick={() => void load(true)} className="chef-btn is-small" aria-busy={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            Refresh order
          </button>
          {lastUpdatedAt ? <p className="text-[0.8125rem] text-[#6B6B6B]">Updated {lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase()}</p> : null}
        </div>
        {error ? <ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice> : null}
      </div>
    </div>
  );
}

export default ChefOrderDetails;
