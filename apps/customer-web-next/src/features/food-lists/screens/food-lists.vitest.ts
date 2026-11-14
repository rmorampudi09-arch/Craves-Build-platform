// @vitest-environment jsdom
// Synthetic lists and dishes; no backend is contacted.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const auth = vi.hoisted(() => ({ session: null as null | { id: string } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/l/x", useRouter: () => router }));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  getSession: () => auth.session,
  loadSession: async () => auth.session,
  subscribeSession: () => () => undefined,
}));

import SharedFoodList from "./SharedFoodList";
import MyFoodLists from "./MyFoodLists";
import FoodListPage from "./FoodListPage";
import { SaveToListButton } from "../components/SaveToListButton";
import { newAttemptKey } from "@/shared/lib/advanced-client";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCde";
const LIST = "8f0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const DISH = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const NOW = "2026-11-14T10:00:00Z";
const item = { menuItemId: DISH, itemName: "Lakshmi's Thali", kitchenId: null, note: null, position: 0, addedAt: NOW, availability: "AVAILABLE", pricePaise: 18000 };
const shared = { name: "Sunday lunch", description: "For when Amma visits", itemCount: 1, items: [item] };
const detail = { id: LIST, name: "Sunday lunch", description: null, itemCount: 1, visibility: "PRIVATE", version: 1, createdAt: NOW, updatedAt: NOW, share: null, items: [item] };

