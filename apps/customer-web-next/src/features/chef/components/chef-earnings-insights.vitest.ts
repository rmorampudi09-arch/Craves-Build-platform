// @vitest-environment jsdom
// Synthetic orders and payouts; no backend is contacted.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChefEarning } from "@/features/chef/lib/chef-earnings-contract";
import { ChefEarningsInsights } from "./chef-earnings-insights";
import { ChefMoneyLinks } from "./chef-money-links";
import { ChefPayoutHistory } from "./chef-payout-history";
import { ChefWithdrawalPanel } from "./chef-withdrawal-panel";

vi.mock("next/link", () => ({ default: (props: { href: string; children?: unknown }) => createElement("a", { href: props.href }, props.children as never) }));

const ORDER_ID = "7f6392a6-1111-4222-8333-444444444444";
const earning = (createdAt: string, netPayable: number): ChefEarning => ({
  id: crypto.randomUUID(),
  orderId: ORDER_ID,
  orderSource: "ON_DEMAND",
  currency: "INR",
  grossAmount: netPayable,
  commissionAmount: 0,
  taxWithheldAmount: 0,
  adjustmentAmount: 0,
  netPayable,
  allocationReference: "ref",
  status: "APPROVED",
  reason: "",
  approvedAt: null,
  reversedAt: null,
  createdAt,
  updatedAt: createdAt,
});
const order = {
  id: ORDER_ID,
  kitchenName: "Home Kitchen",
  status: "DELIVERED",
  currency: "INR",
  foodSubtotal: 360,
  platformFee: 0,
  taxAmount: 0,
  deliveryFee: 0,
  grandTotal: 360,
  items: [
    {
      id: "8f000000-0000-4000-8000-000000000001",
      menuItemId: "9f000000-0000-4000-8000-000000000001",
      itemName: "Chicken biryani",
      unitPrice: 180,
      quantity: 2,
      lineTotal: 360,
    },
  ],
  createdAt: "2026-10-14T05:00:00Z",
  updatedAt: "2026-10-14T06:00:00Z",
};
const routes = vi.fn<(path: string) => Response>();

beforeEach(() => {
  routes.mockReset();
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-15T04:30:00Z") });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => routes(path)),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("earnings insights", () => {
  it("sums the week, compares it, and lists a day's orders from its bar", async () => {
    routes.mockImplementation((path) =>
      path === "/api/chef/orders"
        ? Response.json([order])
        : path.startsWith("/api/chef/orders/page")
          ? Response.json({ orders: [], nextCursor: null, hasMore: false })
          : Response.json([]),
    );
    const entries = [earning("2026-10-14T06:00:00Z", 300), earning("2026-10-05T06:00:00Z", 200)];
    render(
      createElement(ChefEarningsInsights, {
        entries,
        loading: false,
        failed: false,
        onRetry: vi.fn(),
      }),
    );
    expect(await screen.findAllByText("₹300.00")).toHaveLength(2); // earned and the average order
    expect(screen.getByText("50% vs last week")).toBeTruthy();
    expect(screen.getByText("Chicken biryani")).toBeTruthy();
    expect(screen.getByText("2 sold")).toBeTruthy();
    expect(screen.getByText("Showing your latest orders only.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Yesterday, ₹300.00" }));
    const sheet = await screen.findByRole("dialog", { name: "Orders · Yesterday" });
    expect(within(sheet).getByRole("link").getAttribute("href")).toBe(`/chef/orders/${ORDER_ID}`);
    expect(within(sheet).getByText("#7F6392A6")).toBeTruthy();
  });

  it("switches period and keeps working when older orders are not published", async () => {
    routes.mockImplementation((path) =>
      path === "/api/chef/orders"
        ? Response.json([])
        : path.startsWith("/api/chef/orders/page")
          ? Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 })
          : Response.json([]),
    );
    render(
      createElement(ChefEarningsInsights, {
        entries: [earning("2026-10-01T06:00:00Z", 120)],
        loading: false,
        failed: false,
        onRetry: vi.fn(),
      }),
    );
    expect(await screen.findByText("No sales this week")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(screen.getAllByText("₹120.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Orders this month")).toBeTruthy();
  });

  it("asks to try again when the orders don't load", async () => {
    routes.mockImplementation(() =>
      Response.json({ code: "CHEF_ORDERS_REQUEST_FAILED" }, { status: 503 }),
    );
    render(
      createElement(ChefEarningsInsights, {
        entries: [],
        loading: false,
        failed: false,
        onRetry: vi.fn(),
      }),
    );
    expect(await screen.findByText("We couldn’t load your orders.")).toBeTruthy();
  });
});

