// @vitest-environment jsdom
// Synthetic group orders, kitchens and dishes; no backend is contacted.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const auth = vi.hoisted(() => ({ session: null as null | { id: string } }));
const cart = vi.hoisted(() => ({ loadCart: vi.fn(async () => []) }));
const ids = vi.hoisted(() => ({ ROTI: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", DAL: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/kitchen/x", useRouter: () => router }));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  getSession: () => auth.session,
  loadSession: async () => auth.session,
  subscribeSession: () => () => undefined,
}));
vi.mock("@/features/cart/api/cravesCart", () => ({ loadCart: cart.loadCart }));
vi.mock("@/shared/lib/kitchen-profile-client", () => ({ getKitchenProfile: async () => ({ displayName: null, kitchenName: "Lakshmi's Kitchen" }) }));
vi.mock("@/features/dish/api/dishes", () => ({
  loadKitchenMenu: async () => [
    { id: ids.ROTI, name: "Roti", price: 20 },
    { id: ids.DAL, name: "Dal tadka", price: 120 },
  ],
}));

import GroupOrderPage from "./GroupOrderPage";
import JoinGroupOrder from "./JoinGroupOrder";
import { StartGroupOrderButton } from "../components/StartGroupOrderButton";

const GROUP = "2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d";
const KITCHEN = "4b1c0000-0000-4000-8000-000000000001";
const ME = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const { ROTI } = ids;
const item = (menuItemId: string, itemName: string, quantity: number, unit = 2000) => ({ menuItemId, itemName, quantity, unitPricePaise: unit, lineTotalPaise: unit * quantity, note: null });
// The host is "you" unless the test reads as a member.
const host = (items: object[] = [], you = true) => ({ participantId: you ? ME : null, displayName: "Gopi", role: "HOST", you, items, subtotalPaise: 0 });
const friend = (items: object[] = [], participantId: string | null = FRIEND) => ({ participantId, displayName: "Ravi", role: "MEMBER", you: false, items, subtotalPaise: 0 });
const view = (extra: object = {}) => ({
  id: GROUP, kitchenId: KITCHEN, title: "Friday lunch", status: "OPEN", joinCode: "ABCD-EFGH", shareUrl: "https://craves.in/g/ABCD-EFGH",
  joinUntil: "2030-01-01T14:00:00Z", maxParticipants: 10, participantCount: 2, version: 3, youAreHost: true,
  participants: [host(), friend()], itemCount: 0, subtotalPaise: 0, createdAt: "2026-11-15T13:00:00Z", ...extra,
});

type Answer = (init: RequestInit) => Response;
let answers: Record<string, Answer | Answer[]>;
const calls: { key: string; init: RequestInit }[] = [];

