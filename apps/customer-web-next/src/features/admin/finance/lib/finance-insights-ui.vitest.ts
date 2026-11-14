// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceWorkspace } from "../components/finance-workspace";

const CHEF = "0c1e0000-1111-4222-8333-444455556666", CHECKOUT = "0bde0000-1111-4222-8333-444455556666", ORDER = "1a2b3c4d-1111-4222-8333-444455556666";
const id = (n: number) => `0000000${n}-1111-4222-8333-444455556666`;
const reads: URLSearchParams[] = [];
let answer: (view: string, query: URLSearchParams) => Response;
vi.mock("@/features/admin/shell/lib/admin-renewal", () => ({
  adminFetch: async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://admin.craves.in");
    if (url.pathname === "/api/admin/subscription-plans/chefs") return Response.json([{ identityId: CHEF, displayName: "Lakshmi’s Kitchen" }]);
    reads.push(url.searchParams);
    return answer(url.searchParams.get("view") ?? "", url.searchParams);
  },
}));

const position = { readyToPay: "7420.50", onHold: "0.00", notYetDue: "1240.25", inProgress: "0.00", chefsToPay: 1, chefsOnHold: 0 };
const overview = { from: "2026-11-13", to: "2026-11-14", generatedAt: "2026-11-14T03:00:00Z",
  totals: { customerPaid: "426403.00", customerPayments: 412, refunded: "1047.00", refunds: 3, chefEarned: "209391.00", chefOrders: 398, chefPaid: "316120.00", chefPayouts: 10, riderPaid: "9200.00", riderPayouts: 5 },
  days: [{ day: "2026-11-13", customerPaid: "200000.00", refunded: "1047.00", chefEarned: "100000.00", chefPaid: "316120.00", riderPaid: "0.00" },
    { day: "2026-11-14", customerPaid: "226403.00", refunded: "0.00", chefEarned: "109391.00", chefPaid: "0.00", riderPaid: "9200.00" }],
  split: { delivered: "268450.00", chefs: "209391.00", cravesFees: "15760.40", deliveryCharges: "15522.00", gst: "27776.60", tdsHeld: "0.00", other: "0.00" },
  position, attention: { payoutsToConfirm: 1, payoutsFailed: 0, refundsStuck: 2, ordersToReview: 0, riderPayoutsOpen: 0 },
  recording: { on: true, paymentsRecorded: 412, earningsRecorded: 398, lastEarningAt: "2026-11-14T02:00:00Z", payoutMode: "CRAVES_MANUAL" } };
const row = (kind: string, n: number, amount: string, status: string, extra: object = {}) => ({ kind, id: id(n), at: `2026-11-14T0${n}:00:00Z`, amount, status, reference: null, channel: null,
  providerReference: null, partyType: "CUSTOMER", partyId: null, partyName: null, checkoutId: CHECKOUT, chefOrderId: null, ...extra });
const rows = [
  row("CUSTOMER_PAYMENT", 1, "458.00", "PAID", { reference: "CRV-PAY-1", providerReference: "pay_1" }),
  row("CHEF_EARNING", 2, "338.52", "RECORDED", { partyType: "CHEF", partyId: CHEF, chefOrderId: ORDER }),
  row("CUSTOMER_PAYMENT", 3, "289.00", "FAILED", { checkoutId: id(9) }),
  row("CHEF_PAYOUT", 4, "12860.00", "PAID", { partyType: "CHEF", partyId: CHEF, reference: "UTR406317998120", checkoutId: null }),
];
const page = (items = rows) => ({ items, nextCursor: null, summary: [{ kind: "CUSTOMER_PAYMENT", count: 2, amount: "747.00" }, { kind: "CHEF_EARNING", count: 1, amount: "338.52" }, { kind: "CHEF_PAYOUT", count: 1, amount: "12860.00" }] });
const trail = { checkoutId: CHECKOUT, customerId: null, refunds: [], journal: [],
  payments: [{ id: id(1), reference: "CRV-PAY-1", provider: "RAZORPAY", providerOrderId: null, providerPaymentId: "pay_1", amount: "458.00", status: "PAID", providerStatus: "captured",
    createdAt: "2026-11-14T01:00:00Z", updatedAt: "2026-11-14T01:01:00Z", recordedAt: "2026-11-14T01:02:00Z" }],
  orders: [{ chefOrderId: ORDER, chefId: CHEF, kitchenId: null, state: "DELIVERED", lastResult: "POSTED", deliveredAt: "2026-11-14T02:00:00Z", earningRecordedAt: "2026-11-14T02:01:00Z",
    payAvailableAt: "2026-11-14T02:01:00Z", payout: null, delivery: null,
    split: { customerTotal: "458.00", customerFood: "369.00", delivery: "39.00", platformFee: "21.21", foodGst: "18.45", deliveryGst: "7.02", platformGst: "3.32",
      chefGross: "369.00", chefServiceFee: "25.83", chefFeeGst: "4.65", withholding: "0.00", chefPayable: "338.52" } }] };
