// @vitest-environment jsdom
// Home's money and reviews cards from synthetic service answers; no backend is contacted.
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChefModeDashboard } from "../components/chef-mode-dashboard";

vi.mock("next/navigation", () => ({ usePathname: () => "/chef", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const KITCHEN = "11111111-1111-4111-8111-111111111111";
const kitchen = { id: KITCHEN, kitchenName: "Fixture kitchen", displayName: null, description: null, phoneNumber: null, email: null, addressLine1: "Fixture house", addressLine2: null, landmark: null, areaName: null, city: "Fixture city", state: "Fixture state", postalCode: null, latitude: null, longitude: null, status: "INACTIVE", createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
const review = { reviewId: "22222222-2222-4222-8222-222222222222", kitchenId: KITCHEN, overallRating: 4, reviewText: "Lovely dal, just like home.", tagCodes: [], publishedAt: "2026-10-01T10:00:00Z" };
const balance = { available: "2384.76", outstanding: "0.00", reservedOrPaid: "0.00", onHold: false, manualRequestUsedToday: false, nextManualRequestAt: "2026-10-27T00:00:00Z", recentPayouts: [], executionEnabled: true, payoutMode: "CRAVES_MANUAL" };

function open({ bank = "VERIFIED", reviews = Response.json({ items: [review], nextCursor: null, hasMore: false }) }: { bank?: string; reviews?: Response } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/chef/application") return Response.json({ firstName: "Asha", lastName: "Fixture", status: "APPROVED" });
    if (url === "/api/chef/kitchen") return Response.json(kitchen);
    if (["/api/chef/menu", "/api/chef/orders", "/api/chef/earnings"].includes(url)) return Response.json([]);
    if (url === "/api/chef/finance/balance") return Response.json(balance);
    if (url === "/api/chef-onboarding/bank") return Response.json({ id: null, state: bank, lastFour: null, ifsc: null, bankValidated: false, applicationApproved: true, automaticActivation: true, message: "Fixture", updatedAt: null });
    if (url === "/api/chef/reviews?limit=1") return reviews;
    if (url === `/api/chef/reviews/kitchens/${KITCHEN}/summary`) return Response.json({ kitchenId: KITCHEN, reviewCount: 12, overallAverage: 4.6 });
    return Response.json({ code: "NOT_IN_FIXTURE" }, { status: 404 });
  }));
  render(createElement(ChefModeDashboard));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Home money and reviews", () => {
  it("shows the balance with Withdraw, the rating and the latest review", async () => {
    open();
    const money = await screen.findByRole("region", { name: "Available to withdraw" });
    expect(within(money).getByText("₹2,384.76")).toBeTruthy();
    expect(within(money).getByRole("link", { name: "Withdraw" }).getAttribute("href")).toBe("/chef/earnings");
    expect(screen.getByRole("link", { name: /^Rating\s*4\.6/ }).getAttribute("href")).toBe("/chef/reviews");
    const latest = screen.getByRole("region", { name: "Latest reviews" });
    expect(within(latest).getByRole("img", { name: "4 out of 5 stars" })).toBeTruthy();
    expect(within(latest).getByText("Lovely dal, just like home.")).toBeTruthy();
    expect(within(latest).getByRole("link", { name: "See all" }).getAttribute("href")).toBe("/chef/reviews");
  });

  it("asks for a bank account instead of Withdraw, and leaves reviews out until they are live", async () => {
    open({ bank: "SUPERSEDED", reviews: Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }) });
    const money = await screen.findByRole("region", { name: "Available to withdraw" });
    expect(within(money).getByRole("link", { name: "Add bank account" }).getAttribute("href")).toBe("/chef/bank");
    expect(screen.queryByRole("link", { name: /^Rating/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Latest reviews" })).toBeNull();
  });
});