beforeEach(() => {
  calls.length = 0;
  router.push.mockReset();
  cart.loadCart.mockClear();
  auth.session = { id: ME };
  answers = {};
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const key = `${init.method ?? "GET"} ${String(input)}`;
    calls.push({ key, init });
    const answer = answers[key];
    // A list of answers is used in turn; the last one repeats.
    const next = Array.isArray(answer) ? (answer.length > 1 ? answer.shift()! : answer[0]) : answer;
    return next ? next(init) : Response.json({ code: "NOT_STUBBED" }, { status: 500 });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const groupUrl = `/api/advanced/group-orders/${GROUP}`;
const sent = (init: RequestInit) => JSON.parse(String(init.body));
const locked = (extra: object = {}) => view({ status: "LOCKED", joinCode: null, shareUrl: null, participants: [host([item(ROTI, "Roti", 2)]), friend()], itemCount: 2, ...extra });

describe("starting a group order from a kitchen page", () => {
  it("starts one with a single attempt key and opens it", async () => {
    answers["POST /api/advanced/group-orders"] = () => Response.json(view(), { status: 201 });
    render(createElement(StartGroupOrderButton, { kitchenId: KITCHEN, kitchenName: "Lakshmi's Kitchen" }));
    fireEvent.click(screen.getByRole("button", { name: "Start a group order" }));
    expect(((await screen.findByLabelText("Name of the group order")) as HTMLInputElement).value).toBe("Order from Lakshmi's Kitchen");
    fireEvent.click(screen.getByRole("radio", { name: "2 hours" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the group order" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/group-orders/${GROUP}`));
    const create = calls.find((call) => call.key === "POST /api/advanced/group-orders")!;
    expect(sent(create.init)).toEqual({ kitchenId: KITCHEN, title: "Order from Lakshmi's Kitchen", joinWindowMinutes: 120 });
    expect(new Headers(create.init.headers).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends a guest to sign in and back to the kitchen", async () => {
    auth.session = null;
    render(createElement(StartGroupOrderButton, { kitchenId: KITCHEN, kitchenName: "Lakshmi's Kitchen" }));
    fireEvent.click(screen.getByRole("button", { name: "Start a group order" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/sign-in?returnTo=${encodeURIComponent(window.location.pathname)}`));
  });
});

describe("joining by link (craves.in/g/<code>)", () => {
  it("joins with the name the person chose and opens the group", async () => {
    answers["POST /api/advanced/group-orders/join"] = () => Response.json(view({ youAreHost: false }));
    render(createElement(JoinGroupOrder, { code: "ABCD-EFGH" }));
    fireEvent.change(await screen.findByLabelText(/Your name for the group/), { target: { value: " Ravi " } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/group-orders/${GROUP}`));
    expect(sent(calls.find((call) => call.key === "POST /api/advanced/group-orders/join")!.init)).toEqual({ code: "ABCD-EFGH", displayName: "Ravi" });
  });

  it("says plainly when the group is full", async () => {
    answers["POST /api/advanced/group-orders/join"] = () => Response.json({ code: "GROUP_FULL" }, { status: 409 });
    render(createElement(JoinGroupOrder, { code: "ABCD-EFGH" }));
    fireEvent.click(await screen.findByRole("button", { name: "Join" }));
    expect(await screen.findByRole("heading", { name: "This group order is full" })).toBeTruthy();
  });

  it("asks a guest to sign in, and never joins on its own", async () => {
    auth.session = null;
    render(createElement(JoinGroupOrder, { code: "ABCD-EFGH" }));
    const signIn = await screen.findByRole("link", { name: "Sign in to join" });
    expect(signIn.getAttribute("href")).toBe(`/sign-in?returnTo=${encodeURIComponent("/g/ABCD-EFGH")}`);
    expect(calls.some((call) => call.key.startsWith("POST"))).toBe(false);
  });
});

describe("a group order page", () => {
  it("adds a dish to the person's own share, steps it, and takes it out at zero", async () => {
    const me = (items: object[] = []) => ({ ...friend(items), you: true });
    answers[`GET ${groupUrl}`] = () => Response.json(view({ youAreHost: false, participants: [host([], false), me()] }));
    answers[`PUT ${groupUrl}/my-items/${ROTI}`] = (init) =>
      Response.json(view({ version: 4, youAreHost: false, participants: [host([], false), me([item(ROTI, "Roti", sent(init).quantity)])], itemCount: sent(init).quantity }));
    answers[`DELETE ${groupUrl}/my-items/${ROTI}`] = () => Response.json(view({ version: 6, youAreHost: false, participants: [host([], false), me()] }));
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Roti to your share" }));
    expect(await screen.findByText("1 × Roti")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("list", { name: "The kitchen's dishes" })).getByRole("button", { name: "Remove Roti from your share" }));
    await waitFor(() => expect(screen.queryByText("1 × Roti")).toBeNull());
    expect(calls.filter((call) => call.key.startsWith("PUT")).map((call) => sent(call.init))).toEqual([{ quantity: 1 }]);
  });

  it("shows the invite and lets the host lock it", async () => {
    answers[`GET ${groupUrl}`] = () => Response.json(view());
    answers[`POST ${groupUrl}/lock`] = () => Response.json(view({ status: "LOCKED", joinCode: null, shareUrl: null, version: 4 }));
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    expect(((await screen.findByLabelText("Group order link")) as HTMLInputElement).value).toBe("https://craves.in/g/ABCD-EFGH");
    fireEvent.click(screen.getByRole("button", { name: "Lock now" }));
    expect(await screen.findByRole("button", { name: "Send to my cart" })).toBeTruthy();
    expect(screen.queryByLabelText("Group order link")).toBeNull();
  });

  it("asks before replacing a cart that has other dishes, then opens the cart", async () => {
    answers[`GET ${groupUrl}`] = () => Response.json(locked());
    answers[`POST ${groupUrl}/checkout`] = [
      () => Response.json({ code: "HOST_CART_NOT_EMPTY" }, { status: 409 }),
      () => Response.json({ groupOrderId: GROUP, lines: [{ menuItemId: ROTI, itemName: "Roti", quantity: 2 }], subtotalPaise: 4000, appliedToCart: true, createdAt: "2026-11-15T14:00:00Z" }),
    ];
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to my cart" }));
    const replace = await screen.findByRole("button", { name: "Replace my cart" });
    expect(document.activeElement).toBe(replace);
    fireEvent.click(replace);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/cart"));
    expect(calls.filter((call) => call.key.endsWith("/checkout")).map((call) => sent(call.init))).toEqual([
      { applyToCart: true, replaceCart: false },
      { applyToCart: true, replaceCart: true },
    ]);
    expect(cart.loadCart).toHaveBeenCalled();
  });

  it("opens the cart when a send the site stopped waiting for did finish", async () => {
    answers[`GET ${groupUrl}`] = [() => Response.json(locked()), () => Response.json(view({ status: "CHECKED_OUT", joinCode: null, version: 5 }))];
    answers[`POST ${groupUrl}/checkout`] = () => Response.json({ code: "ADVANCED_UNAVAILABLE" }, { status: 503 });
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to my cart" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/cart"));
  });

  it("after a send that may have filled part of the cart, sends again replacing it", async () => {
    answers[`GET ${groupUrl}`] = () => Response.json(locked());
    answers[`POST ${groupUrl}/checkout`] = () => Response.json({ code: "CART_UNAVAILABLE" }, { status: 503 });
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to my cart" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/may hold part of the group's order/);
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    await waitFor(() => expect(calls.filter((call) => call.key.endsWith("/checkout"))).toHaveLength(2));
    expect(sent(calls.filter((call) => call.key.endsWith("/checkout"))[1].init)).toEqual({ applyToCart: true, replaceCart: true });
  });

  it("asks about the cart again when the service was too busy to send", async () => {
    answers[`GET ${groupUrl}`] = () => Response.json(locked());
    answers[`POST ${groupUrl}/checkout`] = () => Response.json({ code: "FEATURE_BUSY" }, { status: 503 });
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to my cart" }));
    expect((await screen.findByRole("alert")).textContent).not.toMatch(/may hold part/);
    expect(screen.getByRole("button", { name: "Send to my cart" })).toBeTruthy();
  });

  it("won't send more of one dish than the cart can hold, and names it", async () => {
    const third = { ...friend([item(ROTI, "Roti", 11)], "33333333-3333-4333-8333-333333333333"), displayName: "Asha" };
    answers[`GET ${groupUrl}`] = () => Response.json(locked({ participants: [host([item(ROTI, "Roti", 20)]), friend([item(ROTI, "Roti", 20)]), third], itemCount: 51 }));
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    expect(((await screen.findByRole("button", { name: "Send to my cart" })) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/51 × Roti is more than one order can hold \(50 of a dish\)/)).toBeTruthy();
  });

  it("lets a member leave after asking, and goes back to their group orders", async () => {
    answers[`GET ${groupUrl}`] = () => Response.json(view({ youAreHost: false, participants: [host([], false), { ...friend(), you: true }] }));
    answers[`POST ${groupUrl}/leave`] = () => new Response(null, { status: 204 });
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave group order" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/group-orders"));
  });

  it("says why when the host locked it meanwhile, and shows it locked", async () => {
    const member = { youAreHost: false, participants: [host([], false), { ...friend(), you: true }] };
    answers[`GET ${groupUrl}`] = [() => Response.json(view(member)), () => Response.json(view({ ...member, status: "LOCKED", joinCode: null, version: 4 }))];
    answers[`PUT ${groupUrl}/my-items/${ROTI}`] = () => Response.json({ code: "GROUP_LOCKED" }, { status: 409 });
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Roti to your share" }));
    expect(await screen.findByText(/The host can send it to their cart/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Roti to your share" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/host has locked this group order/);
  });

  it("looks again every 20 s while in view, never lets an older answer replace a newer one, and stops when hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answers[`GET ${groupUrl}`] = [() => Response.json(view()), () => Response.json(view({ version: 2, title: "Older" })), () => Response.json(view({ version: 7, title: "Friday dinner" }))];
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    expect(await screen.findByRole("heading", { name: "Friday lunch" })).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(screen.getByRole("heading", { name: "Friday lunch" })).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(await screen.findByRole("heading", { name: "Friday dinner" })).toBeTruthy();
    const reads = calls.filter((call) => call.key === `GET ${groupUrl}`).length;
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    try {
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(calls.filter((call) => call.key === `GET ${groupUrl}`)).toHaveLength(reads);
    } finally {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    }
  });

  it("tells someone who was removed that they're not in the group any more", async () => {
    answers[`GET ${groupUrl}`] = () => Response.json({ code: "GROUP_NOT_FOUND" }, { status: 404 });
    render(createElement(GroupOrderPage, { groupId: GROUP }));
    expect(await screen.findByRole("heading", { name: "You're not in this group order" })).toBeTruthy();
  });
});
