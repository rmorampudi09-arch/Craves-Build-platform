// @vitest-environment jsdom
// The BFF is a fetch stub.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChefEmailPreference, ChefPreferences } from "../components/chef-preferences";

let settings: { autoAcceptOrders: boolean; defaultPrepMinutes: number | null };
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const puts = () =>
  fetcher.mock.calls
    .filter(([, init]) => init?.method === "PUT")
    .map(([, init]) => JSON.parse(String(init?.body)));

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  settings = { autoAcceptOrders: false, defaultPrepMinutes: null };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })),
  );
  fetcher = vi.fn<typeof fetch>(async (_input, init) => {
    if (init?.method === "PUT") settings = JSON.parse(String(init.body));
    return Response.json(settings);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Chef preferences", () => {
  it("asks before accepting orders automatically, and turns it off without asking", async () => {
    render(createElement(ChefPreferences));
    const auto = await screen.findByRole("switch", { name: "Accept orders automatically" });
    fireEvent.click(auto);
    expect(
      await screen.findByRole("dialog", { name: "Accept new orders automatically?" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(puts()).toEqual([]);
    fireEvent.click(auto);
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(auto.getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(auto);
    await waitFor(() => expect(auto.getAttribute("aria-checked")).toBe("false"));
    expect(puts()).toEqual([
      { autoAcceptOrders: true, defaultPrepMinutes: null },
      { autoAcceptOrders: false, defaultPrepMinutes: null },
    ]);
  });

  it("sets the default cooking time, keeping a saved time that is not on the list", async () => {
    settings = { autoAcceptOrders: true, defaultPrepMinutes: 35 };
    render(createElement(ChefPreferences));
    expect(
      (await screen.findByRole("button", { name: "35 min" })).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "20 min" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "20 min" }).getAttribute("aria-pressed")).toBe(
        "true",
      ),
    );
    expect(puts()).toEqual([{ autoAcceptOrders: true, defaultPrepMinutes: 20 }]);
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });

  it("keeps the saved settings and says so when a save fails", async () => {
    render(createElement(ChefPreferences));
    fetcher.mockImplementation(async () =>
      Response.json({ code: "KITCHEN_SETTINGS_FAILED" }, { status: 503 }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "15 min" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /^We couldn’t save that\. Please try again\./,
    );
    expect(screen.getByRole("button", { name: "15 min" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("shows Coming soon when the settings route isn't live, and Try again when it fails", async () => {
    fetcher.mockImplementation(async () =>
      Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }),
    );
    render(createElement(ChefPreferences));
    expect(await screen.findByText("Order settings are on their way")).toBeTruthy();
    cleanup();
    fetcher
      .mockImplementationOnce(async () =>
        Response.json({ code: "KITCHEN_SETTINGS_UNAVAILABLE" }, { status: 503 }),
      )
      .mockImplementation(async () => Response.json(settings));
    render(createElement(ChefPreferences));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("switch", { name: "Accept orders automatically" })).toBeTruthy();
  });

  it("turns statement emails off and on, one save at a time", async () => {
    let enabled = true;
    fetcher.mockImplementation(async (_input, init) => {
      if (init?.method === "PUT") enabled = JSON.parse(String(init.body)).enabled;
      return Response.json({ enabled });
    });
    render(createElement(ChefEmailPreference));
    const email = await screen.findByRole("switch", { name: "Email" });
    expect(email.getAttribute("aria-checked")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe("chef-email-note");
    fireEvent.click(email);
    fireEvent.click(email); // a second tap while the first save runs sends nothing
    await waitFor(() => expect(email.getAttribute("aria-checked")).toBe("false"));
    expect(puts()).toEqual([{ enabled: false }]);
    expect(String(fetcher.mock.calls[0][0])).toBe("/api/notifications/preferences/email");
  });

  it("says Coming soon for email until the gateway routes it", async () => {
    fetcher.mockImplementation(async () =>
      Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 }),
    );
    render(createElement(ChefEmailPreference));
    expect(await screen.findByText("Coming soon")).toBeTruthy();
    expect(screen.getByText("Statements and updates")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
