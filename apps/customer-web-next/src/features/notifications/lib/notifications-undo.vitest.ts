// @vitest-environment jsdom
// Synthetic notices for a fixture account; no backend is contacted.
import { createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoToast } from "@/shared/ui/overlays/undo-toast";
import NotificationsPage from "@/features/notifications/screens/Notifications";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
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

describe("notifications", () => {
  function stubNotices() {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(null, { status: 204 });
      return Response.json([
        { id: "22222222-2222-4222-8222-222222222222", title: "Order delivered", body: "Enjoy your meal.", noticeType: "ORDER",
          targetType: null, targetId: null, readAt: null, createdAt: new Date().toISOString() },
        { id: "33333333-3333-4333-8333-333333333333", title: "Welcome to Craves", body: "Hello.", noticeType: "ACCOUNT",
          targetType: null, targetId: null, readAt: "2026-10-01T10:00:00Z", createdAt: "2026-10-01T10:00:00Z" },
      ]);
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("has one h1 and marks everything read through the read-all route", async () => {
    const fetch = stubNotices();
    render(createElement(NotificationsPage));
    expect(await screen.findByRole("heading", { level: 1, name: "Notifications" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull());
    expect(fetch).toHaveBeenCalledWith("/api/notifications/in-app/read-all", expect.objectContaining({ method: "PATCH" }));
    expect(screen.getByRole("button", { name: /^All \(2\)/ })).toBeTruthy();
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

describe("who a notice is for, and where it leads", () => {
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
  function stub() {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "PATCH" ? new Response(null, { status: 204 }) : Response.json(notices));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("shows a chef only kitchen notices, and opening one marks it read", async () => {
    const fetch = stub();
    render(createElement(NotificationsPage, { audience: "chef" }));
    const open = await screen.findByRole("link", { name: "Open order" });
    expect(open.getAttribute("href")).toBe(`/chef/orders/${ORDER}`);
    expect(screen.queryByText("Chef accepted your order")).toBeNull();
    expect(screen.queryByText("Payment received")).toBeNull();
    expect(screen.getByText("Welcome to Craves")).toBeTruthy();
    fireEvent.click(open);
    expect(fetch).toHaveBeenCalledWith(`/api/notifications/in-app/${notices[0].id}/read`, expect.objectContaining({ method: "PATCH" }));
    expect(screen.getByRole("button", { name: /^Unread \(1\)/ })).toBeTruthy();
  });

  it("links a customer's own orders and never a kitchen's order", async () => {
    stub();
    render(createElement(NotificationsPage));
    await screen.findByText("Payment received");
    const links = screen.getAllByRole("link", { name: "View order" });
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.getAttribute("href") === `/orders/${ORDER}`)).toBe(true);
    expect(screen.getByText("New order received")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open order" })).toBeNull();
  });
});
