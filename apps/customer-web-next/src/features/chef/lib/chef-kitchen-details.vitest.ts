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
let saved: Record<string, unknown> | null;
let supportReply: () => Response;
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
  // jsdom has no scrolling: the form scrolls to a field it asks about.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })),
  );
  // jsdom has no object URLs: the photo preview needs one.
  vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:fixture"; } static revokeObjectURL() {} });
  stored = { ...base, chefPhotoUrl: FACE("05"), kitchenPhotoUrl: K1, kitchenPhotoUrls: [K1] };
  photoReply = () => Response.json({ ...stored, kitchenPhotoUrls: [K1, K2] });
  saved = null;
  supportReply = () => Response.json(ticket, { status: 201 });
  fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === "/api/chef/kitchen" && !init?.method) return Response.json(stored);
    if (url === "/api/chef/application") return Response.json({ status: "APPROVED" });
    if (url === "/api/chef/onboarding") return Response.json({}, { status: 404 });
    if (url === "/api/chef/kitchen/photos" && init?.method === "POST") return photoReply();
    if (url === "/api/support/cases" && init?.method === "POST") return supportReply();
    if (url === "/api/chef/kitchen" && init?.method === "PUT") {
      saved = JSON.parse(String(init.body));
      stored = { ...stored, ...saved };
      return Response.json(stored);
    }
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
const ticket = {
  id: "5a0c0000-0000-4000-8000-0000000000c1", caseNumber: "CRV-5A0C000000004000800000000000", requesterRole: "CHEF", orderId: null, subject: "Move my kitchen",
  status: "OPEN", lastRequesterMessageAt: null, lastSupportMessageAt: null, resolvedAt: null, closedAt: null, createdAt: "2026-10-10T08:00:00Z", updatedAt: "2026-10-10T08:00:00Z",
  messages: [{ id: "3e000000-0000-4000-8000-000000000001", senderRole: "CHEF", body: "New address", createdAt: "2026-10-10T08:00:00Z" }],
};
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
  // Photos lock once added: the chef sees the photo and confirms it before it uploads.
  expect((await screen.findByRole("img", { name: "Your kitchen photo" })).getAttribute("src")).toBe("blob:fixture");
  expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/kitchen/photos")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Use this photo" }));
  await screen.findByText("Photo saved");
  const upload = fetcher.mock.calls.find(([url]) => url === "/api/chef/kitchen/photos")!;
  expect((upload[1]?.body as FormData).get("file")).toMatchObject({ name: "setup.png" });
  expect((await tile(/^Cooking setup: photo added/)).textContent).toContain("Cooking setup");
});

it("lets the chef choose another photo before anything uploads", async () => {
  open();
  fireEvent.click(await tile(/^Cooking setup/));
  fireEvent.click(await screen.findByRole("button", { name: "Choose from gallery" }));
  fireEvent.change(gallery(), { target: { files: [new File(["fixture"], "blurry.jpg", { type: "image/jpeg" })] } });
  fireEvent.click(await screen.findByRole("button", { name: "Choose another" }));
  expect(screen.queryByRole("img", { name: "Your kitchen photo" })).toBeNull();
  expect(screen.getByRole("button", { name: "Take a photo" })).toBeTruthy();
  expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/kitchen/photos")).toBe(false);
});

