"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ChefHat,
  ChevronRight,
  RefreshCw,
  Store,
  Utensils,
} from "lucide-react";
import {
  ChefEmpty,
  ChefNotice,
  ChefPill,
  ChefSection,
  ChefSkeleton,
  chefOrderStatus,
  formatInr,
  timeAgo,
} from "@/components/chef-ui";
import { shortOrderNumber } from "@/lib/order-number";
import {
  parseChefApplication,
  type ChefApplication,
} from "@/lib/chef-application-contract";
import { parseChefKitchen } from "@/lib/chef-kitchen-contract";
import type { ChefKitchen } from "@/lib/chef-kitchen-types";
import { parseChefMenuItems, type ChefMenuItem } from "@/lib/chef-menu-contract";
import {
  parseChefOrdersResponse,
  type ChefOrder,
} from "@/lib/chef-order-contract";
import {
  parseChefEarnings,
  type ChefEarning,
} from "@/lib/chef-earnings-contract";
import { getSession, subscribeSession } from "@/services/auth/cravesAuth";
import { Sheet, secondaryActionClass } from "@/components/ui/overlays/overlay";

type DashboardState = "loading" | "approved" | "error";

type Snapshot = {
  application: ChefApplication | null;
  kitchen: ChefKitchen | null;
  menu: ChefMenuItem[];
  orders: ChefOrder[];
  earnings: ChefEarning[];
  unavailable: string[];
  /** Why each unavailable part failed, as shown to the chef. */
  details: string[];
};

type PriorityAction = {
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  href?: string;
  refresh?: boolean;
  icon: typeof ChefHat;
};

const EMPTY: Snapshot = {
  application: null,
  kitchen: null,
  menu: [],
  orders: [],
  earnings: [],
  unavailable: [],
  details: [],
};

function isThisWeek(value: string): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - distanceFromMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return date >= start && date < end;
}

