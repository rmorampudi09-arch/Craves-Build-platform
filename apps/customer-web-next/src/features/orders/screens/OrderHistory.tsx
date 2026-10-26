"use client";

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, ChevronRight, RefreshCw, RotateCw, UtensilsCrossed } from "lucide-react";
import {
  parseCustomerOrderPage,
  parseCustomerOrders,
  type CustomerOrder,
} from "@/features/orders/lib/order-contract";
import {
  formatOrderDate,
  ORDER_TABS,
  orderAction,
  orderItemsLine,
  ordersInTab,
  orderStatusPill,
  TONE_PILL,
  type OrderTab,
} from "@/features/orders/lib/order-presentation";
import { useDishPhotos } from "@/features/orders/api/dish-photos";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { useKitchenProfile } from "@/shared/hooks/use-kitchen-profile";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { loadSession } from "@/features/auth/api/cravesAuth";
import { addToCart, CartKeptError, loadCart } from "@/features/cart/api/cravesCart";
import { loadKitchenMenu } from "@/features/dish/api/dishes";
import { CravesLogo } from "@/shared/components/brand/CravesLogo";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";
import { notificationsLabel, UnreadBadge, useCustomerUnreadCount } from "@/shared/components/notifications/unread-badge";
import { useReturnScroll } from "@/shared/lib/return-scroll";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { EmptyState, emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/navigation/tabs";

// Read and cleared by the cart page, which shows it once (same key as checkout uses).
const CART_NOTICE_KEY = "craves.cart.notice";
const dishList = new Intl.ListFormat("en-IN", { type: "conjunction" });
/** Like the app: 20 orders a page, then "Load older orders". */
const PAGE_SIZE = 20;
const REORDER_FAILED = "We couldn’t add these dishes to your cart. Please try again.";

const EMPTY_TAB: Record<Exclude<OrderTab, "ALL">, [string, string]> = {
  UPCOMING: ["No upcoming orders", "Orders that are being made or are on their way show up here."],
  COMPLETED: ["No completed orders yet", "Delivered orders show up here, ready to order again."],
  CANCELLED: ["No cancelled orders", "Declined, cancelled and refunded orders show up here."],
};

type Problem = "session" | "offline" | "error";

/** The sign-in, not the orders, is what failed; the page asks for that, not for a reload. */
class SignInProblem extends Error {}

function problemOf(caught: unknown): Problem {
  if (caught instanceof SignInProblem) return "session";
  return typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error";
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const newestFirst = (left: CustomerOrder, right: CustomerOrder) =>
  new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();

/** One page of orders, newest first. Before the paged list is live (or if it fails), today's list of the latest 50. */
async function readOrders(cursor: string | null): Promise<{ orders: CustomerOrder[]; cursor: string | null }> {
  const response = await sessionFetch(`/api/orders/page?limit=${PAGE_SIZE}${cursor ? `&cursor=${cursor}` : ""}`, { cache: "no-store" });
  if (response.status === 401) throw new SignInProblem();
  const page = response.ok ? parseCustomerOrderPage(await response.json().catch(() => null)) : null;
  if (page) return { orders: page.orders, cursor: page.hasMore ? page.nextCursor : null };
  if (cursor) throw new Error("ORDER_HISTORY_UNAVAILABLE");
  const legacy = await sessionFetch("/api/orders", { cache: "no-store" });
  if (legacy.status === 401) throw new SignInProblem();
  const raw = await legacy.json().catch(() => null);
  const orders = legacy.ok ? parseCustomerOrders(raw) : null;
  if (!orders) throw new Error("ORDERS_UNAVAILABLE");
  return { orders: [...orders].sort(newestFirst), cursor: null };
}

/**
 * Puts a delivered order's dishes back in the cart with the existing cart
 * functions (which ask before replacing another kitchen's cart). Returns a
 * note for the cart page about dishes that are no longer on the menu.
 */
export async function reorderIntoCart(order: CustomerOrder): Promise<{ added: number; note: string }> {
  // Start from the cart Craves holds now: a paid order may have used the one this page last saw.
  await loadCart();
  const menu = new Map((await loadKitchenMenu(order.kitchenId)).map((dish) => [dish.id, dish]));
  const unavailable: string[] = [];
  let added = 0;
  for (const item of order.items) {
    const dish = menu.get(item.menuItemId);
    if (!dish) {
      unavailable.push(item.itemName);
      continue;
    }
    await addToCart(
      { id: dish.id, name: dish.name, chef: dish.chef, price: dish.price, img: dish.img, kitchenId: order.kitchenId },
      Math.min(item.quantity, 50),
    );
    added += 1;
  }
  const note = unavailable.length
    ? `${dishList.format(unavailable)} ${unavailable.length === 1 ? "isn’t" : "aren’t"} available right now, so we added the rest of your order.`
    : "";
  return { added, note };
}

function DishTile({ url }: { url: string | undefined }) {
  return (
    <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#F7F5F3] text-[#B4ABA6]" aria-hidden="true">
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : (
        <UtensilsCrossed className="h-5 w-5" />
      )}
    </span>
  );
}

type Reorder = { orderId: string; busy: boolean; message: string } | null;

/** The app's order card. The whole card opens the order; Reorder and Track order are their own buttons above it. */
function OrderCard({
  order,
  now,
  reorder,
  onReorder,
}: {
  order: CustomerOrder;
  now: number;
  reorder: Reorder;
  onReorder: (order: CustomerOrder) => void;
}) {
  const { profile } = useKitchenProfile(order.kitchenId);
  const photos = useDishPhotos(order.kitchenId);
  const pill = orderStatusPill(order, now);
  const action = orderAction(order.status);
  const shown = order.items.slice(0, 3);
  const more = order.items.length - shown.length;
  const mine = reorder?.orderId === order.id ? reorder : null;
  return (
    <article className="relative flex h-full flex-col gap-3 rounded-[20px] border border-[#E3DDD8] bg-white p-4 transition-colors duration-150 hover:border-[#D5CEC8] hover:bg-[#FCFBFA]">
      <div className="flex items-center gap-3">
        <ChefFace photoUrl={profile?.chefPhotoUrl} size={48} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-bold leading-7 text-[#261A15]">
            {/* Its ::after covers the card, so a click anywhere opens the order; focus rings the whole card. */}
            <Link
              to={`/orders/${order.id}`}
              className="after:absolute after:inset-0 after:rounded-[20px] focus-visible:!outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[#1A1A1A]"
            >
              {order.kitchenName}
            </Link>
          </h3>
          <p className="text-[0.9375rem] leading-5 text-[#706864]">
            <time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time> · #{shortOrderNumber(order.id)}
          </p>
        </div>
        <p className="shrink-0 text-xl font-bold tabular-nums text-[#261A15]">{money(order.grandTotal, order.currency)}</p>
      </div>

      <div className="flex items-center gap-2">
        {shown.map((item) => (
          <DishTile key={item.id} url={photos.get(item.menuItemId)} />
        ))}
        {more > 0 ? (
          // The line beside it names every dish, so the tile is only a picture.
          <span aria-hidden="true" className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px] bg-[#F7F5F3] text-[0.9375rem] font-semibold text-[#261A15]">
            +{more}
          </span>
        ) : null}
        <p className="ml-1 line-clamp-2 min-w-0 flex-1 text-[0.9375rem] leading-5 text-[#706864]">{orderItemsLine(order.items)}</p>
      </div>

      <div className="mt-auto flex min-h-11 items-center justify-between gap-2 border-t border-[#E3DDD8] pt-3">
        <span className={`min-w-0 truncate rounded-full px-3 text-[0.9375rem] font-bold leading-[30px] ${TONE_PILL[pill.tone]}`}>
          {pill.label}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {action === "REORDER" ? (
            <button
              type="button"
              disabled={reorder?.busy}
              aria-busy={mine?.busy}
              onClick={() => onReorder(order)}
              className="relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-full !border !border-[#E3DDD8] !bg-white px-3.5 text-[0.9375rem] font-semibold !text-[#261A15] !shadow-none hover:!bg-[#F7F5F3]"
            >
              <RotateCw className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
              {mine?.busy ? "Adding…" : "Reorder"} <span className="sr-only">from {order.kitchenName}</span>
            </button>
          ) : null}
          {action === "TRACK" ? (
            <Link
              to={`/orders/${order.id}/tracking`}
              className="relative z-10 inline-flex min-h-11 items-center gap-0.5 rounded-full pl-2 text-[1.0625rem] font-bold text-[#D92714] hover:underline hover:underline-offset-4"
            >
              Track order <span className="sr-only">from {order.kitchenName}</span>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          ) : (
            // The card itself opens the order; this only says so.
            <span aria-hidden="true" className="inline-flex min-h-11 items-center pl-2 text-[1.0625rem] font-bold text-[#D92714]">
              Details
            </span>
          )}
        </div>
      </div>
      {mine?.message ? (
        <p role="status" className="relative z-10 text-sm font-medium text-[#C4200F]">
          {mine.message}
        </p>
      ) : null}
    </article>
  );
}

/** My Orders, like the app: All, Upcoming, Completed and Cancelled, 20 at a time, newest first. */
export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | Problem>("loading");
  const [tab, setTab] = useState<OrderTab>("ALL");
  const [signedIn, setSignedIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [older, setOlder] = useState<"idle" | "loading" | "failed">("idle");
  const [reorder, setReorder] = useState<Reorder>(null);
  // Ages are measured from the moment the list loaded, so a render never changes them.
  const [loadedAt, setLoadedAt] = useState(0);
  const unread = useCustomerUnreadCount(signedIn);
  const rememberScroll = useReturnScroll(status === "ready");

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setStatus("loading");
    setRefreshFailed(false);
    try {
      const page = await readOrders(null);
      setOrders(page.orders);
      setCursor(page.cursor);
      setOlder("idle");
      setLoadedAt(Date.now());
      setStatus("ready");
    } catch (caught) {
      // A refresh that fails keeps the list on screen.
      if (background) setRefreshFailed(true);
      else setStatus(problemOf(caught));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const start = useCallback(
    (isActive: () => boolean = () => true) => {
      loadSession({ keepOnOutage: true }).then(
        (session) => {
          if (!isActive()) return;
          if (!session) {
            navigate({ to: "/" });
            return;
          }
          setSignedIn(true);
          void load();
        },
        // The sign-in couldn't be checked (offline, or Craves didn't answer): not the same as signed out.
        () => {
          if (isActive()) setStatus("session");
        },
      );
    },
    [load, navigate],
  );

  useEffect(() => {
    let active = true;
    start(() => active);
    return () => {
      active = false;
    };
  }, [start]);

  async function loadOlder() {
    if (!cursor || older === "loading") return;
    setOlder("loading");
    try {
      const page = await readOrders(cursor);
      setOrders((current) => [...current, ...page.orders.filter((order) => !current.some((item) => item.id === order.id))]);
      setCursor(page.cursor);
      setOlder("idle");
    } catch {
      setOlder("failed");
    }
  }

  async function orderAgain(order: CustomerOrder) {
    if (reorder?.busy) return;
    setReorder({ orderId: order.id, busy: true, message: "" });
    try {
      const { added, note } = await reorderIntoCart(order);
      if (added === 0) {
        setReorder({ orderId: order.id, busy: false, message: "None of these dishes are available right now." });
        return;
      }
      if (note) window.sessionStorage.setItem(CART_NOTICE_KEY, note);
      navigate({ to: "/cart" });
    } catch (error) {
      // "Keep current cart" was the customer's choice: nothing to report.
      setReorder(error instanceof CartKeptError ? null : { orderId: order.id, busy: false, message: REORDER_FAILED });
    }
  }

  const visible = ordersInTab(orders, tab, loadedAt);
  const retry =
    status === "session"
      ? () => {
          setStatus("loading");
          start();
        }
      : () => void load();

  let body;
  if (status === "loading") {
    body = <CustomerSectionSkeleton variant="orders" label="Loading your orders" />;
  } else if (status === "session") {
    body = (
      <EmptyState
        illustration="session"
        title="We couldn’t sign you back in"
        message="Check your connection and try again. You can also sign in again with your phone number."
        role="alert"
      >
        <button type="button" onClick={retry} className="craves-primary-action">
          Try again
        </button>
        <a href={`/sign-in?returnTo=${encodeURIComponent("/orders")}`} className={emptyStateSecondaryAction}>
          Go to sign in
        </a>
      </EmptyState>
    );
  } else if (status === "offline" || status === "error") {
    body = (
      <EmptyState
        illustration={status === "offline" ? "offline" : "loadError"}
        title={status === "offline" ? "You’re offline" : "We couldn’t load your orders"}
        message={status === "offline" ? "Check your Wi-Fi or mobile data, then try again." : "Check your connection and try again. Your orders are safe."}
        role="alert"
      >
        <button type="button" onClick={retry} className="craves-primary-action">
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
          Try again
        </button>
      </EmptyState>
    );
  } else if (orders.length === 0) {
    body = (
      <EmptyState
        illustration="orders"
        title="No orders yet"
        message="When you order from a home chef, you can follow it live from the kitchen to your door here."
      >
        <Link to="/home" className="craves-primary-action">
          Find something to eat
        </Link>
      </EmptyState>
    );
  } else {
    body = (
      <Tabs value={tab} onValueChange={(value) => setTab(value as OrderTab)} className="mt-4">
        <TabsList aria-label="Order filters" className="flex h-auto w-full rounded-full bg-[#F7F5F3] p-1 text-[#706864]">
          {ORDER_TABS.map(({ key, label }) => (
            <TabsTrigger
              key={key}
              value={key}
              className="min-h-[2.75rem] min-w-0 flex-1 rounded-full !border-0 !bg-transparent px-1.5 text-[0.9375rem] font-semibold !text-[#706864] !shadow-none data-[state=active]:!bg-white data-[state=active]:font-bold data-[state=active]:!text-[#261A15] data-[state=active]:!shadow-[0_1px_3px_rgba(38,26,21,0.12)]"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {visible.length === 0 && tab !== "ALL" ? (
            <EmptyState illustration="orders" title={EMPTY_TAB[tab][0]} message={EMPTY_TAB[tab][1]} heading="h2" compact />
          ) : (
            <ul className="grid gap-3.5 lg:grid-cols-2">
              {visible.map((order) => (
                <li key={order.id}>
                  <OrderCard order={order} now={loadedAt} reorder={reorder} onReorder={(item) => void orderAgain(item)} />
                </li>
              ))}
            </ul>
          )}
          {cursor ? (
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={older === "loading"}
                aria-busy={older === "loading"}
                className="min-h-11 rounded-full !border-0 !bg-[#EFEEEE] px-6 text-[0.9375rem] font-semibold !text-[#261A15] !shadow-none hover:!bg-[#E6E4E3]"
              >
                {older === "loading" ? "Loading…" : "Load older orders"}
              </button>
              {older === "failed" ? (
                <p role="alert" className="text-sm font-medium text-[#C4200F]">
                  Older orders didn’t load. Try again.
                </p>
              ) : null}
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20 text-ink" onClickCapture={rememberScroll}>
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 md:px-6">
          <Link
            to="/profile"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
            aria-label="Back to profile"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link to="/home" className="shrink-0 rounded-lg" aria-label="Craves home">
            <CravesLogo size="sm" decorative />
          </Link>
          <button
            type="button"
            disabled={refreshing || status !== "ready"}
            onClick={() => void load(true)}
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full !border-0 !bg-[#F1F3F5] !text-[#1A1A1A] !shadow-none disabled:opacity-50"
            aria-label="Refresh orders"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-5 md:px-6 md:pb-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[2.125rem] font-bold leading-tight tracking-[-0.02em] text-[#261A15]">My Orders</h1>
          <Link
            to="/notifications"
            aria-label={notificationsLabel(unread)}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FDEAE8] text-[#D92714] transition-colors hover:bg-[#FBD5D0]"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            <UnreadBadge count={unread} />
          </Link>
        </div>
        <section aria-label="Your orders">
          {body}
          {refreshFailed ? (
            <p role="alert" className="mt-5 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]">
              Your orders didn’t refresh. Check your connection and try again.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