type Answer = (init: RequestInit) => Response;
let answers: Record<string, Answer>;
const calls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  calls.length = 0;
  router.push.mockReset();
  auth.session = null;
  answers = {};
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const answer = answers[`${init.method ?? "GET"} ${url}`];
    return answer ? answer(init) : Response.json({ code: "NOT_STUBBED" }, { status: 500 });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a shared list (craves.in/l/<token>)", () => {
  it("shows a guest the dishes without links and sends them to sign in to order or save", async () => {
    answers[`GET /api/advanced/shared-food-lists/${TOKEN}`] = () => Response.json(shared);
    render(createElement(SharedFoodList, { token: TOKEN }));
    expect(await screen.findByRole("heading", { name: "Sunday lunch" })).toBeTruthy();
    expect(screen.getByText("For when Amma visits")).toBeTruthy();
    expect(screen.getByText("Available now")).toBeTruthy();
    expect(screen.getByText("₹180")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Lakshmi's Thali" })).toBeNull();
    const signIn = await screen.findByRole("link", { name: "Sign in to order or save this list" });
    expect(signIn.getAttribute("href")).toBe(`/sign-in?returnTo=${encodeURIComponent(`/l/${TOKEN}`)}`);
  });

  it("lets a signed-in person open each dish and save a copy, then opens the copy", async () => {
    auth.session = { id: "me" };
    answers[`GET /api/advanced/shared-food-lists/${TOKEN}`] = () => Response.json(shared);
    answers[`POST /api/advanced/shared-food-lists/${TOKEN}/copy`] = () => Response.json(detail, { status: 201 });
    render(createElement(SharedFoodList, { token: TOKEN }));
    const dish = await screen.findByRole("link", { name: "Lakshmi's Thali" });
    expect(dish.getAttribute("href")).toBe(`/dish/${DISH}`);
    fireEvent.click(screen.getByRole("button", { name: "Save to my lists" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/lists/${LIST}`));
    // Copy has no idempotency key: the button stays busy while the page changes, so a second tap makes no second copy.
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(1);
  });

  it("says plainly when the link was turned off", async () => {
    answers[`GET /api/advanced/shared-food-lists/${TOKEN}`] = () => Response.json({ code: "SHARED_LIST_NOT_FOUND" }, { status: 404 });
    render(createElement(SharedFoodList, { token: TOKEN }));
    expect(await screen.findByRole("heading", { name: "This list link has expired or was turned off" })).toBeTruthy();
  });
});

describe("your food lists", () => {
  it("starts a list with one idempotency key and opens it", async () => {
    auth.session = { id: "me" };
    answers["GET /api/advanced/food-lists"] = () => Response.json([]);
    answers["POST /api/advanced/food-lists"] = () => Response.json(detail, { status: 201 });
    render(createElement(MyFoodLists));
    expect(await screen.findByText(/No lists yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sunday lunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Make the list" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/lists/${LIST}`));
    const create = calls.find((call) => call.init.method === "POST")!;
    expect(JSON.parse(String(create.init.body))).toEqual({ name: "Sunday lunch" });
    expect(new Headers(create.init.headers).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("asks a guest to sign in instead of showing lists", async () => {
    render(createElement(MyFoodLists));
    expect(await screen.findByRole("heading", { name: "Sign in to keep food lists" })).toBeTruthy();
    expect(calls.some((call) => call.url.startsWith("/api/advanced/"))).toBe(false);
  });
});

describe("save to a list (dish page)", () => {
  it("saves the dish into the chosen list and says where it went", async () => {
    auth.session = { id: "me" };
    answers["GET /api/advanced/food-lists"] = () => Response.json([{ id: LIST, name: "Sunday lunch", description: null, itemCount: 0, visibility: "PRIVATE", version: 1, createdAt: NOW, updatedAt: NOW }]);
    answers[`GET /api/advanced/food-lists/${LIST}`] = () => Response.json({ ...detail, itemCount: 0, items: [] });
    answers[`PUT /api/advanced/food-lists/${LIST}/items/${DISH}`] = () => Response.json(detail);
    render(createElement(SaveToListButton, { menuItemId: DISH }));
    fireEvent.click(screen.getByRole("button", { name: "Save to a list" }));
    const lists = await screen.findByRole("list", { name: "Your food lists" });
    fireEvent.click(within(lists).getByRole("button", { name: /Sunday lunch/ }));
    expect(await screen.findByText("Saved to Sunday lunch.")).toBeTruthy();
    expect(within(lists).getByText("1 dish")).toBeTruthy();
  });

  it("leaves a dish that is already in the list alone, so its note is kept", async () => {
    auth.session = { id: "me" };
    answers["GET /api/advanced/food-lists"] = () => Response.json([{ id: LIST, name: "Sunday lunch", description: null, itemCount: 1, visibility: "PRIVATE", version: 1, createdAt: NOW, updatedAt: NOW }]);
    answers[`GET /api/advanced/food-lists/${LIST}`] = () => Response.json(detail);
    render(createElement(SaveToListButton, { menuItemId: DISH }));
    fireEvent.click(screen.getByRole("button", { name: "Save to a list" }));
    fireEvent.click(within(await screen.findByRole("list", { name: "Your food lists" })).getByRole("button", { name: /Sunday lunch/ }));
    expect(await screen.findByText("Already in Sunday lunch.")).toBeTruthy();
    expect(calls.some((call) => call.init.method === "PUT")).toBe(false);
  });

  it("sends a guest to sign in and back to the dish", async () => {
    render(createElement(SaveToListButton, { menuItemId: DISH }));
    fireEvent.click(screen.getByRole("button", { name: "Save to a list" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/sign-in?returnTo=${encodeURIComponent(window.location.pathname)}`));
  });
});

describe("one food list (/lists/<id>)", () => {
  it("keeps a new link on screen when the reload after sharing fails, and asks before replacing it", async () => {
    auth.session = { id: "me" };
    let reads = 0;
    answers[`GET /api/advanced/food-lists/${LIST}`] = () => (reads++ === 0 ? Response.json(detail) : Response.json({ code: "FEATURE_BUSY" }, { status: 503 }));
    answers[`POST /api/advanced/food-lists/${LIST}/share`] = () => Response.json({ url: `https://craves.in/l/${TOKEN}`, expiresAt: null }, { status: 201 });
    render(createElement(FoodListPage, { listId: LIST }));
    fireEvent.click(await screen.findByRole("button", { name: "Share link" }));
    expect(((await screen.findByLabelText("Share link")) as HTMLInputElement).value).toBe(`https://craves.in/l/${TOKEN}`);
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByRole("heading", { name: "Sunday lunch" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Share link" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New link" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Make a new link" }));
  });

  it("shows the list as it is now when the dish was already removed", async () => {
    auth.session = { id: "me" };
    let reads = 0;
    answers[`GET /api/advanced/food-lists/${LIST}`] = () => Response.json(reads++ === 0 ? detail : { ...detail, itemCount: 0, items: [] });
    answers[`DELETE /api/advanced/food-lists/${LIST}/items/${DISH}`] = () => Response.json({ code: "LIST_ITEM_NOT_FOUND" }, { status: 404 });
    render(createElement(FoodListPage, { listId: LIST }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove Lakshmi's Thali from the list" }));
    expect(await screen.findByText(/No dishes yet/)).toBeTruthy();
  });

  it("gives focus back to the button that opened a confirm step", async () => {
    auth.session = { id: "me" };
    answers[`GET /api/advanced/food-lists/${LIST}`] = () => Response.json(detail);
    render(createElement(FoodListPage, { listId: LIST }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete list" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete list" }));
  });
});

describe("save to a list when the lists didn't load", () => {
  it("makes the new list without pretending it is the only one", async () => {
    auth.session = { id: "me" };
    answers["GET /api/advanced/food-lists"] = () => Response.json({ code: "FEATURE_BUSY" }, { status: 503 });
    answers["POST /api/advanced/food-lists"] = () => Response.json({ ...detail, itemCount: 0, items: [] }, { status: 201 });
    answers[`PUT /api/advanced/food-lists/${LIST}/items/${DISH}`] = () => Response.json(detail);
    render(createElement(SaveToListButton, { menuItemId: DISH }));
    fireEvent.click(screen.getByRole("button", { name: "Save to a list" }));
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText("New list"), { target: { value: "Sunday lunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved to Sunday lunch.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Your food lists" })).toBeNull();
  });
});

describe("attempt keys", () => {
  it("still makes a key the service accepts where randomUUID is missing", () => {
    vi.stubGlobal("crypto", {});
    expect(newAttemptKey()).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });
});
