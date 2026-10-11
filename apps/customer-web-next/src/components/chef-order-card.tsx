"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  Bell,
  Bike,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CookingPot,
  PackageCheck,
  Volume2,
  XCircle,
} from "lucide-react";
import { ChefPill, chefOrderStatus, formatInr, timeAgo } from "@/components/chef-ui";
import { ChefOrderActions } from "@/features/chef/components/chef-order-actions";
import { canSpeak, speakOrder } from "@/lib/chef-order-alert";
import { shortOrderNumber } from "@/lib/order-number";
import type { ChefOrder } from "@/features/chef/lib/chef-order-contract";

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
export function orderUpdateText(order: ChefOrder): string {
  const number = `Order #${shortOrderNumber(order.id)}`;
  switch (order.status) {
    case "CHEF_ACCEPTED":
    case "PREPARING":
      return `${number} accepted. Start cooking${order.prepTimeMinutes ? `: ready in about ${order.prepTimeMinutes} min` : ""}.`;
    case "READY_FOR_PICKUP":
      return `${number} is ready for pickup.`;
    case "CHEF_REJECTED":
      return `${number} declined. The customer has been told.`;
    default:
      return `${number} updated.`;
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

/** Always in the page, so screen readers announce each answer; shows the latest one. */
export function OrderUpdateNotice({ id, text }: { id: string; text: string }) {
  return (
    <div id={id} role="status" className="outline-none empty:hidden">
      {text ? (
        <p className="chef-notice">
          <CheckCircle2 aria-hidden="true" />
          <span className="min-w-0">{text}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Reads the order out loud, for chefs who'd rather listen than read. Hidden where the phone can't speak. */
export function HearOrderButton({ order }: { order: ChefOrder }) {
  // Decided after hydration, so the server and the first client render agree.
  const speakable = useSyncExternalStore(noSubscribe, canSpeak, () => false);
  if (!speakable) return null;
  return (
    <button
      type="button"
      onClick={() => speakOrder(order, `Order ${shortOrderNumber(order.id)}`)}
      className="chef-btn is-small is-quiet"
    >
      <Volume2 className="h-4 w-4" aria-hidden="true" />
      Hear order
    </button>
  );
}

const STEPS = [
  { label: "New", icon: Bell },
  { label: "Cooking", icon: CookingPot },
  { label: "Ready", icon: PackageCheck },
  { label: "On the way", icon: Bike },
  { label: "Delivered", icon: CheckCircle2 },
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
  const current = STEP_OF[status];
  if (current === undefined) return null;
  return (
    <ol className="chef-progress" aria-label="Order progress">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const state = index < current ? "done" : index === current ? "now" : "later";
        return (
          <li key={step.label} className={`chef-progress-step is-${state}`} aria-current={state === "now" ? "step" : undefined}>
            <span className="chef-progress-dot">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="chef-progress-label">
              {step.label}
              {state === "done" ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** One order on Home or in Orders: what to cook, big, and the next answer right on the card. */
export function ChefOrderCard({ order, onUpdated }: { order: ChefOrder; onUpdated(order: ChefOrder): void }) {
  const status = chefOrderStatus(order.status);
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
        Order #{shortOrderNumber(order.id)}
        <span className="font-normal text-[#6B6B6B]">
          {" · "}
          {timeAgo(order.createdAt)}
          {order.prepTimeMinutes ? ` · ${order.prepTimeMinutes} min to cook` : ""}
        </span>
      </h3>
      <ul className="chef-order-items" aria-label="Food to cook">
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="chef-order-qty">{item.quantity}×</span>
            <span className="min-w-0">{item.itemName}</span>
          </li>
        ))}
      </ul>
      <div className="chef-order-card-tools">
        <HearOrderButton order={order} />
        <Link href={`/chef/orders/${order.id}`} className="chef-btn is-small is-quiet">
          Address and bill
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <ChefOrderActions order={order} onUpdated={onUpdated} inline />
    </article>
  );
}