it("says a filled photo is locked on every tap, and that the overall photo comes first", async () => {
  open();
  fireEvent.click(await tile(/^Overall kitchen: photo added/));
  expect(note()).toBe("Kitchen photos can’t be changed. To change one, contact Craves support.");
  const first = document.querySelector("[aria-live=polite] > span");
  fireEvent.click(await tile(/^Overall kitchen: photo added/));
  // A fresh node, so screen readers read the same words out again.
  expect(document.querySelector("[aria-live=polite] > span")).not.toBe(first);
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
  fireEvent.click(await screen.findByRole("button", { name: "Use this photo" }));
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

const field = (name: string) => screen.getByLabelText(name, { exact: false }) as HTMLInputElement;

it("edits what the chef cooks, delivery areas and links, with the area, city, PIN and state locked", async () => {
  stored = { ...stored, cuisines: ["Biryani"], serviceAreas: ["Madhapur"], socialLinks: { instagram: "https://instagram.com/asha", facebook: null, youtube: null, website: null } };
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Edit kitchen details" }));
  expect(screen.getByRole("button", { name: "Biryani" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Andhra" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Add a cuisine" }), { target: { value: " Pulao " } });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Add a cuisine" }), { key: "Enter" });
  expect(screen.getByRole("button", { name: "Pulao" }).getAttribute("aria-pressed")).toBe("true");
  // Keyboard users land back on "+ Add" after adding or leaving the field.
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ Add" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Add a cuisine" }), { key: "Escape" });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ Add" }));
  fireEvent.change(field("Facebook"), { target: { value: "facebook.com/asha" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByRole("alert").textContent).toBe("Facebook link must start with https://");
  fireEvent.change(field("Facebook"), { target: { value: "https://facebook.com/asha" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  for (const name of ["Area", "City", "State", "Pincode"]) expect(field(name).readOnly).toBe(true);
  for (const name of ["Flat / House / Building", "Street / Road", "Landmark"]) expect(field(name).readOnly).toBe(false);
  expect(screen.queryByRole("button", { name: /current location/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Madhapur" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
  fireEvent.click(screen.getByRole("button", { name: "Save my kitchen" }));
  await waitFor(() => expect(saved).not.toBeNull());
  expect(saved).toMatchObject({
    city: "Hyderabad", state: "Telangana", postalCode: "500081", areaName: "Madhapur", latitude: 17.44, longitude: 78.39,
    cuisines: ["Biryani", "Andhra", "Pulao"], serviceAreas: [],
    socialLinks: { instagram: "https://instagram.com/asha", facebook: "https://facebook.com/asha", youtube: null, website: null },
  });
});

it("leaves out what the server doesn't send, and keeps an empty area and PIN locked like the app", async () => {
  stored = { ...stored, areaName: null, postalCode: null, latitude: null, longitude: null };
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Edit kitchen details" }));
  expect(screen.queryByRole("group", { name: "What you cook" })).toBeNull();
  expect(screen.queryByLabelText("Instagram", { exact: false })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.queryByRole("group", { name: "Delivery areas" })).toBeNull();
  for (const name of ["Area", "Pincode", "City", "State"]) expect(field(name).readOnly).toBe(true);
  expect([field("Area").value, field("Pincode").value]).toEqual(["–", "–"]);
  expect(screen.getByRole("button", { name: "Use my current location" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
  // Opening needs the area, which only Craves support can add now.
  fireEvent.click(screen.getByRole("button", { name: /^Yes, get my kitchen ready/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save my kitchen" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "Your kitchen needs the pickup area before it can open. Use Move my kitchen to ask Craves support to add it.",
  );
  expect(screen.getByRole("button", { name: "Move my kitchen" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
  fireEvent.click(screen.getByRole("button", { name: /^Not yet/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save my kitchen" }));
  await waitFor(() => expect(saved).not.toBeNull());
  expect(saved).toMatchObject({ areaName: null, postalCode: null, city: "Hyderabad", state: "Telangana" });
  for (const key of ["cuisines", "serviceAreas", "socialLinks"]) expect(saved).not.toHaveProperty(key);
});

it("asks Craves support to move the kitchen, and keeps the message when support chat isn't live yet", async () => {
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Edit kitchen details" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Move my kitchen" }));
  await screen.findByRole("dialog", { name: "Move my kitchen" });
  fireEvent.change(screen.getByLabelText("Your new kitchen address"), { target: { value: " 4 New Street, Kondapur " } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Sent. Craves support will reply in Help & support.");
  const sent = fetcher.mock.calls.find(([url]) => url === "/api/support/cases")!;
  expect(JSON.parse(String(sent[1]?.body))).toEqual({ contextRole: "CHEF", orderId: null, subject: "Move my kitchen", message: "4 New Street, Kondapur" });
  expect(screen.getByRole("link", { name: "Open Help & support" }).getAttribute("href")).toBe("/chef/support");
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  supportReply = () => Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 });
  fireEvent.click(screen.getByRole("button", { name: "Move my kitchen" }));
  fireEvent.change(await screen.findByLabelText("Your new kitchen address"), { target: { value: "4 New Street" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Chat is on its way");
  expect((screen.getByLabelText("Your new kitchen address") as HTMLTextAreaElement).value).toBe("4 New Street");
  expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
});
