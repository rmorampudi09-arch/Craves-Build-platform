// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminRiderAttention } from "./rider-attention";

let answer: (path: string) => Response;
vi.mock("@/features/admin/shell/lib/admin-renewal", () => ({
  adminFetch: async (input: RequestInfo | URL) => answer(String(input).replace("/api/admin/fleet/", "")),
}));

const at = "2026-10-30T06:30:00Z";
const RIDER = "11111111-1111-4111-8111-111111111111";
const json = (body: unknown, status = 200) => Response.json(body, { status });
const issue = { issueId: "22222222-2222-4222-8222-222222222222", riderId: RIDER, riderName: "Ravi Kumar", tripId: null, category: "MISSING_PAY", text: "Pay missing", state: "OPEN", createdAt: at, acknowledgeBy: at, fixBy: at };
const sos = { sosId: "33333333-3333-4333-8333-333333333333", riderId: RIDER, riderName: "Ravi Kumar", phoneMasked: "+91 98xxxxx210", at, lat: null, lng: null, tripId: null };

afterEach(cleanup);

describe("riders on the overview", () => {
  it("says what riders are waiting for and links each queue, like the chef box", async () => {
    answer = path => path.startsWith("riders?") ? json({ riders: [], nextCursor: null, counts: { REVIEW: 2, ACTIVE: 9 } })
      : path.startsWith("selfie-reviews") ? json({ items: [] })
        : path.startsWith("support-issues") ? json({ issues: [issue] }) : json({ events: [sos] });
    render(createElement(AdminRiderAttention));
    expect(await screen.findByRole("heading", { name: "Riders are waiting for you" })).toBeTruthy();
    const link = (text: RegExp) => screen.getByRole("link", { name: text }).getAttribute("href");
    expect(link(/2 rider applications waiting for review/)).toBe("/admin/riders");
    expect(link(/0 go-online selfies to check/)).toBe("/admin/riders/selfies");
    expect(link(/1 rider problem open/)).toBe("/admin/fleet-support");
    expect(screen.getByText("1 SOS press in the last 7 days. Acknowledge problems within 24 hours.")).toBeTruthy();
  });

  it("stays out of the way when the rider queue can't be read", async () => {
    answer = () => json({ code: "FORBIDDEN", message: "Your admin role can't do this." }, 403);
    const { container } = render(createElement(AdminRiderAttention));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
  });

  it("keeps the applications row when only the other lists fail", async () => {
    answer = path => path.startsWith("riders?") ? json({ riders: [], nextCursor: null, counts: {} }) : json({ code: "DOWN", message: "down" }, 503);
    render(createElement(AdminRiderAttention));
    expect(await screen.findByRole("heading", { name: "No riders are waiting" })).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