export function ChefModeDashboard() {
  const [state, setState] = useState<DashboardState>("loading");
  // ChefAccessBoundary only renders the dashboard for a confirmed, approved chef session.
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [message, setMessage] = useState("Loading your kitchen…");
  const [refreshTick, setRefreshTick] = useState(0);
  const [showApprovalNotice, setShowApprovalNotice] = useState(false);
  const [approvalNoticeKey, setApprovalNoticeKey] = useState("");

  useEffect(() => {
    let active = true;

    async function loadApprovedSnapshot() {
      const kitchenRequest = fetch("/api/chef/kitchen", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const menuRequest = kitchenRequest.then(async response => {
        if (!response.ok) return null;
        const raw = await response.clone().json().catch(() => undefined);
        if (raw === null || !parseChefKitchen(raw)) return null;
        return fetch("/api/chef/menu", { cache: "no-store", credentials: "same-origin" });
      });
      const requests = await Promise.allSettled([
        fetch("/api/chef/application", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        kitchenRequest,
        menuRequest,
        fetch("/api/chef/orders", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/chef/earnings", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);

      if (!active) return;
      const unavailable: string[] = [];
      const details: string[] = [];
      const fail = (label: string, failure: unknown) => {
        unavailable.push(label);
        details.push(`${label.charAt(0).toUpperCase()}${label.slice(1)}: ${chefErrorText(failure, "It couldn’t be loaded.")}`);
      };
      const unreadable = (label: string, ref: string) => fail(label, new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, ref, 200));
      let application: ChefApplication | null = null;
      let kitchen: ChefKitchen | null = null;
      let menu: ChefMenuItem[] = [];
      let orders: ChefOrder[] = [];
      let earnings: ChefEarning[] = [];

      for (let index = 0; index < requests.length; index += 1) {
        const result = requests[index];
        const label = ["application", "kitchen", "menu", "orders", "earnings"][index]!;
        if (index === 2 && result.status === "fulfilled" && result.value === null) continue;
        if (result.status !== "fulfilled") {
          fail(label, result.reason);
          continue;
        }
        if (!result.value?.ok) {
          fail(label, result.value ? chefApiError(result.value, await result.value.json().catch(() => null), "") : null);
          continue;
        }
        const raw = await result.value.json().catch(() => undefined);
        if (index === 0) application = parseChefApplication(raw);
        if (index === 1) {
          kitchen = raw === null ? null : parseChefKitchen(raw);
          if (raw !== null && !kitchen) unreadable(label, "INVALID_KITCHEN_RESPONSE");
        }
        if (index === 2) {
          const parsedMenu = parseChefMenuItems(raw);
          if (parsedMenu) menu = parsedMenu;
          else unreadable(label, "INVALID_MENU_RESPONSE");
        }
        if (index === 3) {
          const parsedOrders = parseChefOrdersResponse(raw);
          if (parsedOrders) orders = parsedOrders;
          else unreadable(label, "INVALID_CHEF_ORDERS_RESPONSE");
        }
        if (index === 4) {
          const parsedEarnings = parseChefEarnings(raw);
          if (parsedEarnings) earnings = parsedEarnings;
          else unreadable(label, "INVALID_CHEF_EARNINGS_RESPONSE");
        }
      }

      if (!active) return;
      setSnapshot({ application, kitchen, menu, orders, earnings, unavailable, details });
      if (application?.status === "APPROVED" && !unavailable.includes("kitchen")) {
        const noticeKey = `craves-chef-approved:${application.id ?? getSession()?.id}:${application.reviewedAt ?? "approved"}`;
        setApprovalNoticeKey(noticeKey);
        try {
          if (!window.localStorage.getItem(noticeKey)) setShowApprovalNotice(true);
        } catch {
          setShowApprovalNotice(true);
        }
      }
      setState("approved");
      setMessage("");
    }

    loadApprovedSnapshot().catch(() => {
      if (!active) return;
      setState("error");
      setMessage("We couldn’t load Chef Mode right now. Please try again.");
    });

    return () => {
      active = false;
    };
  }, [refreshTick]);

  const stats = useMemo(() => {
    const actionOrders = snapshot.orders.filter(
      (order) => order.status === "CHEF_ACCEPTANCE_PENDING",
    );
    const activeOrders = snapshot.orders.filter((order) =>
      ["CHEF_ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"].includes(
        order.status,
      ),
    );
    const availableMenu = snapshot.menu.filter(
      (item) => item.status === "ACTIVE" && item.available,
    );
    const weekEntries = snapshot.earnings.filter(
      (entry) =>
        ["APPROVED", "SETTLEMENT_PENDING", "SETTLED"].includes(entry.status) &&
        isThisWeek(entry.createdAt),
    );
    const weekCurrency = weekEntries[0]?.currency ?? snapshot.earnings[0]?.currency ?? "INR";
    const weekAmount = weekEntries.reduce((sum, entry) => sum + entry.netPayable, 0);
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const todayOrders = snapshot.orders.filter(order => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(order.createdAt)) === todayKey).length;
    return { actionOrders, activeOrders, availableMenu, weekAmount, weekCurrency, todayOrders };
  }, [snapshot]);

  function dismissApprovalNotice() {
    if (approvalNoticeKey) {
      try {
        window.localStorage.setItem(approvalNoticeKey, "seen");
      } catch {
        // The notice can still close when browser storage is unavailable.
      }
    }
    setShowApprovalNotice(false);
  }

  if (state === "loading") {
    return (
      <div className="chef-stack" aria-busy="true">
        <ChefSkeleton className="h-16 w-2/3" />
        <ChefSkeleton className="h-44" />
        <ChefSkeleton className="h-40" />
        <p className="sr-only" role="status">Loading Chef Mode</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title="Chef Mode couldn’t load"
          text={message}
          action={
            <button type="button" onClick={() => setRefreshTick((value) => value + 1)} className="chef-btn is-primary">
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
              Try again
            </button>
          }
        />
      </ChefSection>
    );
  }

  let priority: PriorityAction;
  if (snapshot.unavailable.includes("kitchen") || snapshot.unavailable.includes("menu")) {
    priority = {
      eyebrow: "Try again",
      title: "Check your kitchen and menu",
      description: "We couldn’t verify your saved kitchen or dishes. Refresh before continuing setup.",
      action: "Refresh kitchen and menu",
      refresh: true,
      icon: RefreshCw,
    };
  } else if (!snapshot.kitchen) {
    priority = {
      eyebrow: "You’re approved",
      title: "Give your kitchen a name",
      description: "This is what customers will know your home kitchen by.",
      action: "Name my kitchen",
      href: "/chef/kitchen",
      icon: Store,
    };
  } else if (snapshot.menu.length === 0) {
    priority = {
      eyebrow: "Next step",
      title: "Add your first dish",
      description: "Add one dish so customers can see what you cook.",
      action: "Add a dish",
      href: "/chef/menu",
      icon: Utensils,
    };
  } else if (stats.activeOrders.length > 0) {
    const first = stats.activeOrders[0]!;
    priority = {
      eyebrow: "Cooking now",
      title: "You have an order in progress",
      description: "Open it when you’re ready to continue or mark the food packed.",
      action: "Continue order",
      href: `/chef/orders/${first.id}`,
      icon: ChefHat,
    };
  } else {
    priority = {
      eyebrow: "Today",
      title: "No new orders right now",
      description: "Your menu is live. New orders show up here and in Orders as soon as customers choose your food.",
      action: "Check for new orders",
      refresh: true,
      icon: ChefHat,
    };
  }

  const kitchenOpen = snapshot.kitchen?.status === "ACTIVE";
  const kitchenName = snapshot.kitchen?.kitchenName || "Your Craves kitchen";
  const firstName = user?.firstName || user?.username || "Chef";
  const ordersUnknown = snapshot.unavailable.includes("orders");
  const newOrders = stats.actionOrders;

  return (
    <>
      {/* The shared sheet: focus moves in and back, Esc and Back close it, phones get a bottom sheet. */}
      <Sheet
        open={showApprovalNotice}
        onOpenChange={(open) => {
          if (!open) dismissApprovalNotice();
        }}
        title="You’re a Craves chef"
        description={
          snapshot.kitchen
            ? "Your kitchen is set up. Add your first dish so customers can find what you cook."
            : "Save your kitchen name and pickup address, then add your first dish."
        }
        footer={
          <>
            <button type="button" onClick={dismissApprovalNotice} className={secondaryActionClass}>
              Not now
            </button>
            <Link
              href={snapshot.kitchen ? "/chef/menu" : "/chef/kitchen"}
              onClick={dismissApprovalNotice}
              className="craves-primary-action w-full sm:w-auto"
            >
              {snapshot.kitchen ? "Add my first dish" : "Set up my kitchen"}
            </Link>
          </>
        }
      />

      <div className="chef-stack">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="chef-page-title">{greeting()}, {firstName}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] text-[#6B6B6B]">
              <span className="truncate font-semibold text-[#1A1A1A]">{kitchenName}</span>
              <ChefPill tone={kitchenOpen ? "success" : "muted"}>{kitchenOpen ? "Accepting orders" : "Not accepting orders"}</ChefPill>
            </p>
          </div>
        </header>

        {snapshot.unavailable.length > 0 ? (
          <ChefNotice icon={AlertTriangle} role="status">
            <p>Some information couldn’t refresh. Everything shown below is up to date.</p>
            {snapshot.details.map((detail) => <p key={detail} className="mt-1 text-[#6B6B6B]">{detail}</p>)}
          </ChefNotice>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-5">
          <div className="chef-stack">
            {newOrders.length > 0 ? (
              <ChefSection
                title={`${newOrders.length} new order${newOrders.length === 1 ? "" : "s"} waiting`}
                note="Tell the customer you can cook it. Waiting orders show here first."
                flush
                labelledBy="chef-new-orders"
              >
                <ul className="chef-list border-t border-[#E3E6EA]">
                  {newOrders.map((order) => (
                    <li key={order.id}>
                      <Link href={`/chef/orders/${order.id}`} className="chef-row">
                        <span className="chef-row-main">
                          <span className="flex flex-wrap items-center gap-2">
                            <ChefPill tone="attention">New</ChefPill>
                            <span className="chef-row-meta !mt-0">#{shortOrderNumber(order.id)} · {timeAgo(order.createdAt)}</span>
                          </span>
                          <span className="chef-row-title mt-1.5 line-clamp-2 block">{itemSummary(order)}</span>
                        </span>
                        <span className="chef-row-value chef-amount">{formatInr(order.foodSubtotal, { currency: order.currency })}</span>
                        <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </ChefSection>
            ) : (
              <ChefSection>
                <div className="flex items-start gap-4">
                  <span className="chef-row-icon"><priority.icon className="h-5 w-5" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="chef-section-title">{priority.title}</h2>
                    <p className="mt-1 text-[0.9375rem] leading-6 text-[#6B6B6B]">{priority.description}</p>
                    {priority.href ? (
                      <Link href={priority.href} className="chef-btn is-primary mt-4 w-full sm:w-auto">
                        {priority.action}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => priority.refresh && setRefreshTick((value) => value + 1)} className="chef-btn mt-4 w-full sm:w-auto">
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        {priority.action}
                      </button>
                    )}
                  </div>
                </div>
              </ChefSection>
            )}

            {stats.activeOrders.length > 0 ? (
              <ChefSection
                title="In progress"
                flush
                labelledBy="chef-active-orders"
                action={<Link href="/chef/orders" className="chef-btn is-small">All orders</Link>}
              >
                <ul className="chef-list border-t border-[#E3E6EA]">
                  {stats.activeOrders.map((order) => {
                    const status = chefOrderStatus(order.status);
                    return (
                      <li key={order.id}>
                        <Link href={`/chef/orders/${order.id}`} className="chef-row">
                          <span className="chef-row-main">
                            <span className="flex flex-wrap items-center gap-2">
                              <ChefPill tone={status.tone}>{status.label}</ChefPill>
                              <span className="chef-row-meta !mt-0">#{shortOrderNumber(order.id)}{order.prepTimeMinutes ? ` · ${order.prepTimeMinutes} min prep` : ""}</span>
                            </span>
                            <span className="chef-row-title mt-1.5 line-clamp-2 block">{itemSummary(order)}</span>
                          </span>
                          <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </ChefSection>
            ) : null}
          </div>

          <ChefSection title="Today" flush labelledBy="chef-today">
            <div className="chef-stats mt-1 border-t border-[#E3E6EA]">
              <Link href="/chef/orders" className="chef-stat">
                <p className="chef-stat-label">Orders today</p>
                <p className="chef-stat-value">{ordersUnknown ? "—" : stats.todayOrders}</p>
              </Link>
              <Link href="/chef/orders" className="chef-stat">
                <p className="chef-stat-label">Cooking now</p>
                <p className="chef-stat-value">{ordersUnknown ? "—" : stats.activeOrders.length}</p>
              </Link>
              <Link href="/chef/menu" className="chef-stat">
                <p className="chef-stat-label">Dishes available</p>
                <p className="chef-stat-value">{snapshot.menu.length ? `${stats.availableMenu.length} of ${snapshot.menu.length}` : "0"}</p>
              </Link>
              <Link href="/chef/earnings" className="chef-stat">
                <p className="chef-stat-label">Earned this week</p>
                <p className="chef-stat-value">{stats.weekAmount > 0 ? formatInr(stats.weekAmount, { currency: stats.weekCurrency, decimals: 0 }) : "₹0"}</p>
              </Link>
            </div>
          </ChefSection>
        </div>
      </div>
    </>
  );
}

/** Good morning/afternoon/evening in India time. */
function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function itemSummary(order: ChefOrder): string {
  return order.items.map((item) => `${item.quantity}× ${item.itemName}`).join(", ") || "Food order";
}

export default ChefModeDashboard;