const chefs = { generatedAt: "2026-11-14T03:00:00Z", payoutMode: "CRAVES_MANUAL", position,
  chefs: [{ chefId: CHEF, orders: 86, due: "7420.50", notYetDue: "1240.25", inProgress: "0.00", paid: "58240.00", lastPaidAt: "2026-11-13T18:00:00Z", onHold: false, holdReason: null }] };
const balance = { chefIdentityId: CHEF, available: "7420.50", onHold: false, enabled: true, manualRequestUsedToday: false, recent: [] };
const happy = (view: string) => Response.json({ overview, transactions: page(), order: trail, chefs }[view] ?? {});
const show = (initial: Partial<{ tab: "overview" | "transactions" | "payouts" | "settings"; search: string }> = {}) =>
  render(createElement(FinanceWorkspace, { initial: { tab: "overview", from: "", to: "", search: "", ...initial }, taxProfiles: null }));
const last = (view: string) => reads.filter(query => query.get("view") === view).at(-1);

beforeEach(() => { reads.length = 0; answer = happy; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Finance overview", () => {
  it("states what came in, what went out and what Craves earned, to the paisa", async () => {
    show();
    const earned = (await screen.findByText("Craves earned")).closest(".fn-line") as HTMLElement;
    expect(within(earned).getByText("₹15,760.40")).toBeTruthy();
    expect(within(screen.getByText("Kept after refunds").closest(".fn-line") as HTMLElement).getByText("₹4,25,356.00")).toBeTruthy();
    expect(within(screen.getByText("Paid out").closest(".fn-line") as HTMLElement).getByText("₹3,25,320.00")).toBeTruthy();
    const todo = screen.getAllByRole("listitem").map(item => item.textContent);
    expect(todo).toEqual(["1 chef payout set aside or waiting for the bank’s answer", "2 refunds failed, stuck or open for over a day"]);
    expect(screen.getByText(/so this is not profit/)).toBeTruthy();
  });
  it("shows a failed read as a failure, never as zero rupees", async () => {
    answer = () => Response.json({ code: "FINANCE_UNAVAILABLE" }, { status: 503 });
    show();
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't be loaded");
    expect(screen.queryByText("Craves earned")).toBeNull(); expect(document.body.textContent).not.toContain("₹0.00");
  });
  it("says so when earnings are not being recorded, instead of leaving empty figures unexplained", async () => {
    answer = () => Response.json({ ...overview, recording: { ...overview.recording, on: false, earningsRecorded: 0, lastEarningAt: null } });
    show();
    expect(await screen.findByText(/Recording of chef earnings is switched off/)).toBeTruthy();
  });
  it("opens the rows behind a figure", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Customers paid/ }));
    await screen.findByRole("table");
    expect(last("transactions")?.get("kind")).toBe("CUSTOMER_PAYMENT"); expect(last("transactions")?.get("status")).toBe("PAID");
    expect(screen.getByRole("tab", { name: "Transactions" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("Finance transactions", () => {
  const amount = (label: RegExp) => (screen.getByRole("button", { name: label }).closest("tr") as HTMLElement).querySelector(".fn-amount")?.textContent;
  it("lists every kind of movement with a sign only where money moved", async () => {
    show({ tab: "transactions" });
    await screen.findByRole("table");
    expect(amount(/^Customer payment, Paid/)).toBe("+₹458.00");
    expect(amount(/^Customer payment, Failed/)).toBe("₹289.00");
    expect(amount(/^Chef earning, Earned/)).toBe("₹338.52");
    expect(amount(/^Chef payout, Paid/)).toBe("−₹12,860.00");
    expect(screen.getAllByText("Lakshmi’s Kitchen").length).toBe(2);
    expect(screen.getByText("Order #1A2B3C4D")).toBeTruthy();
  });
  it("follows an order's money when its row is chosen", async () => {
    show({ tab: "transactions" });
    fireEvent.click(await screen.findByRole("button", { name: /^Chef earning, Earned/ }));
    const pane = await screen.findByRole("complementary", { name: "Money trail" });
    await within(pane).findByText("Customer paid ₹458.00");
    expect(last("order")?.get("id")).toBe(CHECKOUT);
    expect(within(pane).getByText("Chef earned ₹338.52")).toBeTruthy();
    expect(within(pane).getByText("Not paid to the chef yet")).toBeTruthy();
    expect(within(pane).getByText("Lakshmi’s Kitchen · order #1A2B3C4D")).toBeTruthy();
    // Both rows of that checkout are marked, the failed payment of another checkout is not.
    expect(screen.getByRole("button", { name: /^Customer payment, Paid/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Customer payment, Failed/ }).getAttribute("aria-pressed")).toBe("false");
  });
  it("finds by the order number people quote, on any date, and opens a single match", async () => {
    answer = (view, query) => view === "transactions" && query.get("search") ? Response.json(page([rows[1]])) : happy(view);
    show();
    fireEvent.change(await screen.findByRole("searchbox", { name: "Find an order, payment or bank reference" }), { target: { value: " #1A2B3C4D " } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    await within(await screen.findByRole("complementary", { name: "Money trail" })).findByText("Chef earned ₹338.52");
    const search = reads.find(query => query.get("search"));
    expect(search?.get("search")).toBe("1A2B3C4D"); expect(search?.has("from")).toBe(false); expect(search?.has("to")).toBe(false);
    expect(screen.getByText(/on any date/)).toBeTruthy();
  });
  it("refuses a search it cannot run without asking the server", async () => {
    show({ tab: "transactions" });
    await screen.findByRole("table");
    const before = reads.length;
    fireEvent.change(screen.getByRole("searchbox", { name: "Find an order, payment or bank reference" }), { target: { value: "a b" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    expect((await screen.findByRole("alert")).textContent).toContain("order number like #1A2B3C4D");
    expect(reads.length).toBe(before);
  });
  it("tells a failed list apart from an empty one", async () => {
    answer = view => view === "transactions" ? Response.json({}, { status: 503 }) : happy(view);
    const failed = show({ tab: "transactions" });
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't be loaded");
    expect(screen.queryByText("No money moved in this period")).toBeNull();
    failed.unmount();
    answer = view => view === "transactions" ? Response.json({ items: [], nextCursor: null, summary: [] }) : happy(view);
    show({ tab: "transactions" });
    expect(await screen.findByText("No money moved in this period")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not show an answer of the wrong shape", async () => {
    answer = view => view === "transactions" ? Response.json(page([{ ...rows[0], amount: 458 } as never])) : happy(view);
    show({ tab: "transactions" });
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't be checked");
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("Finance payouts", () => {
  it("shows what each chef is owed and asks for a reason before setting money aside", async () => {
    const posts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => { if (init.method === "POST") posts.push(url); return Response.json(balance); }));
    show({ tab: "payouts" });
    fireEvent.click(await screen.findByRole("button", { name: /Lakshmi’s Kitchen/ }));
    const pane = await screen.findByRole("complementary", { name: "Payouts for Lakshmi’s Kitchen" });
    const setAside = await within(pane).findByRole("button", { name: "Set aside ₹7,420.50 for this chef" });
    fireEvent.click(setAside);
    expect(await within(pane).findByText(/First write why this payout is being made/)).toBeTruthy();
    expect(posts).toEqual([]);
    fireEvent.change(within(pane).getByLabelText(/^Why this step is being taken/), { target: { value: "Weekly payout" } });
    fireEvent.click(setAside);
    await waitFor(() => expect(posts).toEqual([`/api/admin/finance/chefs/${CHEF}/manual-settlements`]));
  });
  it("keeps chefs with nothing owed out of the list until they are searched for, so a hold can still be placed", async () => {
    const idle = { ...chefs.chefs[0], chefId: id(7), orders: 0, due: "0.00", notYetDue: "0.00", paid: "0.00", lastPaidAt: null };
    answer = view => view === "chefs" ? Response.json({ ...chefs, chefs: [chefs.chefs[0], idle] }) : happy(view);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...balance, chefIdentityId: idle.chefId, available: "0.00" })));
    show({ tab: "payouts" });
    await screen.findByRole("button", { name: /Lakshmi’s Kitchen/ });
    expect(screen.queryByRole("button", { name: /Chef 00000007/ })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a chef by name" }), { target: { value: "chef 0000" } });
    fireEvent.click(await screen.findByRole("button", { name: /Chef 00000007/ }));
    expect(await screen.findByText("Hold or release this chef’s payouts")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Lakshmi’s Kitchen/ })).toBeNull();
  });
  it("says when the list could not be loaded", async () => {
    answer = () => Response.json({}, { status: 403 });
    show({ tab: "payouts" });
    expect((await screen.findByRole("alert")).textContent).toContain("can't open Finance");
  });
  it("keeps a held chef's money out of what is ready to pay", async () => {
    answer = view => view === "chefs" ? Response.json({ ...chefs, position: { ...position, readyToPay: "0.00", onHold: "7420.50", chefsToPay: 0, chefsOnHold: 1 },
      chefs: [{ ...chefs.chefs[0], onHold: true, holdReason: "Bank outcome not known" }] }) : happy(view);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...balance, onHold: true, available: "0.00" })));
    show({ tab: "payouts" });
    fireEvent.click(await screen.findByRole("button", { name: /Lakshmi’s Kitchen/ }));
    expect(await screen.findByText("On hold: Bank outcome not known")).toBeTruthy();
    expect(within(screen.getByText("Ready to pay", { selector: "dt" }).parentElement as HTMLElement).getByText("₹0.00")).toBeTruthy();
  });
});
