"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  RefreshCw,
  Store,
  Utensils,
} from "lucide-react";
import { ChefAccessRetry } from "@/features/chef/components/chef-account-menu";
import { createKitchenFromApplication } from "@/features/chef/lib/chef-kitchen-handoff";
import {
  ChefEmpty,
  ChefNotice,
  ChefSection,
  formatInr,
} from "@/features/chef/components/chef-ui";
import { ChefOrderCard, OrderUpdateNotice, focusOrderAfterUpdate, orderUpdateText } from "@/features/chef/components/chef-order-card";
import { ChefKitchenSwitch } from "@/features/chef/components/chef-kitchen-switch";
import { ChefOrderAlerts } from "@/features/chef/components/chef-order-alerts";
import { mergeOrders, noticeNewOrders, useChefOrderPolling } from "@/features/chef/lib/chef-order-alert";
import {
  parseChefApplication,
  type ChefApplication,
} from "@/features/chef-onboarding/lib/chef-application-contract";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import type { ChefKitchen } from "@/features/chef/lib/chef-kitchen-types";
import { parseChefMenuItems, type ChefMenuItem } from "@/features/chef/lib/chef-menu-contract";
import {
  parseChefOrdersResponse,
  type ChefOrder,
} from "@/features/chef/lib/chef-order-contract";
import {
  parseChefEarnings,
  type ChefEarning,
} from "@/features/chef/lib/chef-earnings-contract";
import { getSession } from "@/features/auth/api/cravesAuth";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import { ChefLoading } from "@/features/chef/components/chef-loading";

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
  /** A part failed because Craves couldn’t confirm chef access, even after re-reading it once. */
  accessProblem?: boolean;
};

