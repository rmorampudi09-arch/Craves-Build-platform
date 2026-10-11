"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { BellRing, ChevronRight } from "lucide-react";
import { isChefModeVerified } from "@/lib/chef-mode";
import { orderWords, useChefOrderPolling } from "@/lib/chef-order-alert";
import type { ChefOrder } from "@/features/chef/lib/chef-order-contract";
import { shortOrderNumber } from "@/lib/order-number";
import { getSession, subscribeSession } from "@/features/auth/api/cravesAuth";

const waitingOrders = (orders: ChefOrder[]) => orders.filter((order) => order.status === "CHEF_ACCEPTANCE_PENDING");

/**
 * On every chef page: says a new order out loud to screen readers, and on pages that don't
 * list orders (Menu, Earnings, More, another order…) shows an "Answer now" bar.
 */
export function ChefOrderWatcher() {
  const pathname = usePathname();
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const chef = Boolean(user?.roles.some((role) => role.toUpperCase() === "CHEF")) && isChefModeVerified(user?.id);
  const enabled = chef && pathname !== "/chef/sign-in" && !pathname.startsWith("/chef/application");
  // Home and Orders show waiting orders as cards and load the list themselves.
  const listsOrders = pathname === "/chef" || pathname === "/chef/orders";
  const [waiting, setWaiting] = useState<ChefOrder[]>([]);
  const [announcement, setAnnouncement] = useState("");

  useChefOrderPolling(
    enabled,
    (orders, fresh) => {
      setWaiting(waitingOrders(orders));
      if (fresh.length > 0) {
        setAnnouncement(orderWords(fresh[0]!, `New order ${shortOrderNumber(fresh[0]!.id)}${fresh.length > 1 ? `, and ${fresh.length - 1} more` : ""}`));
      }
    },
    { checkNow: !listsOrders },
  );

  if (!enabled) return null;
  // On an order's own page, only other waiting orders need the bar.
  const others = listsOrders ? [] : waiting.filter((order) => !pathname.endsWith(order.id));
  const only = others.length === 1 ? others[0] : null;
  return (
    <>
      <p className="sr-only" role="status">{announcement}</p>
      {others.length > 0 ? (
        <div className="chef-order-banner-wrap">
          <Link href={only ? `/chef/orders/${only.id}` : "/chef"} className="chef-order-banner">
            <BellRing className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{only ? "New order waiting" : `${others.length} new orders waiting`}</span>
            <span className="chef-order-banner-cta">
              Answer now
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        </div>
      ) : null}
    </>
  );
}
