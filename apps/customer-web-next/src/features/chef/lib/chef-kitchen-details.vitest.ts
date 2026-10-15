// @vitest-environment jsdom
// The rendered Kitchen details screen against disposable kitchens; no production API is called.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChefKitchenForm } from "../components/chef-kitchen-form";
import { setSessionIdentity } from "../../auth/api/cravesAuth";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chef/kitchen",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../addresses/components/AddressMapPicker", () => ({ AddressMapPicker: () => null }));

const K1 = "https://craves.in/media/public/kitchens/k1.jpg";
const K2 = "https://craves.in/media/public/kitchens/k2.jpg";
const FACE = (n: string) => `https://craves.in/media/public/chef-avatars/chef-avatar-${n}.jpg`;
const base = {
  id: "11111111-2222-4333-8444-555555555555",
  kitchenName: "Fixture kitchen",
  displayName: "Asha Rao",
  description: null,
  phoneNumber: "+919999999999",
  email: null,
  addressLine1: "1 Fixture Road",
  addressLine2: null,
  landmark: null,
  areaName: "Madhapur",
  city: "Hyderabad",
  state: "Telangana",
  postalCode: "500081",
  latitude: 17.44,
  longitude: 78.39,
  status: "INACTIVE",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
let stored: Record<string, unknown>;
let photoReply: () => Response;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  setSessionIdentity({
    id: "61111111-1111-4111-8111-111111111111",
    phoneNumber: "+919999999999",
    displayName: "Asha",
    email: null,
    emailVerified: false,
    status: "ACTIVE",
    roles: ["CHEF"],
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })),
  );
  stored = { ...base, chefPhotoUrl: FACE("05"), kitchenPhotoUrl: K1, kitchenPhotoUrls: [K1] };
  photoReply = () => Response.json({ ...stored, kitchenPhotoUrls: [K1, K2] });
  fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === "/api/chef/kitchen" && !init?.method) return Response.json(stored);
    if (url === "/api/chef/application") return Response.json({ status: "APPROVED" });
    if (url === "/api/chef/onboarding") return Response.json({}, { status: 404 });
    if (url === "/api/chef/kitchen/photos" && init?.method === "POST") return photoReply();
    if (url === "/api/chef/kitchen/chef-avatar" && init?.method === "PUT") {
      stored = { ...stored, chefPhotoUrl: FACE(JSON.parse(String(init.body)).avatarId.slice(-2)) };
      return Response.json(stored);
    }
    throw new Error(`Unexpected route ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const open = () => render(createElement(ChefKitchenForm));
const tile = (name: RegExp) => screen.findByRole("button", { name });
const note = () => document.querySelector("[aria-live=polite]")?.textContent;
const gallery = () => document.querySelector<HTMLInputElement>("input[type=file]:not([capture])")!;

it("adds the cooking setup photo from the gallery and shows it at once", async () => {
  open();
  fireEvent.click(await tile(/^Cooking setup/));
  await screen.findByRole("dialog", { name: "Kitchen photo" });
  expect(document.querySelector("input[capture=environment]")?.getAttribute("accept")).toBe(
    "image/jpeg,image/png",
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose from gallery" }));
  fireEvent.change(gallery(), {
    target: { files: [new File(["fixture"], "setup.png", { type: "image/png" })] },
  });
  await screen.findByText("Photo saved");
  const upload = fetcher.mock.calls.find(([url]) => url === "/api/chef/kitchen/photos")!;
  expect((upload[1]?.body as FormData).get("file")).toMatchObject({ name: "setup.png" });
  expect((await tile(/^Cooking setup: photo added/)).textContent).toContain("Cooking setup");
});

it("says a filled photo is locked, and that the overall photo comes first", async () => {
  open();
  fireEvent.click(await tile(/^Overall kitchen: photo added/));
  expect(note()).toBe("Kitchen photos can’t be changed. To change one, contact Craves support.");
  cleanup();
  stored = { ...stored, kitchenPhotoUrl: null, kitchenPhotoUrls: [] };
  open();
  fireEvent.click(await tile(/^Cooking setup/));
  expect(note()).toBe("Add the overall kitchen photo first.");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("reloads the photos and shows the lock when Craves already holds them", async () => {
  photoReply = () => {
    stored = { ...stored, kitchenPhotoUrls: [K1, K2] };
    return Response.json({ code: "KITCHEN_PHOTOS_LOCKED" }, { status: 409 });
  };
  open();
  fireEvent.click(await tile(/^Cooking setup/));
  fireEvent.click(await screen.findByRole("button", { name: "Take a photo" }));
  fireEvent.change(document.querySelector<HTMLInputElement>("input[capture=environment]")!, {
    target: { files: [new File(["fixture"], "setup.jpg", { type: "image/jpeg" })] },
  });
  await tile(/^Cooking setup: photo added/);
  expect(note()).toBe("Kitchen photos can’t be changed. To change one, contact Craves support.");
});

it("says Coming soon when the server doesn't offer photos yet", async () => {
  stored = { ...base };
  open();
  for (const name of [/^Your picture/, /^Overall kitchen/, /^Cooking setup/]) {
    const button = (await tile(name)) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Coming soon");
  }
});

it("changes the chef picture from the current face", async () => {
  open();
  fireEvent.click(await tile(/^Your picture/));
  await screen.findByRole("dialog", { name: "Change your picture" });
  expect((screen.getByRole("radio", { name: "Picture 5" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "Picture 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Picture saved");
  expect(
    JSON.parse(
      String(fetcher.mock.calls.find(([url]) => url === "/api/chef/kitchen/chef-avatar")![1]?.body),
    ),
  ).toEqual({ avatarId: "chef-avatar-02" });
  await waitFor(() => expect(document.querySelector(`img[src="${FACE("02")}"]`)).not.toBeNull());
});
