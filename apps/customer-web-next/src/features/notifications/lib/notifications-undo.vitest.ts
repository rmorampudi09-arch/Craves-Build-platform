// @vitest-environment jsdom
// Synthetic notices for a fixture account; no backend is contacted.
import { createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoToast } from "@/shared/ui/overlays/undo-toast";
import NotificationsPage from "@/features/notifications/screens/Notifications";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
// One navigate for the whole test, like the app's router: a new one each render would reload the page each render.
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => createElement("a", { href: to, ...props }, children),
}));
vi.mock("@/shared/components/brand/CravesLogo", () => ({ CravesLogo: () => createElement("span", null, "Craves") }));
vi.mock("@/features/auth/api/cravesAuth", () => ({ loadSession: async () => ({ id: ACCOUNT }) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("undo toast", () => {
  it("waits at least 8 seconds and pauses while focused", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(createElement(UndoToast, { toast: { id: 1, message: "2 notifications cleared" }, onUndo: vi.fn(), onExpire }));

    fireEvent.focus(screen.getByRole("button", { name: "Undo" }));
    act(() => vi.advanceTimersByTime(20_000));
    expect(onExpire).not.toHaveBeenCalled();

    fireEvent.blur(screen.getByRole("button", { name: "Undo" }));
    act(() => vi.advanceTimersByTime(7_999));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

/** The paged inbox answers with `notices`; PATCHes succeed; the bell's count is 1. */
function serveInbox(notices: unknown[], extra: Record<string, unknown> = {}) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return new Response(null, { status: 204 });
    if (url in extra) return Response.json(extra[url]);
    if (url === "/api/notifications/in-app/page?limit=50") return Response.json({ notices, nextCursor: null, hasMore: false });
    if (url === "/api/notifications/in-app/unread-count") return Response.json({ unreadCount: 1 });
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("notifications", () => {
  function stubNotices() {
    return serveInbox([
      { id: "22222222-2222-4222-8222-222222222222", title: "Order delivered", body: "Enjoy your meal.", noticeType: "ORDER",
        targetType: null, targetId: null, readAt: null, createdAt: new Date().toISOString() },
      { id: "33333333-3333-4333-8333-333333333333", title: "Welcome to Craves", body: "Hello.", noticeType: "ACCOUNT",
        targetType: null, targetId: null, readAt: "2026-10-01T10:00:00Z", createdAt: "2026-10-01T10:00:00Z" },
    ]);
  }

  it("has one h1 and marks everything read through the read-all route", async () => {
    const fetch = stubNotices();
    render(createElement(NotificationsPage));
    expect(await screen.findByRole("heading", { level: 1, name: "Notifications" })).toBeTruthy();
    expect(await screen.findByText("1 unread")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull());
    expect(fetch).toHaveBeenCalledWith("/api/notifications/in-app/read-all", expect.objectContaining({ method: "PATCH" }));
    expect(screen.getByText("You are caught up")).toBeTruthy();
    expect(screen.getByRole("button", { name: "All 2" })).toBeTruthy();
  });

  it("marks cleared unread notices read once the clear is kept, so the bell doesn't count them", async () => {
    const fetch = stubNotices();
    const view = render(createElement(NotificationsPage));
    fireEvent.click(await screen.findByRole("button", { name: "Clear all" }));
    view.unmount();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/notifications/in-app/22222222-2222-4222-8222-222222222222/read", expect.objectContaining({ method: "PATCH" })),
    );
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  });

  it("hides cleared notices at once and brings them back on Undo without saving", async () => {
    stubNotices();
    render(createElement(NotificationsPage));
    fireEvent.click(await screen.findByRole("button", { name: "Clear all" }));
    expect(screen.queryByText("Order delivered")).toBeNull();
    expect(screen.getByText("2 notifications cleared")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Order delivered")).toBeTruthy();
    expect(window.localStorage.getItem(`craves.notifications.cleared:${ACCOUNT}`)).toBeNull();
  });

  it("saves the clear when the page is left before the toast expires", async () => {
    stubNotices();
    const view = render(createElement(NotificationsPage));
    fireEvent.click(await screen.findByRole("button", { name: "Clear read" }));
    view.unmount();
    expect(JSON.parse(window.localStorage.getItem(`craves.notifications.cleared:${ACCOUNT}`)!))
      .toEqual(["33333333-3333-4333-8333-333333333333"]);
  });
});

describe("where a notice leads", () => {
  const ORDER = "44444444-4444-4444-8444-444444444444";
  const notices = [
    { id: "55555555-5555-4555-8555-555555555555", title: "New order received", body: "A paid Craves order is waiting.", noticeType: "CHEF_ORDER_AWAITING_ACCEPTANCE",
      targetType: "ORDER", targetId: ORDER, readAt: null, createdAt: new Date().toISOString() },
    { id: "66666666-6666-4666-8666-666666666666", title: "Chef accepted your order", body: "We'll keep you updated.", noticeType: "CHEF_ACCEPTED_ORDER",
      targetType: "ORDER", targetId: ORDER, readAt: null, createdAt: new Date().toISOString() },
    { id: "77777777-7777-4777-8777-777777777777", title: "Payment received", body: "Thanks.", noticeType: "PAYMENT_SUCCEEDED",
      targetType: "ORDER", targetId: ORDER, readAt: null, createdAt: new Date().toISOString() },
    { id: "88888888-8888-4888-8888-888888888888", title: "Welcome to Craves", body: "Hello.", noticeType: "ACCOUNT",
      targetType: null, targetId: null, readAt: null, createdAt: new Date().toISOString() },
  ];
  it("opens a customer's own orders from the whole row and never a kitchen's order", async () => {
    const fetch = serveInbox(notices);
    render(createElement(NotificationsPage));
    await screen.findByText("Payment received");
    const orderLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href") === `/orders/${ORDER}`);
    expect(orderLinks.map((link) => link.textContent)).toEqual(["Chef accepted your order", "Payment received"]);
    expect(screen.queryByRole("link", { name: "New order received" })).toBeNull();
    // A notice that leads nowhere is read with one tap.
    fireEvent.click(screen.getByRole("button", { name: "Welcome to Craves, mark as read" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/notifications/in-app/88888888-8888-4888-8888-888888888888/read", expect.objectContaining({ method: "PATCH" })),
    );
  });

  it("sorts notices under the app's chips and filters by them", async () => {
    serveInbox(notices);
    render(createElement(NotificationsPage));
    fireEvent.click(await screen.findByRole("button", { name: "Orders 3" }));
    expect(screen.getByRole("button", { name: "Orders 3" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Welcome to Craves")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Offers 0" }));
    expect(screen.getByRole("heading", { name: "Nothing in this category" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Updates 1" }));
    expect(screen.getByText("Welcome to Craves")).toBeTruthy();
  });

  it("opens a delivery notice on the live tracking page", async () => {
    serveInbox([{ ...notices[1], targetType: "DELIVERY", title: "Your rider is on the way" }]);
    render(createElement(NotificationsPage));
    expect((await screen.findByRole("link", { name: "Your rider is on the way" })).getAttribute("href")).toBe(`/orders/${ORDER}/tracking`);
  });
});

describe("loading the inbox", () => {
  const notice = (n: number) => ({ id: `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`, title: `Notice ${n}`, body: "Body.", noticeType: "ACCOUNT",
    targetType: null, targetId: null, readAt: "2026-10-01T10:00:00Z", createdAt: `2026-10-0${n}T10:00:00Z` });

  it("loads older notifications from the paged inbox", async () => {
    serveInbox([], {
      "/api/notifications/in-app/page?limit=50": { notices: [notice(2)], nextCursor: "c2", hasMore: true },
      "/api/notifications/in-app/page?limit=50&cursor=c2": { notices: [notice(1)], nextCursor: null, hasMore: false },
    });
    render(createElement(NotificationsPage));
    fireEvent.click(await screen.findByRole("button", { name: "Load older notifications" }));
    expect(await screen.findByText("Notice 1")).toBeTruthy();
    expect(screen.getByText("Notice 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load older notifications" })).toBeNull();
    expect(screen.getByText("You've reached the end")).toBeTruthy();
  });

  it("shows today's latest list while the paged inbox isn't live", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith("/api/notifications/in-app/page")
        ? Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 })
        : url === "/api/notifications/in-app?limit=50" ? Response.json([notice(3)]) : Response.json({ unreadCount: 0 }));
    vi.stubGlobal("fetch", fetch);
    render(createElement(NotificationsPage));
    expect(await screen.findByText("Notice 3")).toBeTruthy();
    expect(screen.getByText("You are caught up")).toBeTruthy();
  });

  it("draws the empty inbox and a failed load like the app", async () => {
    serveInbox([]);
    render(createElement(NotificationsPage));
    expect(await screen.findByRole("heading", { name: "No notifications yet" })).toBeTruthy();
    expect(screen.getByTestId("empty-illustration-notifications")).toBeTruthy();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "NOTIFICATIONS_UNAVAILABLE", message: "db down" }, { status: 503 })));
    render(createElement(NotificationsPage));
    expect(await screen.findByRole("heading", { name: "We couldn’t load your notifications" })).toBeTruthy();
    expect(screen.queryByText(/db down/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
