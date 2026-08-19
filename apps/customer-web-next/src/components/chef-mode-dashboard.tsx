"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeIndianRupee,
  ChefHat,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  LogIn,
  RefreshCw,
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
import { loadSession, type CravesUser } from "@/services/auth/cravesAuth";

type DashboardState = "loading" | "signed-out" | "applicant" | "approved" | "error";

type Snapshot = {
  application: ChefApplication | null;
  kitchen: ChefKitchen | null;
  menu: ChefMenuItem[];
  orders: ChefOrder[];
  earnings: ChefEarning[];
  unavailable: string[];
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
};

function hasChefRole(user: CravesUser): boolean {
  return user.roles.some((role) => role.toUpperCase() === "CHEF");
}

async function responseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

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

function applicantCopy(application: ChefApplication | null) {
  if (!application || application.status === "NOT_SUBMITTED") {
    return {
      title: "Cook from home with Craves",
      description:
        "Tell us who you are, where you cook, and share a few clear photos. We’ll guide you one thing at a time.",
      action: "Start my application",
    };
  }
  if (application.status === "PENDING") {
    return {
      title: "We’re checking your details",
      description:
        "Your application is with Craves. You can come back anytime, and we’ll show you the next thing that needs attention.",
      action: "View my application",
    };
  }
  if (application.status === "REJECTED") {
    return {
      title: "We need one more thing",
      description:
        application.rejectionReason?.trim() ||
        "One part of your application needs another look. Everything else is still saved.",
      action: "Fix this now",
    };
  }
  return {
    title: "You’re approved",
    description: "Your chef access is ready. Continue to set up your kitchen.",
    action: "Continue",
  };
}

export function ChefModeDashboard() {
  const [state, setState] = useState<DashboardState>("loading");
  const [user, setUser] = useState<CravesUser | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [message, setMessage] = useState("Loading your kitchen…");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      const current = await loadSession();
      if (!active) return;
      setUser(current);
      if (!current) {
        setState("signed-out");
        setMessage("Sign in to continue to Chef Mode.");
        return;
      }

      if (!hasChefRole(current)) {
        try {
          const response = await fetch("/api/chef/application", {
            cache: "no-store",
            credentials: "same-origin",
          });
          const raw = await responseBody(response);
          const application = response.ok ? parseChefApplication(raw) : null;
          setSnapshot({ ...EMPTY, application });
          setState("applicant");
          setMessage("");
        } catch {
          setState("applicant");
          setMessage("We couldn’t refresh your application right now.");
        }
        return;
      }

      const requests = await Promise.allSettled([
        fetch("/api/chef/application", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/chef/kitchen", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        fetch("/api/chef/menu", {
          cache: "no-store",
          credentials: "same-origin",
        }),
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
      let application: ChefApplication | null = null;
      let kitchen: ChefKitchen | null = null;
      let menu: ChefMenuItem[] = [];
      let orders: ChefOrder[] = [];
      let earnings: ChefEarning[] = [];

      for (let index = 0; index < requests.length; index += 1) {
        const result = requests[index];
        const label = ["application", "kitchen", "menu", "orders", "earnings"][index]!;
        if (result.status !== "fulfilled" || !result.value.ok) {
          unavailable.push(label);
          continue;
        }
        const raw = await responseBody(result.value);
        if (index === 0) application = parseChefApplication(raw);
        if (index === 1) kitchen = raw === null ? null : parseChefKitchen(raw);
        if (index === 2) menu = parseChefMenuItems(raw) ?? [];
        if (index === 3) orders = parseChefOrdersResponse(raw) ?? [];
        if (index === 4) earnings = parseChefEarnings(raw) ?? [];
      }

      setSnapshot({ application, kitchen, menu, orders, earnings, unavailable });
      setState("approved");
      setMessage("");
    })().catch(() => {
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
    return { actionOrders, activeOrders, availableMenu, weekAmount, weekCurrency };
  }, [snapshot]);

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

  if (state === "signed-out") {
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center md:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]">
          <LogIn className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-[#1A1A1A]">Sign in to Chef Mode</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#6B6B6B]">{message}</p>
        <Link href="/" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto">
          Sign in
        </Link>
      </section>
    );
  }

  if (state === "applicant") {
    const copy = applicantCopy(snapshot.application);
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]">
          <ClipboardCheck className="h-7 w-7 text-[#F62E18]" aria-hidden="true" />
        </span>
        <p className="mt-5 text-sm font-semibold text-[#F62E18]">Become a Craves chef</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A]">{copy.title}</h1>
        <p className="mt-3 text-base leading-7 text-[#6B6B6B]">{copy.description}</p>
        {message ? (
          <p role="status" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p>
        ) : null}
        <Link
          href="/chef/application"
          aria-label="Open chef application"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white"
        >
          {copy.action}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
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
  if (!snapshot.kitchen) {
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
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-[#F62E18]">Chef Mode</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          Hello, {user?.firstName || user?.username || "Chef"}
        </h1>
        <p className="mt-2 text-sm text-[#6B6B6B]">Here’s the one thing that needs your attention now.</p>
      </div>

      {snapshot.unavailable.length > 0 ? (
        <p role="status" className="rounded-2xl bg-[#F1F3F5] px-4 py-3 text-sm text-[#6B6B6B]">
          Some information couldn’t refresh. You can still use the parts shown below.
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

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Kitchen summary">
        <Link href="/chef/kitchen" className="rounded-2xl border border-[#E5E7EB] bg-white p-5 transition hover:border-[#F62E18]/40">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F5]">
            <Store className="h-5 w-5 text-[#F62E18]" aria-hidden="true" />
          </span>
          <p className="mt-4 text-xs font-semibold text-[#6B6B6B]">Your kitchen</p>
          <p className="mt-1 font-bold text-[#1A1A1A]">{kitchenOpen ? "Open" : "Closed for now"}</p>
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
  );
}

export default ChefModeDashboard;
