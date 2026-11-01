// @vitest-environment jsdom
// Synthetic ids; the BFF is a fetch stub.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChefOpeningHours } from "../components/chef-opening-hours";

const schedule = {
  kitchenId: "6b1c0000-0000-4000-8000-000000000001",
  timezoneId: "Asia/Kolkata",
  acceptingOrders: true,
  pausedUntil: "2026-10-15T12:00:00Z",
  pauseReason: "Paused by chef",
  weeklyWindows: [{ dayOfWeek: 1, opensAt: "11:00", closesAt: "22:00" }],
};
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const puts = () =>
  fetcher.mock.calls
    .filter(([, init]) => init?.method === "PUT")
    .map(([url, init]) => [url, JSON.parse(String(init?.body))]);

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })),
  );
  fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === "/api/chef/kitchen/schedule")
      return Response.json(
        init?.method === "PUT" ? { ...schedule, ...JSON.parse(String(init.body)) } : schedule,
      );
    if (url.startsWith("/api/chef/kitchen/schedule/overrides/"))
      return init?.method === "PUT"
        ? Response.json({ serviceDate: url.slice(-10), ...JSON.parse(String(init.body)) })
        : Response.json({ code: "SCHEDULE_OVERRIDE_NOT_FOUND" }, { status: 404 });
    throw new Error(`Unexpected route ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Opening hours", () => {
  it("puts the Taking orders switch on top, as in the app, once the kitchen is read", async () => {
    const route = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) =>
      String(input) === "/api/chef/kitchen" && !init?.method
        ? Response.json({
            id: "6b1c0000-0000-4000-8000-000000000001", kitchenName: "Fixture kitchen", displayName: null, description: null,
            phoneNumber: "+919999999999", email: null, addressLine1: "1 Road", addressLine2: null, landmark: null,
            areaName: "Madhapur", city: "Hyderabad", state: "Telangana", postalCode: "500081", latitude: 17.4, longitude: 78.3,
            status: "ACTIVE", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
          })
        : route(input, init),
    );
    render(createElement(ChefOpeningHours));
    const taking = await screen.findByRole("switch", { name: "Taking orders" });
    const week = await screen.findByRole("button", { name: /^Monday/ });
    // The card comes before the week's hours.
    expect(taking.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists the week, with days that have no hours closed", async () => {
    render(createElement(ChefOpeningHours));
    expect((await screen.findByRole("button", { name: /^Monday/ })).textContent).toContain(
      "11:00 AM – 10:00 PM",
    );
    expect(screen.getByRole("button", { name: /^Tuesday/ }).textContent).toContain("Closed");
  });

  it("saves a day and copies it to another, keeping the pause the server has", async () => {
    render(createElement(ChefOpeningHours));
    fireEvent.click(await screen.findByRole("button", { name: /^Tuesday/ }));
    const sheet = await screen.findByRole("dialog", { name: "Tuesday" });
    const open = within(sheet).getByRole("switch", { name: "Open" });
    expect(open.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(open);
    fireEvent.change(within(sheet).getByLabelText("Opens"), { target: { value: "09:00" } });
    fireEvent.change(within(sheet).getByLabelText("Closes"), { target: { value: "23:59" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Wednesday" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await screen.findByText("Opening hours saved");
    expect(puts()).toEqual([
      [
        "/api/chef/kitchen/schedule",
        {
          acceptingOrders: true,
          pausedUntil: schedule.pausedUntil,
          pauseReason: "Paused by chef",
          weeklyWindows: [
            { dayOfWeek: 1, opensAt: "11:00", closesAt: "22:00" },
            { dayOfWeek: 2, opensAt: "09:00", closesAt: "23:59" },
            { dayOfWeek: 3, opensAt: "09:00", closesAt: "23:59" },
          ],
        },
      ],
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: /^Wednesday/ }).textContent).toContain(
      "9:00 AM – Midnight",
    );
  });

  it("says what is wrong with overlapping times and sends nothing", async () => {
    render(createElement(ChefOpeningHours));
    fireEvent.click(await screen.findByRole("button", { name: /^Monday/ }));
    const sheet = await screen.findByRole("dialog", { name: "Monday" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Add another time" }));
    fireEvent.change(within(sheet).getByLabelText("Opens (second time)"), {
      target: { value: "21:00" },
    });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(within(sheet).getByRole("alert").textContent).toBe("The two times overlap.");
    expect(puts()).toEqual([]);
  });

  it("sets a special day closed all day with a reason", async () => {
    render(createElement(ChefOpeningHours));
    fireEvent.click(await screen.findByRole("button", { name: "Add a special day" }));
    const sheet = await screen.findByRole("dialog", { name: "Add a special day" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Tomorrow" }));
    fireEvent.change(await within(sheet).findByLabelText(/Reason/), {
      target: { value: " Diwali " },
    });
    expect(within(sheet).queryByRole("button", { name: "Remove special day" })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await screen.findByText("Special day saved");
    const [[url, body]] = puts();
    expect(url).toMatch(/^\/api\/chef\/kitchen\/schedule\/overrides\/\d{4}-\d{2}-\d{2}$/);
    expect(body).toEqual({ closed: true, reason: "Diwali", windows: [] });
    expect(await screen.findByRole("button", { name: /^Tomorrow · Diwali/ })).toBeTruthy();
  });

  it("shows Coming soon when the schedule route isn't live", async () => {
    fetcher.mockImplementation(async () =>
      Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }),
    );
    render(createElement(ChefOpeningHours));
    expect(await screen.findByText("Opening hours are on their way")).toBeTruthy();
  });

  it("offers Try again when the schedule can't load, and shows it loading again", async () => {
    let release!: () => void;
    fetcher
      .mockImplementationOnce(async () =>
        Response.json({ code: "KITCHEN_SCHEDULE_UNAVAILABLE" }, { status: 503 }),
      )
      .mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return Response.json(schedule);
      });
    render(createElement(ChefOpeningHours));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    release();
    expect(await screen.findByRole("button", { name: /^Monday/ })).toBeTruthy();
  });
});
