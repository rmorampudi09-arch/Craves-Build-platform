// @vitest-environment jsdom
// Synthetic ids; the BFF is a fetch stub.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChefKitchenSwitch } from "../components/chef-kitchen-switch";
import type { ChefKitchen } from "./chef-kitchen-types";

// Thursday 15 Oct 2026, 11:30 in India: inside Thursday's 11:00 – 22:00.
const NOW = new Date("2026-10-15T06:00:00Z");
const kitchen: ChefKitchen = {
  id: "6b1c0000-0000-4000-8000-000000000001",
  kitchenName: "Fixture kitchen",
  displayName: null,
  description: null,
  phoneNumber: "+910000000000",
  email: null,
  addressLine1: "Fixture house",
  addressLine2: null,
  landmark: null,
  areaName: "Fixture area",
  city: "Fixture city",
  state: "Fixture state",
  postalCode: "500001",
  latitude: 17.4,
  longitude: 78.4,
  status: "ACTIVE",
  createdAt: "2026-10-02T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
};
const base = {
  kitchenId: kitchen.id,
  timezoneId: "Asia/Kolkata",
  acceptingOrders: true,
  pausedUntil: null as string | null,
  pauseReason: null as string | null,
  weeklyWindows: [{ dayOfWeek: 4, opensAt: "11:00", closesAt: "22:00" }],
};
let saved: ChefKitchen;
let schedule: typeof base | null;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const writes = () =>
  fetcher.mock.calls
    .filter(([, init]) => init?.method === "PUT")
    .map(([url, init]) => [url, JSON.parse(String(init?.body))]);

function Host() {
  const [current, setCurrent] = useState(saved);
  return createElement(ChefKitchenSwitch, { kitchen: current, onChange: setCurrent });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  saved = kitchen;
  schedule = base;
  fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url === "/api/chef/kitchen") {
      if (init?.method === "PUT") saved = { ...saved, status: body.status };
      return Response.json(saved);
    }
    if (url === "/api/chef/kitchen/schedule") {
      if (!schedule) return Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 });
      if (init?.method === "PUT") schedule = { ...schedule, ...body };
      return Response.json(schedule);
    }
    throw new Error(`Unexpected route ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Kitchen status", () => {
  it("pauses new orders for a while, then resumes", async () => {
    render(createElement(Host));
    expect(await screen.findByRole("heading", { name: "Open · taking orders" })).toBeTruthy();
    expect(screen.getByText("Today 11:00 AM – 10:00 PM")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause new orders" }));
    fireEvent.click(screen.getByRole("radio", { name: "2 hours" }));
    expect(screen.getByText(/Customers see “Opens again at 1:30 PM”/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause for 2 hours" }));
    expect(await screen.findByRole("heading", { name: "Paused · back at 1:30 PM" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("New orders paused");
    expect(screen.getByRole("switch", { name: "Taking orders" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Resume now" }));
    expect(await screen.findByRole("heading", { name: "Open · taking orders" })).toBeTruthy();
    expect(writes()).toEqual([
      [
        "/api/chef/kitchen/schedule",
        {
          acceptingOrders: true,
          pausedUntil: "2026-10-15T08:00:00.000Z",
          pauseReason: "Paused by chef",
          weeklyWindows: base.weeklyWindows,
        },
      ],
      [
        "/api/chef/kitchen/schedule",
        {
          acceptingOrders: true,
          pausedUntil: null,
          pauseReason: null,
          weeklyWindows: base.weeklyWindows,
        },
      ],
    ]);
  });

  it("pauses for the rest of today until the kitchen's midnight", async () => {
    render(createElement(Host));
    fireEvent.click(await screen.findByRole("button", { name: "Pause new orders" }));
    fireEvent.click(screen.getByRole("radio", { name: "Rest of today" }));
    expect(screen.getByText(/Opens again tomorrow/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause for the rest of today" }));
    await screen.findByRole("heading", { name: "Paused · back at 12:00 AM" });
    expect(writes()[0][1].pausedUntil).toBe("2026-10-15T18:30:00.000Z");
  });

  it("starts taking orders again without saving the kitchen when only the schedule stopped them", async () => {
    schedule = { ...base, acceptingOrders: false };
    render(createElement(Host));
    expect(await screen.findByRole("heading", { name: "Closed · not taking orders" })).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Taking orders" }));
    expect(await screen.findByRole("heading", { name: "Open · taking orders" })).toBeTruthy();
    expect(writes()).toEqual([
      [
        "/api/chef/kitchen/schedule",
        {
          acceptingOrders: true,
          pausedUntil: null,
          pauseReason: null,
          weeklyWindows: base.weeklyWindows,
        },
      ],
    ]);
  });

  it("says when a closed kitchen opens by its hours, with a way to change them", async () => {
    vi.setSystemTime(new Date("2026-10-15T04:00:00Z"));
    render(createElement(Host));
    expect(await screen.findByRole("heading", { name: "Closed · opens 11:00 AM" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change opening hours" }).getAttribute("href")).toBe(
      "/chef/operations#chef-hours",
    );
    expect(screen.queryByRole("button", { name: "Pause new orders" })).toBeNull();
  });

  it("leaves a kitchen Craves paused alone", async () => {
    saved = { ...kitchen, status: "SUSPENDED" };
    render(createElement(Host));
    expect(await screen.findByRole("heading", { name: "Paused by Craves" })).toBeTruthy();
    expect(
      (screen.getByRole("switch", { name: "Taking orders" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Pause new orders" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ask Craves why" }).getAttribute("href")).toBe(
      "/chef/support",
    );
  });

  it("keeps the open and close switch working while the schedule isn't live", async () => {
    schedule = null;
    saved = { ...kitchen, status: "INACTIVE" };
    render(createElement(Host));
    expect(await screen.findByRole("heading", { name: "Closed" })).toBeTruthy();
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith("/api/chef/kitchen/schedule", expect.anything()),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Taking orders" }));
    expect(await screen.findByRole("heading", { name: "Open · taking orders" })).toBeTruthy();
    expect(writes()).toEqual([
      [
        "/api/chef/kitchen",
        expect.objectContaining({ status: "ACTIVE", kitchenName: "Fixture kitchen" }),
      ],
    ]);
    expect(screen.queryByRole("button", { name: "Pause new orders" })).toBeNull();
  });
});
