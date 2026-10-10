// @vitest-environment jsdom
// Synthetic notices for a fixture account; no backend is contacted.
import { createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoToast } from "@/components/ui/overlays/undo-toast";
import NotificationsPage from "@/screens/Notifications/Notifications";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => createElement("a", { href: to, ...props }, children),
}));
vi.mock("@/components/brand/CravesLogo", () => ({ CravesLogo: () => createElement("span", null, "Craves") }));
vi.mock("@/services/auth/cravesAuth", () => ({ loadSession: async () => ({ id: ACCOUNT }) }));

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