describe("payout history", () => {
  const payout = (
    id: string,
    createdAt: string,
    status: string,
    transferReference: string | null,
  ) => ({
    id,
    amount: "1250.00",
    mode: "MANUAL",
    status,
    payoutChannel: "CRAVES_MANUAL",
    providerStatus: null,
    transferReference,
    createdAt,
  });
  const balance = (recentPayouts: unknown[]) => ({
    available: "0.00",
    outstanding: "0.00",
    reservedOrPaid: "0.00",
    onHold: false,
    manualRequestUsedToday: false,
    nextManualRequestAt: "2026-10-16T00:00:00Z",
    recentPayouts,
    executionEnabled: true,
    payoutMode: "CRAVES_MANUAL",
  });

  it("groups payouts by month and opens the details", async () => {
    routes.mockReturnValue(
      Response.json(
        balance([
          payout("a1000000-0000-4000-8000-000000000001", "2026-09-20T08:00:00Z", "FAILED", null),
          payout("a1000000-0000-4000-8000-000000000002", "2026-10-15T03:00:00Z", "PAID", "UTR123"),
        ]),
      ),
    );
    render(createElement(ChefPayoutHistory));
    const [october, september] = await screen.findAllByRole("heading", { level: 2 });
    expect([october.textContent, september.textContent]).toEqual(["October", "September"]);
    fireEvent.click(screen.getByText("Requested today, 8:30 am").closest("button")!);
    const sheet = await screen.findByRole("dialog", { name: "Payout details" });
    expect(within(sheet).getByText("UTR123")).toBeTruthy();
    expect(within(sheet).getByText("The money has reached your bank.")).toBeTruthy();
  });

  it("shows the empty and failed states", async () => {
    routes.mockReturnValue(Response.json(balance([])));
    render(createElement(ChefPayoutHistory));
    expect(await screen.findByText("No payouts yet")).toBeTruthy();
    cleanup();
    routes.mockReturnValue(Response.json({ code: "FINANCE_UNAVAILABLE" }, { status: 503 }));
    render(createElement(ChefPayoutHistory));
    expect(await screen.findByText("We couldn’t load your payouts.")).toBeTruthy();
  });
});

