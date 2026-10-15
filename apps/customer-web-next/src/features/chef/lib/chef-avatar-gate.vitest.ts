// @vitest-environment jsdom
// Disposable identities and kitchens; no production API is called.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChefAvatarGate } from "../components/chef-avatar";
import { setSessionIdentity } from "../../auth/api/cravesAuth";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chef",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const kitchen = {
  id: "11111111-2222-4333-8444-555555555555",
  kitchenName: "Fixture kitchen",
  displayName: null,
  description: null,
  phoneNumber: null,
  email: null,
  addressLine1: "1 Fixture Road",
  addressLine2: null,
  landmark: null,
  areaName: null,
  city: "Hyderabad",
  state: "Telangana",
  postalCode: null,
  latitude: null,
  longitude: null,
  status: "DRAFT",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  chefPhotoUrl: null as string | null,
};
let chefNumber = 0;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let saved: { status: number; body: unknown };

beforeEach(() => {
  // A new chef each time: the gate remembers who it already let in during this page load.
  chefNumber += 1;
  setSessionIdentity({
    id: `51111111-1111-4111-8111-${String(chefNumber).padStart(12, "0")}`,
    phoneNumber: "+910000000001",
    displayName: "Fixture",
    email: null,
    emailVerified: false,
    status: "ACTIVE",
    roles: ["CUSTOMER", "CHEF"],
  });
  saved = {
    status: 200,
    body: {
      ...kitchen,
      chefPhotoUrl: "https://craves.in/media/public/chef-avatars/chef-avatar-03.jpg",
    },
  };
  fetcher = vi.fn<typeof fetch>(async (input, init) => {
    if (String(input) === "/api/chef/kitchen") return Response.json(kitchen);
    if (String(input) === "/api/chef/kitchen/chef-avatar" && init?.method === "PUT")
      return Response.json(saved.body, { status: saved.status });
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const open = () =>
  render(createElement(ChefAvatarGate, null, createElement("p", null, "Chef home")));
const saves = () => fetcher.mock.calls.filter(([url]) => url === "/api/chef/kitchen/chef-avatar");

it("asks a chef without a picture to choose one, saves it and then opens the chef area", async () => {
  open();
  await screen.findByRole("heading", { name: "Choose your profile picture" });
  expect(screen.getAllByRole("radio")).toHaveLength(18);
  expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Picture 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Chef home");
  expect(JSON.parse(String(saves()[0][1]?.body))).toEqual({ avatarId: "chef-avatar-03" });
});

it("offers Try again or Not now when the save fails; Not now lets the chef in for this page load", async () => {
  saved = { status: 503, body: { code: "CHEF_AVATAR_UNAVAILABLE" } };
  open();
  fireEvent.click(await screen.findByRole("radio", { name: "Picture 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "We couldn’t save your picture. Please try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(saves()).toHaveLength(2));
  fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
  await screen.findByText("Chef home");
  cleanup();
  const reads = fetcher.mock.calls.length;
  open();
  expect(screen.getByText("Chef home")).toBeTruthy();
  expect(fetcher.mock.calls.length).toBe(reads);
});

it.each([
  ["the kitchen read fails", () => Response.json({ code: "KITCHEN_UNAVAILABLE" }, { status: 503 })],
  ["there is no kitchen yet", () => Response.json(null)],
  ["the kitchen is suspended", () => Response.json({ ...kitchen, status: "SUSPENDED" })],
  ["the chef already has a picture", () => Response.json(saved.body)],
  [
    "the server does not send pictures yet",
    () => Response.json({ ...kitchen, chefPhotoUrl: undefined }),
  ],
])("opens the chef area when %s", async (_, reply) => {
  fetcher.mockImplementation(async () => reply());
  open();
  await screen.findByText("Chef home");
  expect(screen.queryByRole("heading", { name: "Choose your profile picture" })).toBeNull();
});
