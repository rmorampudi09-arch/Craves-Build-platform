"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import Link from "next/link";
import { Button } from "@/components/ui/buttons/button";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  BadgeIndianRupee,
  ChefHat,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Bell,
  RefreshCw,
  ShieldCheck,
  Store,
  Utensils,
} from "lucide-react";
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

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

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
      <div className="space-y-4" aria-hidden="true">
        <div className="h-56 animate-pulse rounded-3xl bg-[#F1F3F5]" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-[#F1F3F5]" />
          ))}
        </div>
        <p className="sr-only" role="status">Loading Chef Mode</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]">
          <AlertTriangle className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-[#1A1A1A]">Chef Mode couldn’t load</h1>
        <p className="mt-2 text-sm text-[#6B6B6B]">{message}</p>
        <button
          type="button"
          onClick={() => setRefreshTick((value) => value + 1)}
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </section>
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
  } else if (stats.actionOrders.length > 0) {
    const first = stats.actionOrders[0]!;
    priority = {
      eyebrow: "Needs your answer",
      title: `${stats.actionOrders.length} new order${stats.actionOrders.length === 1 ? "" : "s"} waiting`,
      description: "Open the order and tell us if you can cook it now.",
      action: "See the order",
      href: `/chef/orders/${first.id}`,
      icon: ClipboardList,
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
      title: "No orders yet — you’re all set",
      description: "Your menu is ready. New orders will appear here when customers choose your food.",
      action: "Refresh",
      refresh: true,
      icon: ChefHat,
    };
  }

  const kitchenOpen = snapshot.kitchen?.status === "ACTIVE";
  const menuSummary = snapshot.menu.length
    ? `${snapshot.menu.length} dish${snapshot.menu.length === 1 ? "" : "es"}`
    : "Add your first dish";
  const earningsSummary = stats.weekAmount > 0
    ? money(stats.weekAmount, stats.weekCurrency)
    : "Appears after your first earning";

  return (
    <>
      {showApprovalNotice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="chef-approved-title"
            className="w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center shadow-[0_18px_50px_rgba(0,0,0,0.18)] md:p-9"
          >
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F3F5]">
              <CheckCircle2 className="h-8 w-8 text-[#F62E18]" aria-hidden="true" />
            </span>
            <p className="mt-5 text-sm font-semibold text-[#F62E18]">You’re approved</p>
            <h2 id="chef-approved-title" className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A]">Congratulations! You’re now a Craves chef</h2>
            <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">{snapshot.kitchen ? "Your Chef Mode is ready. Add your first dish so customers can discover what you cook." : "Your Chef Mode is ready. Save your kitchen name and pickup address, then add your first dish."}</p>
            <Link
              href={snapshot.kitchen ? "/chef/menu" : "/chef/kitchen"}
              onClick={dismissApprovalNotice}
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white"
            >
              {snapshot.kitchen ? "Add my first dish" : "Set up my kitchen"}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={dismissApprovalNotice}
              className="mt-3 min-h-11 w-full rounded-full bg-[#F1F3F5] px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E5E7EB]"
            >
              Go to Chef home
            </button>
          </section>
        </div>
      ) : null}

      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-[#F62E18]">Chef Mode</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
            Hello, {user?.firstName || user?.username || "Chef"}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#F1F3F5] px-3 py-2 text-sm font-semibold">{snapshot.kitchen?.kitchenName || "Your Craves kitchen"}</span><span className="inline-flex items-center gap-1 text-sm text-primary"><ShieldCheck className="h-4 w-4" />Approved Chef</span><Button asChild variant="ghost" size="icon"><Link href="/chef/notifications" aria-label="Chef notifications"><Bell className="h-5 w-5" /></Link></Button></div>
        </div>

        {snapshot.unavailable.length > 0 ? (
          <p role="status" className="rounded-2xl bg-[#F1F3F5] px-4 py-3 text-sm text-[#6B6B6B]">
            Some information couldn’t refresh. You can still use the parts shown below.
            {snapshot.details.map((detail) => <span key={detail} className="mt-1 block">{detail}</span>)}
          </p>
        ) : null}

        <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5]">
              <priority.icon className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#F62E18]">{priority.eyebrow}</p>
              <h2 className="mt-1 text-2xl font-bold text-[#1A1A1A] md:text-3xl">{priority.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B6B6B]">{priority.description}</p>
            </div>
          </div>
          {priority.href ? (
            <Link href={priority.href} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto">
              {priority.action}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => priority.refresh && setRefreshTick((value) => value + 1)}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {priority.action}
            </button>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Kitchen summary">
          <Link href="/chef/orders" className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[var(--shadow-card)]"><ClipboardList className="h-5 w-5 text-primary" /><p className="mt-4 text-xs font-semibold text-[#6B6B6B]">Today’s orders</p><p className="mt-1 text-2xl font-bold">{snapshot.unavailable.includes("orders") ? "—" : stats.todayOrders}</p></Link>
          <Link href="/chef/kitchen" className="rounded-2xl border border-[#E5E7EB] bg-white p-5 transition hover:border-[#F62E18]/40">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5]">
              <Store className="h-5 w-5 text-[#F62E18]" aria-hidden="true" />
            </span>
            <p className="mt-4 text-xs font-semibold text-[#6B6B6B]">Your kitchen</p>
            <p className="mt-1 font-bold text-[#1A1A1A]">{kitchenOpen ? "Accepting orders" : "Not accepting orders"}</p>
          </Link>
          <Link href="/chef/menu" className="rounded-2xl border border-[#E5E7EB] bg-white p-5 transition hover:border-[#F62E18]/40">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5]">
              <Utensils className="h-5 w-5 text-[#F62E18]" aria-hidden="true" />
            </span>
            <p className="mt-4 text-xs font-semibold text-[#6B6B6B]">Your menu</p>
            <p className="mt-1 font-bold text-[#1A1A1A]">{menuSummary}</p>
          </Link>
          <Link href="/chef/earnings" className="rounded-2xl border border-[#E5E7EB] bg-white p-5 transition hover:border-[#F62E18]/40">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5]">
              <BadgeIndianRupee className="h-5 w-5 text-[#F62E18]" aria-hidden="true" />
            </span>
            <p className="mt-4 text-xs font-semibold text-[#6B6B6B]">This week</p>
            <p className="mt-1 font-bold text-[#1A1A1A]">{earningsSummary}</p>
          </Link>
        </section>

        {snapshot.orders.length > 0 ? (
          <details className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <summary className="cursor-pointer font-semibold text-[#1A1A1A]">More options</summary>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Link href="/chef/application" className="rounded-xl bg-[#F1F3F5] px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Your details</Link>
              <Link href="/chef/orders" className="rounded-xl bg-[#F1F3F5] px-4 py-3 text-sm font-semibold text-[#1A1A1A]">Previous orders</Link>
              <Link href="/chef/earnings" className="rounded-xl bg-[#F1F3F5] px-4 py-3 text-sm font-semibold text-[#1A1A1A]">What you’ve earned</Link>
            </div>
          </details>
        ) : null}
      </div>
    </>
  );
}

export default ChefModeDashboard;
