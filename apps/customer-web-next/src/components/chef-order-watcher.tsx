"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, ChevronRight } from "lucide-react";
import { isChefModeVerified } from "@/lib/chef-mode";
import { fetchChefOrders, noticeNewOrders, useChefOrderPolling } from "@/lib/chef-order-alert";
import type { ChefOrder } from "@/lib/chef-order-contract";
import { getSession, subscribeSession } from "@/services/auth/cravesAuth";

const waitingOrders = (orders: ChefOrder[]) => orders.filter((order) => order.status === "CHEF_ACCEPTANCE_PENDING");

/**
 * Keeps ringing and shows an "answer now" bar on chef pages that don't list orders (Menu,
 * Earnings, More…). Home, Orders and an order's own page check orders themselves.
 */
export function ChefOrderWatcher() {
  const pathname = usePathname();
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const chef = Boolean(user?.roles.some((role) => role.toUpperCase() === "CHEF")) && isChefModeVerified(user?.id);
  const enabled =
    chef &&
    pathname !== "/chef" &&
    !pathname.startsWith("/chef/orders") &&
    pathname !== "/chef/sign-in" &&
    !pathname.startsWith("/chef/application");
  const [waiting, setWaiting] = useState<ChefOrder[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    void fetchChefOrders().then((orders) => {
      if (stopped || !orders) return;
      noticeNewOrders(orders);
      setWaiting(waitingOrders(orders));
    });
    return () => {
      stopped = true;
      setWaiting([]);
    };
  }, [enabled]);
  useChefOrderPolling(enabled, (orders) => setWaiting(waitingOrders(orders)));

  if (!enabled) return null;
  const only = waiting.length === 1 ? waiting[0] : null;
  return (
    <div className="chef-order-banner-wrap" aria-live="polite">
      {waiting.length > 0 ? (
        <Link href={only ? `/chef/orders/${only.id}` : "/chef"} className="chef-order-banner">
          <BellRing className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{only ? "New order waiting" : `${waiting.length} new orders waiting`}</span>
          <span className="chef-order-banner-cta">
            Answer now
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
      ) : null}
    </div>
  );
}
