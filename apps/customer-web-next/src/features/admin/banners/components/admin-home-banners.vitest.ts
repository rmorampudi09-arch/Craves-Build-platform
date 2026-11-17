// @vitest-environment jsdom
// Synthetic banners; nothing reaches the catalog service.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ list: [] as unknown[], posted: [] as FormData[] }));
vi.mock("@/features/admin/shell/lib/admin-renewal", () => ({
  adminFetch: async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      calls.posted.push(init.body as FormData);
      const platform = (init.body as FormData).get("platform");
      return Response.json({ ...banner("33333333-3333-4333-8333-333333333333", "New", String(platform)) });
    }
    return Response.json(url === "/api/admin/banners" ? calls.list : {});
  },
}));
import { AdminHomeBanners } from "./admin-home-banners";

const time = "2026-11-17T08:00:00Z";
function banner(id: string, label: string, platform?: string) {
  return { id, label, imagePath: `/api/v1/catalog/banners/${id}/image`, published: true, sortOrder: 0, createdAt: time, updatedAt: time, ...(platform ? { platform } : {}) };
}
let size = { width: 1080, height: 540 };

beforeEach(() => {
  calls.list = [banner("11111111-1111-4111-8111-111111111111", "Diwali sweets", "WEB"), banner("22222222-2222-4222-8222-222222222222", "App launch", "APP")];
  calls.posted = [];
  size = { width: 1080, height: 540 };
  vi.stubGlobal("createImageBitmap", async () => ({ ...size, close() {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const section = (name: string) => screen.getByRole("heading", { name }).closest("section")!;
/** A section's upload form (its banner rows have labels of their own). */
const uploadForm = (name: string) => within(within(section(name)).getByRole("button", { name: /Upload draft/ }).closest("form")!);
const picture = () => new File([new Uint8Array([137, 80, 78, 71])], "banner.png", { type: "image/png" });

it("keeps website and app banners in their own sections", async () => {
  render(createElement(AdminHomeBanners));
  expect(await within(section("Website banners")).findByDisplayValue("Diwali sweets")).toBeTruthy();
  expect(within(section("App banners")).getByDisplayValue("App launch")).toBeTruthy();
  expect(within(section("Website banners")).queryByDisplayValue("App launch")).toBeNull();
  expect(within(section("App banners")).getByText(/1080 × 540 pixels/)).toBeTruthy();
});

it("refuses a picture of the wrong shape before sending it", async () => {
  render(createElement(AdminHomeBanners));
  await screen.findByDisplayValue("App launch");
  const app = uploadForm("App banners");
  size = { width: 800, height: 800 };
  fireEvent.change(app.getByLabelText("Banner label"), { target: { value: "Square" } });
  fireEvent.change(app.getByLabelText("Banner image"), { target: { files: [picture()] } });
  expect((await within(section("App banners")).findByRole("alert")).textContent).toContain("twice as wide as it is tall");
  expect((app.getByRole("button", { name: /Upload draft/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(calls.posted).toHaveLength(0);
});

it("uploads an app banner as an app banner", async () => {
  render(createElement(AdminHomeBanners));
  await screen.findByDisplayValue("App launch");
  const app = uploadForm("App banners");
  fireEvent.change(app.getByLabelText("Banner label"), { target: { value: "Weekend thali" } });
  fireEvent.change(app.getByLabelText("Banner image"), { target: { files: [picture()] } });
  const upload = app.getByRole("button", { name: /Upload draft/ }) as HTMLButtonElement;
  await waitFor(() => expect(upload.disabled).toBe(false));
  // jsdom can't fill a file field for its required check, so the form is sent directly.
  fireEvent.submit(upload.closest("form")!);
  await waitFor(() => expect(calls.posted).toHaveLength(1));
  expect(calls.posted[0].get("platform")).toBe("APP");
  expect(calls.posted[0].get("label")).toBe("Weekend thali");
  expect(await screen.findByText("Image uploaded as a draft. Tick Published to show it in the app's home screen carousel.")).toBeTruthy();
});
