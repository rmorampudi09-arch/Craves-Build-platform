// @vitest-environment jsdom
// Synthetic notices for a fixture chef; no backend is contacted.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTICES_READ_EVENT } from "@/shared/lib/notice-events";

const fetcher = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/session-fetch", () => ({ sessionFetch: fetcher }));
import ChefNotifications from "@/features/notifications/screens/ChefNotifications";

const ORDER = "44444444-4444-4444-8444-444444444444";
const now = new Date().toISOString();
const notice = (
  id: string,
  title: string,
  noticeType: string,
  targetType: string | null,
  extra: object = {},
) => ({
  id: `55555555-5555-4555-8555-55555555555${id}`,
  title,
  body: `${title} body`,
  noticeType,
  targetType,
  targetId: null,
  readAt: null,
  createdAt: now,
  ...extra,
});
const NEW_ORDER = notice("1", "New order received", "CHEF_ORDER_AWAITING_ACCEPTANCE", "ORDER", {
  targetId: ORDER,
});
const PAYOUT = notice("2", "Payout sent", "CHEF_PAYOUT_SENT", "PAYOUT");
const REVIEW = notice("3", "New review", "CHEF_NEW_REVIEW", "ORDER", { readAt: now });
const OWN_ORDER = notice("4", "Chef accepted your order", "CHEF_ACCEPTED_ORDER", "ORDER", {
  targetId: ORDER,
});
const WELCOME = notice("5", "Welcome to Craves", "ACCOUNT", null, {
  createdAt: "2026-01-02T10:00:00Z",
});

function respond(routes: Record<string, () => Response>) {
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    if (!routes[key]) throw new Error(`Unexpected ${key}`);
    return routes[key]();
  });
}
const PAGE = "GET /api/notifications/in-app/page?limit=50&role=CHEF";

beforeEach(() => {
  fetcher.mockReset();
});
afterEach(cleanup);

describe("Chef notifications", () => {
  it("shows only kitchen notices and opens each one's page, marking it read", async () => {
    respond({
      [PAGE]: () => Response.json({ notices: [NEW_ORDER, PAYOUT, REVIEW, OWN_ORDER, WELCOME], nextCursor: null, hasMore: false }),
      [`PATCH /api/notifications/in-app/${NEW_ORDER.id}/read`]: () => new Response(null, { status: 204 }),
    });
    const read = vi.fn();
    window.addEventListener(NOTICES_READ_EVENT, read);
    render(createElement(ChefNotifications));
    const order = (await screen.findByText("New order received")).closest("a")!;
    expect(order.getAttribute("href")).toBe(`/chef/orders/${ORDER}`);
    expect(screen.getByText("Payout sent").closest("a")!.getAttribute("href")).toBe("/chef/earnings/payouts");
    expect(screen.getByText("New review").closest("a")!.getAttribute("href")).toBe("/chef/reviews");
    expect(screen.queryByText("Chef accepted your order")).toBeNull();
    expect(screen.getByText("Earlier")).toBeTruthy();
    fireEvent.click(order);
    expect(fetcher).toHaveBeenCalledWith(`/api/notifications/in-app/${NEW_ORDER.id}/read`, { method: "PATCH" });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    window.removeEventListener(NOTICES_READ_EVENT, read);
  });

  it("filters by Orders, Money and Reviews, with each one's unread count", async () => {
    respond({ [PAGE]: () => Response.json({ notices: [NEW_ORDER, PAYOUT, REVIEW], nextCursor: null, hasMore: false }) });
    render(createElement(ChefNotifications));
    await screen.findByText("New order received");
    const filters = within(screen.getByRole("group", { name: "Show notifications about" })).getAllByRole("button");
    expect(filters.map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual(["All", "Orders, 1 unread", "Money, 1 unread", "Reviews"]);
    fireEvent.click(filters[2]);
    expect(filters[2].getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("New order received")).toBeNull();
    expect(screen.getByText("Payout sent")).toBeTruthy();
    fireEvent.click(filters[3]);
    expect(screen.getByText("New review")).toBeTruthy();
    expect(screen.queryByText("Payout sent")).toBeNull();
  });

  it("marks each unread notice read on its own, never through read-all", async () => {
    respond({
      [PAGE]: () =>
        Response.json({ notices: [NEW_ORDER, PAYOUT], nextCursor: null, hasMore: false }),
      [`PATCH /api/notifications/in-app/${NEW_ORDER.id}/read`]: () =>
        new Response(null, { status: 204 }),
      [`PATCH /api/notifications/in-app/${PAYOUT.id}/read`]: () =>
        new Response(null, { status: 503 }),
    });
    render(createElement(ChefNotifications));
    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));
    expect(await screen.findByText("Some notifications could not be marked as read.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Money, 1 unread" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Orders" })).toBeTruthy();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("read-all"))).toBe(false);
  });

  it("loads the next page with the cursor", async () => {
    respond({
      [PAGE]: () => Response.json({ notices: [NEW_ORDER], nextCursor: "MjAyNi0x", hasMore: true }),
      [`${PAGE}&cursor=MjAyNi0x`]: () =>
        Response.json({ notices: [NEW_ORDER, PAYOUT], nextCursor: null, hasMore: false }),
    });
    render(createElement(ChefNotifications));
    expect(await screen.findByText("New order received")).toBeTruthy();
    // A filter with nothing on the pages so far still says so, above Load more.
    fireEvent.click(screen.getByRole("button", { name: "Reviews" }));
    expect(screen.getByText("No Reviews notifications")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Payout sent")).toBeTruthy();
    expect(screen.getAllByText("New order received")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("keeps today's list when the paged inbox is not live yet", async () => {
    respond({
      [PAGE]: () => Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }),
      "GET /api/notifications/in-app?limit=50": () => Response.json([NEW_ORDER, OWN_ORDER]),
    });
    render(createElement(ChefNotifications));
    expect(await screen.findByText("New order received")).toBeTruthy();
    expect(screen.queryByText("Chef accepted your order")).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("offers Try again when the notices did not load, and says when a filter is empty", async () => {
    let calls = 0;
    respond({
      [PAGE]: () =>
        ++calls === 1
          ? Response.json({ code: "NOTIFICATIONS_UNAVAILABLE" }, { status: 503 })
          : Response.json({ notices: [NEW_ORDER], nextCursor: null, hasMore: false }),
    });
    render(createElement(ChefNotifications));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("New order received")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reviews" }));
    expect(screen.getByText("No Reviews notifications")).toBeTruthy();
  });
});
