// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOTICES_READ_EVENT } from "@/shared/lib/notice-events";
import { notificationsLabel, unreadBadgeLabel, UnreadBadge, useCustomerUnreadCount } from "./unread-badge";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Bell({ enabled = true }: { enabled?: boolean }) {
  const count = useCustomerUnreadCount(enabled);
  return createElement("a", { href: "/notifications", "aria-label": notificationsLabel(count) }, createElement(UnreadBadge, { count }));
}

describe("unread badge", () => {
  it("caps the count at 9+ and shows nothing for none or unknown", () => {
    expect([0, 1, 9, 10, 250, null].map(unreadBadgeLabel)).toEqual([null, "1", "9", "9+", "9+", null]);
    expect(notificationsLabel(3)).toBe("Notifications, 3 unread");
    expect(notificationsLabel(0)).toBe("Notifications");
  });

  it("reads the count, and again after notices are read", async () => {
    let unread = 3;
    const fetch = vi.fn(async () => Response.json({ unreadCount: unread }));
    vi.stubGlobal("fetch", fetch);
    render(createElement(Bell));
    expect(await screen.findByRole("link", { name: "Notifications, 3 unread" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/notifications/in-app/unread-count", expect.objectContaining({ cache: "no-store" }));
    unread = 0;
    await act(async () => {
      window.dispatchEvent(new Event(NOTICES_READ_EVENT));
    });
    expect(await screen.findByRole("link", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByRole("link").textContent).toBe("");
  });

  it("shows no badge when the count can't be read, and asks nothing for a guest", async () => {
    const fetch = vi.fn(async () => Response.json({ code: "NOTIFICATIONS_UNAVAILABLE" }, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    render(createElement(Bell));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("link", { name: "Notifications" }).textContent).toBe("");
    cleanup();
    fetch.mockClear();
    render(createElement(Bell, { enabled: false }));
    expect(fetch).not.toHaveBeenCalled();
  });
});