describe("balance card and money rows", () => {
  const balance = (onHold: boolean) => ({
    available: "500.00",
    outstanding: "500.00",
    reservedOrPaid: "0.00",
    onHold,
    manualRequestUsedToday: false,
    nextManualRequestAt: "2026-10-16T00:00:00Z",
    recentPayouts: [],
    executionEnabled: true,
    payoutMode: "CRAVES_MANUAL",
  });
  const bank = (state: string, lastFour: string | null = null) => ({
    id: null,
    state,
    lastFour,
    ifsc: null,
    bankValidated: false,
    applicationApproved: true,
    automaticActivation: true,
    message: "",
    updatedAt: null,
  });
  // `account` null: the bank account can't be read.
  const serve = (onHold: boolean, account: unknown) =>
    routes.mockImplementation((path) =>
      path === "/api/chef/finance/balance"
        ? Response.json(balance(onHold))
        : path === "/api/chef-onboarding/bank"
          ? account
            ? Response.json(account)
            : Response.json({ code: "BANK_UNAVAILABLE" }, { status: 503 })
          : Response.json([]),
    );

  it.each([
    ["NOT_SUBMITTED", "Add your bank account to get paid.", "Add bank account"],
    ["VALIDATION_FAILED", "Your bank account needs your attention.", "Bank account"],
  ])("a hold with the bank %s says what to do", async (state, words, link) => {
    serve(true, bank(state));
    render(createElement(ChefWithdrawalPanel));
    expect(await screen.findByText(words)).toBeTruthy();
    expect(screen.getByRole("link", { name: link }).getAttribute("href")).toBe("/chef/bank");
    expect(screen.queryByText(/payouts are on hold/)).toBeNull();
  });

  it("a hold while the bank is checked says so; an unknown reason sends the chef to support", async () => {
    serve(true, bank("VALIDATING", "1234"));
    render(createElement(ChefWithdrawalPanel));
    expect(await screen.findByText("Your bank account is being checked. Payouts start once it is checked.")).toBeTruthy();
    cleanup();
    serve(true, null);
    render(createElement(ChefWithdrawalPanel));
    expect(await screen.findByText("Your payouts are on hold.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Help & support" }).getAttribute("href")).toBe("/chef/support");
  });

  it("the Earnings tab's card keeps the balance and its button, and links to the rest", async () => {
    serve(false, bank("VERIFIED", "1234"));
    render(createElement(ChefWithdrawalPanel, { compact: true }));
    expect(await screen.findByRole("button", { name: "Withdraw ₹500.00" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Payouts and how it’s worked out" }).getAttribute("href")).toBe("/chef/finance");
    expect(screen.queryByText("Money sent to your bank")).toBeNull();
    expect(screen.queryByText("How your balance is worked out")).toBeNull();
    expect(screen.queryByRole("button", { name: "Check balance again" })).toBeNull();
  });

  it("an account that isn't verified stops Withdraw and says what to do, even without a hold", async () => {
    serve(false, bank("NOT_SUBMITTED"));
    render(createElement(ChefWithdrawalPanel, { compact: true }));
    expect(await screen.findByText("Add your bank account to get paid.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Withdraw ₹500.00" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    [bank("NOT_SUBMITTED"), "Not added yet"],
    [bank("VERIFIED", "1234"), "••1234"],
    [null, "Where Craves sends your money"],
  ])("the bank row says where the money goes (%#)", async (account, meta) => {
    serve(false, account);
    render(createElement(ChefMoneyLinks));
    const row = screen.getByRole("link", { name: /Bank account/ });
    expect(row.getAttribute("href")).toBe("/chef/bank");
    await waitFor(() => expect(routes.mock.calls.some(([path]) => path === "/api/chef-onboarding/bank")).toBe(true));
    await waitFor(() => expect(row.textContent).toContain(meta));
  });
});

describe("withdraw", () => {
  const balance = {
    available: "500.00",
    outstanding: "500.00",
    reservedOrPaid: "0.00",
    onHold: false,
    manualRequestUsedToday: false,
    nextManualRequestAt: "2026-10-16T00:00:00Z",
    recentPayouts: [],
    executionEnabled: true,
    payoutMode: "CRAVES_MANUAL",
  };
  const verified = {
    id: "b1000000-0000-4000-8000-000000000001",
    state: "VERIFIED",
    lastFour: "1234",
    ifsc: "HDFC0000123",
    bankValidated: true,
    applicationApproved: true,
    automaticActivation: true,
    accountHolderName: "Lakshmi Devi",
    bankName: "HDFC Bank",
    branchName: null,
    message: "",
    updatedAt: null,
  };
  const payout = {
    id: "a1000000-0000-4000-8000-000000000009",
    amount: "500.00",
    mode: "MANUAL",
    status: "RESERVED",
    payoutChannel: "CRAVES_MANUAL",
    providerStatus: null,
    transferReference: null,
    createdAt: "2026-10-15T04:30:00Z",
  };
  // Each withdrawal answer in turn; the balance and the bank account answer as above.
  function serve(...answers: (() => Response)[]) {
    routes.mockImplementation((path) =>
      path === "/api/chef/finance/withdrawals"
        ? answers.shift()!()
        : path === "/api/chef-onboarding/bank"
          ? Response.json(verified)
          : Response.json(balance),
    );
  }
  const sent = () =>
    vi.mocked(fetch).mock.calls
      .filter(([path]) => path === "/api/chef/finance/withdrawals")
      .map(([, init]) => JSON.parse(String(init?.body)) as { requestKey: string; expectedAvailableAmount: string });
  async function openConfirm() {
    const main = await screen.findByRole("button", { name: "Withdraw ₹500.00" });
    await waitFor(() => expect(routes.mock.calls.some(([path]) => path === "/api/chef-onboarding/bank")).toBe(true));
    fireEvent.click(main);
    return screen.findByRole("dialog", { name: "Withdraw to your bank" });
  }

  it("asks first, naming the bank, account and holder, then sends one request however often it is tapped", async () => {
    let answer!: (response: Response) => void;
    serve(() => new Promise<Response>((resolve) => (answer = resolve)) as unknown as Response);
    render(createElement(ChefWithdrawalPanel, { compact: true }));
    const sheet = await openConfirm();
    expect(sent()).toHaveLength(0);
    await waitFor(() => expect(within(sheet).getByText("HDFC Bank")).toBeTruthy());
    expect(within(sheet).getByText("Account ••1234 · Lakshmi Devi")).toBeTruthy();
    expect(within(sheet).getByText("Verified")).toBeTruthy();
    const confirm = within(sheet).getByRole("button", { name: "Withdraw ₹500.00" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0].expectedAvailableAmount).toBe("500.00");
    answer(Response.json(payout));
    expect(await screen.findByText("₹500.00 is on its way")).toBeTruthy();
    expect(screen.getByText("Sent to HDFC Bank ••1234. Track it in Payout history.")).toBeTruthy();
    expect(sent()).toHaveLength(1);
  });

  it("an unknown outcome locks Withdraw; Check withdrawal status sends the same request again", async () => {
    serve(
      () => Response.json({ code: "FINANCE_UNAVAILABLE" }, { status: 503 }),
      () => Response.json(payout),
    );
    render(createElement(ChefWithdrawalPanel, { compact: true }));
    const sheet = await openConfirm();
    fireEvent.click(within(sheet).getByRole("button", { name: "Withdraw ₹500.00" }));
    expect(await screen.findByText("We couldn’t confirm your withdrawal")).toBeTruthy();
    expect(screen.getByText("Please don’t ask again. Check its status first.")).toBeTruthy();
    // The sheet has closed (its exit animation over), and Withdraw stays off until the request is checked.
    await waitFor(() => expect((screen.getByRole("button", { name: "Withdraw ₹500.00" }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Check withdrawal status" }));
    expect(await screen.findByText("₹500.00 is on its way")).toBeTruthy();
    const [first, again] = sent();
    expect(again).toEqual(first);
  });

  it("a clear no says why and lets a new request start with a new key", async () => {
    serve(
      () => Response.json({ code: "FINANCE_REQUEST_REJECTED" }, { status: 409 }),
      () => Response.json(payout),
    );
    render(createElement(ChefWithdrawalPanel, { compact: true }));
    fireEvent.click(within(await openConfirm()).getByRole("button", { name: "Withdraw ₹500.00" }));
    expect(await screen.findByText("Your withdrawal didn’t go through")).toBeTruthy();
    expect(screen.getByText(/^Your balance changed\. Check the amount and try again\./)).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "Withdraw ₹500.00" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(await openConfirm()).getByRole("button", { name: "Withdraw ₹500.00" }));
    expect(await screen.findByText("₹500.00 is on its way")).toBeTruthy();
    const [first, second] = sent();
    expect(second.requestKey).not.toBe(first.requestKey);
  });
});