type PriorityAction = {
  title: string;
  description: string;
  action: string;
  href?: string;
  refresh?: boolean;
  icon: typeof Store;
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
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [message, setMessage] = useState("Loading your kitchen…");
  const [refreshTick, setRefreshTick] = useState(0);
  const [showApprovalNotice, setShowApprovalNotice] = useState(false);
  const [approvalNoticeKey, setApprovalNoticeKey] = useState("");

  useEffect(() => {
    let active = true;

    async function loadApprovedSnapshot() {
      const kitchenRequest = sessionFetch("/api/chef/kitchen", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const menuRequest = kitchenRequest.then(async response => {
        if (!response.ok) return null;
        const raw = await response.clone().json().catch(() => undefined);
        if (raw === null || !parseChefKitchen(raw)) return null;
        return sessionFetch("/api/chef/menu", { cache: "no-store", credentials: "same-origin" });
      });
      const requests = await Promise.allSettled([
        sessionFetch("/api/chef/application", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        kitchenRequest,
        menuRequest,
        sessionFetch("/api/chef/orders", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        sessionFetch("/api/chef/earnings", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);

      if (!active) return;
      const unavailable: string[] = [];
      const details: string[] = [];
      let accessProblem = false;
      const fail = (label: string, failure: unknown) => {
        unavailable.push(label);
        const text = chefErrorText(failure, "It couldn’t be loaded."); // also reports the error to Craves
        // A stale chef sign-in blocks every section at once; the notice explains it once.
        if (failure instanceof ChefError && /^CHEF_(ACCESS|ROLE)_REQUIRED$/.test(failure.ref)) {
          accessProblem = true;
          return;
        }
        details.push(`${label.charAt(0).toUpperCase()}${label.slice(1)}: ${text}`);
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

      if (application?.status === "APPROVED" && !kitchen && !unavailable.includes("kitchen")) {
        // The application already named the kitchen and its address: save it, so the chef's only step is a first dish.
        kitchen = await createKitchenFromApplication(application, getSession()?.phoneNumber ?? "").catch(() => null);
      }

      if (!active) return;
      // Orders already waiting when Chef Mode opens are on screen; only later ones ring.
      if (!unavailable.includes("orders")) noticeNewOrders(orders);
      setSnapshot({ application, kitchen, menu, orders, earnings, unavailable, details, accessProblem });
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

  // New orders appear (and ring) without a refresh; a check never undoes the chef's own tap.
  useChefOrderPolling(state === "approved", (orders) =>
    setSnapshot((current) => ({
      ...current,
      orders: mergeOrders(current.orders, orders),
      unavailable: current.unavailable.filter((label) => label !== "orders"),
      details: current.details.filter((detail) => !detail.startsWith("Orders:")),
    })),
  );

  const [orderNotice, setOrderNotice] = useState("");
  function updateOrder(order: ChefOrder) {
    setSnapshot((current) => ({
      ...current,
      orders: current.orders.map((existing) => (existing.id === order.id ? order : existing)),
    }));
    setOrderNotice(orderUpdateText(order));
    focusOrderAfterUpdate(order.id, "chef-order-update");
  }

  const stats = useMemo(() => {
    // Oldest first: the order that has waited longest gets answered first.
    const byAge = [...snapshot.orders].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    const actionOrders = byAge.filter(
      (order) => order.status === "CHEF_ACCEPTANCE_PENDING",
    );
    // Still in the kitchen: what's cooking (the next tap) first, then what waits for the rider.
    const cookingOrders = byAge.filter((order) => ["CHEF_ACCEPTED", "PREPARING"].includes(order.status));
    const activeOrders = [...cookingOrders, ...byAge.filter((order) => order.status === "READY_FOR_PICKUP")];
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
    return { actionOrders, activeOrders, cookingCount: cookingOrders.length, availableMenu, weekAmount, weekCurrency, todayOrders };
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

  if (state === "loading") return <ChefLoading shape="dashboard" label="Loading Chef Mode" />;

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

  // Setup comes first; with the kitchen ready, the orders below are the whole job.
  let priority: PriorityAction | null = null;
  if (snapshot.unavailable.includes("kitchen") || snapshot.unavailable.includes("menu")) {
    priority = {
      title: "Check your kitchen and menu",
      description: "We couldn’t check your saved kitchen or dishes. Try again before you carry on.",
      action: "Try again",
      refresh: true,
      icon: RefreshCw,
    };
  } else if (!snapshot.kitchen) {
    priority = {
      title: "Give your kitchen a name",
      description: "This is what customers will know your home kitchen by.",
      action: "Name my kitchen",
      href: "/chef/kitchen",
      icon: Store,
    };
  } else if (snapshot.menu.length === 0) {
    priority = {
      title: "Add your first dish",
      description: "Add one dish so customers can see what you cook.",
      action: "Add a dish",
      href: "/chef/menu",
      icon: Utensils,
    };
  }

  const kitchenName = snapshot.kitchen?.kitchenName || "Your Craves kitchen";
  // The chef's name from the application: never the phone number, never the customer profile.
  const firstName = snapshot.application?.firstName?.trim() || "Chef";
  const ordersUnknown = snapshot.unavailable.includes("orders");
  const newOrders = stats.actionOrders;
  const activeOrders = stats.activeOrders;
  const quiet = !priority && newOrders.length === 0 && activeOrders.length === 0;

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
        <header className="min-w-0">
          <h1 className="chef-page-title">{greeting()}, {firstName}</h1>
          <p className="mt-1 truncate text-[0.9375rem] font-semibold text-[#6B6B6B]">{kitchenName}</p>
        </header>

        {snapshot.unavailable.length > 0 ? (
          <ChefNotice icon={AlertTriangle} role="status">
            {snapshot.accessProblem ? (
              <>
                <p className="font-semibold">Your orders couldn’t load</p>
                <p className="mt-1 text-[#6B6B6B]">
                  Craves couldn’t confirm your chef access just now, so new orders won’t show or ring. We already tried
                  again for you. Tap Try again; if it keeps happening, it’s on our side — tell us in Get help. You don’t
                  need to sign in again.
                </p>
              </>
            ) : (
              <p>Some information couldn’t refresh. Everything else below is up to date.</p>
            )}
            {snapshot.details.map((detail) => <p key={detail} className="mt-1 text-[#6B6B6B]">{detail}</p>)}
            {snapshot.accessProblem ? (
              <div className="mt-3">
                <ChefAccessRetry onRetry={() => setRefreshTick((value) => value + 1)} />
              </div>
            ) : null}
          </ChefNotice>
        ) : null}

        {snapshot.kitchen ? (
          <ChefKitchenSwitch
            kitchen={snapshot.kitchen}
            onChange={(kitchen) => setSnapshot((current) => ({ ...current, kitchen }))}
            cookingCount={stats.cookingCount}
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-5">
          <div className="chef-stack">
            {priority ? (
              <ChefSection>
                <div className="flex items-start gap-4">
                  <span className="chef-row-icon"><priority.icon className="h-5 w-5" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="chef-section-title">{priority.title}</h2>
                    <p className="mt-1 text-[0.9375rem] leading-6 text-[#6B6B6B]">{priority.description}</p>
                    {priority.href ? (
                      <Link href={priority.href} className="chef-btn is-primary is-tall mt-4 w-full sm:w-auto">
                        {priority.action}
                      </Link>
                    ) : (
                      <button type="button" onClick={() => setRefreshTick((value) => value + 1)} className="chef-btn mt-4 w-full sm:w-auto">
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        {priority.action}
                      </button>
                    )}
                  </div>
                </div>
              </ChefSection>
            ) : null}

            {/* Times itself out (ChefFlash), paused while pointed at or focused. */}
            <OrderUpdateNotice id="chef-order-update" text={orderNotice} />

            {newOrders.length > 0 ? (
              <section className="chef-stack" aria-labelledby="chef-new-orders">
                <h2 id="chef-new-orders" className="chef-group-title is-attention">
                  <BellRing className="h-5 w-5" aria-hidden="true" />
                  {newOrders.length === 1 ? "New order: answer now" : `${newOrders.length} new orders: answer now`}
                </h2>
                {newOrders.map((order) => (
                  <ChefOrderCard key={order.id} order={order} onUpdated={updateOrder} />
                ))}
              </section>
            ) : null}

            {activeOrders.length > 0 ? (
              <section className="chef-stack" aria-labelledby="chef-active-orders">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="chef-active-orders" className="chef-group-title">In your kitchen</h2>
                  <Link href="/chef/orders" className="chef-btn is-small">All orders</Link>
                </div>
                {activeOrders.map((order) => (
                  <ChefOrderCard key={order.id} order={order} onUpdated={updateOrder} />
                ))}
              </section>
            ) : null}

            {quiet ? (
              <ChefSection>
                <ChefEmpty
                  icon={BellRing}
                  title={ordersUnknown ? "Orders couldn’t load" : "No orders right now"}
                  text={
                    ordersUnknown
                      ? snapshot.accessProblem
                        ? "They show here as soon as Craves confirms your chef access."
                        : "We’ll keep trying every few seconds. You can also check now."
                      : "Keep Craves open. Your phone rings and the order shows here as soon as a customer orders."
                  }
                  action={
                    snapshot.accessProblem ? undefined : (
                      <button type="button" onClick={() => setRefreshTick((value) => value + 1)} className="chef-btn">
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Check now
                      </button>
                    )
                  }
                />
              </ChefSection>
            ) : null}
          </div>

          <div className="chef-stack">
            <ChefSection title="Today" flush labelledBy="chef-today">
              <div className="chef-stats mt-1 border-t border-[#E3E6EA]">
                <Link href="/chef/orders" className="chef-stat">
                  <p className="chef-stat-label">Orders today</p>
                  <p className="chef-stat-value">{ordersUnknown ? "—" : stats.todayOrders}</p>
                </Link>
                <Link href="/chef/orders" className="chef-stat">
                  <p className="chef-stat-label">Cooking now</p>
                  <p className="chef-stat-value">{ordersUnknown ? "—" : stats.cookingCount}</p>
                </Link>
                <Link href="/chef/menu" className="chef-stat">
                  <p className="chef-stat-label">Dishes on today</p>
                  <p className="chef-stat-value">{snapshot.menu.length ? `${stats.availableMenu.length} of ${snapshot.menu.length}` : "0"}</p>
                </Link>
                <Link href="/chef/earnings" className="chef-stat">
                  <p className="chef-stat-label">Earned this week</p>
                  <p className="chef-stat-value">{stats.weekAmount > 0 ? formatInr(stats.weekAmount, { currency: stats.weekCurrency, decimals: 0 }) : "₹0"}</p>
                </Link>
              </div>
            </ChefSection>
            <ChefOrderAlerts />
          </div>
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

export default ChefModeDashboard;
