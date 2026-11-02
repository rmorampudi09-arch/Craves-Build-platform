// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { noticeStart } from "@/features/admin/fleet/lib/setup-contract";
import { FleetSetup } from "./fleet-setup";

type Call = { method: string; path: string; key: string | null; body: unknown };
const calls: Call[] = [];
let answer: (method: string, path: string) => Response | Promise<Response>;
vi.mock("@/features/admin/shell/lib/admin-renewal", () => ({
  adminFetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = String(input).replace("/api/admin/fleet/", "");
    calls.push({ method, path, key: new Headers(init.headers).get("Idempotency-Key"), body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
    return answer(method, path);
  },
}));

const RIDER = "11111111-1111-4111-8111-111111111111";
const SITA = "88888888-8888-4888-8888-888888888888";
const CHEF = "33333333-3333-4333-8333-333333333333";
const at = "2026-10-22T04:30:00Z";
const values = { offerSeconds: 40, fleetStageSeconds: 60, radiusM: 5000, pickupDetourPercent: 130, perOrderOverheadPaise: 500, costGuardPremiumPaise: 1000, pidgeStageSeconds: 600 };
// A version from before dispatch was built in, from a server that sends no offer rules: three nearest at once, one round.
const policy = { version: "2026-10-v2", status: "PUBLISHED", effectiveFrom: at, publishedAt: at, mode: "live", ...values, ranges: {} };
// What every new version gets; the setup sends it as builtInDispatch (base leaves it out, as an older server does).
const builtIn = {
  offerSeconds: 30, fleetStageSeconds: 120, radiusM: 5000, pickupDetourPercent: 130, perOrderOverheadPaise: 500, costGuardPremiumPaise: 1000,
  pidgeStageSeconds: 600, offersAtOnce: 1, offerRounds: 3, fairBandM: 1500, rankByTravelTime: false,
};
const onBuiltIn = { ...policy, ...builtIn };
const BUILT_IN_TEXT = "1 rider at a time · 30 s to accept · up to 3 rounds · fair band 1.5 km · within 5 km · 120 s before Borzo · Pidge 600 s · pickup detour 130% · cost guard ₹5 overhead, ₹10 premium";
const card = {
  version: "2026-10-v1", status: "DRAFT", effectiveFrom: "2026-11-03T18:30:00Z", basePaise: 4000, baseDropM: 2000, dropPerKmPaise: 900, pickupFreeM: 1000,
  pickupPerKmPaise: 900, waitFreeMinutes: 8, waitPerMinutePaise: 150, slotGuaranteePerHourPaise: 8000, cancellationFeePaise: 2000, returnPerKmPaise: 900, unreachableWaitMinutes: 10,
  ranges: { basePaise: [3000, 6000] }, summaryOfChanges: { en: ["First version of the Craves rider terms."] },
};
const published = { ...card, version: "2026-10-v3", status: "PUBLISHED", effectiveFrom: at, publishedAt: at };
const pilotRider = { riderId: RIDER, name: "Ravi Kumar", status: "ACTIVE", note: "Madhapur mornings", addedAt: at };
const pilotKitchen = { chefId: CHEF, note: "Asha's kitchen", addedAt: at };
const base = { testMode: true, dispatchPolicy: null, dispatchPolicies: [], rateCard: null, rateCards: [card], pilotRiders: [pilotRider], pilotKitchens: [pilotKitchen] };
let setup: Record<string, unknown> = base;
const rainOff = { level: "off", inForce: "off", auto: false, setByName: null, setAt: null, rainTopUpPaise: 0 };
let rain: Record<string, unknown> = rainOff;
const RAIN_NOTICE = "Rain mode changes how orders are offered, so riders must have been told about it 14 days before its first use. Switch it on only once that notice has gone out.";
const json = (body: unknown, status = 200) => Response.json(body, { status });
const reads = (method: string, path: string) => method === "GET" && path === "setup" ? json(setup)
  : method === "GET" && path === "rain-mode" ? json(rain)
  : method === "GET" && path === "riders?search=sita" ? json({ riders: [{ riderId: SITA, name: "Sita Devi", phoneMasked: "+91 98xxxxx210", status: "ACTIVE", pendingDocuments: 0, pendingDevice: false, createdAt: at }], nextCursor: null })
    : json({ code: "UNMOCKED", message: `${method} ${path}` }, 500);
const sends = () => calls.filter(call => call.method !== "GET");
const button = (name: string | RegExp, scope: HTMLElement = document.body) => within(scope).getByRole("button", { name }) as HTMLButtonElement;
const type = (label: string | RegExp, value: string, scope: HTMLElement = document.body) => fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
const section = async (heading: string) => (await screen.findByRole("heading", { name: heading })).closest("section") as HTMLElement;

beforeEach(() => {
  calls.length = 0;
  setup = base;
  rain = rainOff;
  vi.stubGlobal("confirm", vi.fn(() => true));
  answer = reads;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("pilot setup status", () => {
  it("says dispatch is off, no rate card is published and who test mode lets through", async () => {
    render(createElement(FleetSetup));
    const status = await section("In force now");
    expect(within(status).getByText("Off")).toBeTruthy();
    expect(within(status).getByText("No dispatch policy is in force, so dispatch is off.")).toBeTruthy();
    expect(within(status).getByText("No rate card published yet")).toBeTruthy();
    expect(status.textContent).toContain("Test mode is on: only the riders and kitchens listed below get Craves riders.");
    // Nothing to stop.
    expect(screen.queryByRole("button", { name: "Stop dispatch now" })).toBeNull();
  });

  it("shows live dispatch, the rate card in force and test mode off", async () => {
    setup = { ...base, testMode: false, dispatchPolicy: policy, dispatchPolicies: [policy], rateCard: published, rateCards: [published] };
    render(createElement(FleetSetup));
    const status = await section("In force now");
    expect(within(status).getByText("Live")).toBeTruthy();
    expect(status.textContent).toContain("Version 2026-10-v2, since 22 Oct 2026, 10:00 am IST");
    expect(status.textContent).toContain("In force since 22 Oct 2026, 10:00 am IST");
    expect(status.textContent).toContain("Test mode is off: every active rider and kitchen can get Craves riders.");
    expect(within(await section("Rate card")).getByText("In force")).toBeTruthy();
  });

  it("says when the setup can't load", async () => {
    answer = () => json({ code: "FORBIDDEN" }, 403);
    render(createElement(FleetSetup));
    expect(await screen.findByText("Your admin role can't do this.")).toBeTruthy();
  });
});

describe("dispatch", () => {
  it("shows the built-in values as text with nothing to change them, and each version by its own rules", async () => {
    setup = { ...base, dispatchPolicy: onBuiltIn, dispatchPolicies: [onBuiltIn, { ...policy, version: "2026-10-v1", effectiveFrom: "2026-10-01T04:30:00Z" }], rateCard: published, rateCards: [published] };
    render(createElement(FleetSetup));
    let panel = await section("Dispatch");
    // An older server sends no builtInDispatch: the console shows the same values.
    expect(within(panel).getByText(BUILT_IN_TEXT)).toBeTruthy();
    expect(within(panel).getByText("These are built in: one rider at a time, nearest first, then the next rider — the way food delivery apps hand out orders. Changing them is a code change, and riders get 14 days' notice.")).toBeTruthy();
    expect(within(panel).queryAllByRole("spinbutton")).toHaveLength(0);
    expect(within(panel).queryByRole("checkbox")).toBeNull();
    expect(within(panel).getByRole("cell", { name: "1 at once, 3 rounds, fair band 1.5 km" })).toBeTruthy();
    expect(within(panel).getByRole("cell", { name: "3 at once, 1 round, nearest first" })).toBeTruthy();
    // Riders are shown the built-in values already, so a new version starts at once.
    expect(within(panel).queryByText(/riders get 14 days' notice\. This whole version/)).toBeNull();
    cleanup();

    setup = { ...setup, builtInDispatch: { ...builtIn, offerSeconds: 45 } };
    render(createElement(FleetSetup));
    panel = await section("Dispatch");
    expect(within(panel).getByText(BUILT_IN_TEXT.replace("30 s", "45 s"))).toBeTruthy();
  });

  it("stops dispatch with the values in force after a confirmation that names what it withdraws", async () => {
    const scheduled = { ...policy, version: "2026-10-v4", effectiveFrom: "2030-01-15T04:30:00Z", pickupDetourPercent: 140 };
    const withdrawnEarlier = { ...policy, version: "2026-10-v3", effectiveFrom: "2030-01-01T04:30:00Z", withdrawnAt: at };
    setup = { ...base, dispatchPolicy: policy, dispatchPolicies: [scheduled, withdrawnEarlier, policy], rateCard: published, rateCards: [published] };
    render(createElement(FleetSetup));
    const panel = await section("Dispatch");
    expect(within(panel).getByRole("cell", { name: "Withdrawn 22 Oct 2026, 10:00 am IST" })).toBeTruthy();
    vi.stubGlobal("confirm", vi.fn(() => false));
    fireEvent.click(button("Stop dispatch now", panel));
    expect(window.confirm).toHaveBeenCalledWith("Stop dispatch now? Craves riders get no new offers; Borzo and Pidge take every order. Version 2026-10-v4 (Live, from 15 Jan 2030, 10:00 am IST) will be withdrawn.");
    expect(sends()).toHaveLength(0);

    vi.stubGlobal("confirm", vi.fn(() => true));
    const off = { ...policy, version: "2026-10-v5", mode: "off" };
    answer = (method, path) => method === "POST" ? json(off, 201) : reads(method, path);
    setup = { ...base, dispatchPolicy: off, dispatchPolicies: [off, { ...scheduled, withdrawnAt: "2026-10-22T05:00:00Z" }, withdrawnEarlier, policy], rateCard: published, rateCards: [published] };
    fireEvent.click(button("Stop dispatch now", panel));
    expect(await within(panel).findByText("Dispatch is off.")).toBeTruthy();
    // The server keeps the values riders are shown.
    expect(sends()).toEqual([{ method: "POST", path: "dispatch-policies", key: expect.stringMatching(/^[0-9a-f-]{36}$/), body: { mode: "off" } }]);
    expect(await within(panel).findByRole("cell", { name: "Withdrawn 22 Oct 2026, 10:30 am IST" })).toBeTruthy();
    expect(within(panel).queryByRole("cell", { name: "Scheduled" })).toBeNull();
    expect(within(await section("In force now")).getByText("Off")).toBeTruthy();
  });

  it("warns that a scheduled version still takes over after a change that starts now", async () => {
    const scheduled = { ...policy, version: "2026-10-v4", effectiveFrom: "2030-01-15T04:30:00Z", pickupDetourPercent: 140 };
    setup = { ...base, dispatchPolicy: { ...onBuiltIn, mode: "shadow" }, dispatchPolicies: [scheduled, { ...onBuiltIn, mode: "shadow" }], rateCard: published, rateCards: [published] };
    render(createElement(FleetSetup));
    const panel = await section("Dispatch");
    vi.stubGlobal("confirm", vi.fn(() => false));
    fireEvent.click(button("Save dispatch policy", panel));
    expect(window.confirm).toHaveBeenLastCalledWith("Version 2026-10-v4 (Live) still takes over on 15 Jan 2030, 10:00 am IST.");
    fireEvent.click(within(panel).getByLabelText("Live"));
    fireEvent.click(button("Save dispatch policy", panel));
    expect(window.confirm).toHaveBeenLastCalledWith("Riders will get real orders now (only the pilot riders while test mode is on). Borzo and Pidge still take any order a rider doesn't accept in time. Version 2026-10-v4 (Live) still takes over on 15 Jan 2030, 10:00 am IST.");
    fireEvent.click(within(panel).getByLabelText("Off"));
    fireEvent.click(button("Save dispatch policy", panel));
    expect(window.confirm).toHaveBeenLastCalledWith("Stop dispatch now? Craves riders get no new offers; Borzo and Pidge take every order. Version 2026-10-v4 (Live, from 15 Jan 2030, 10:00 am IST) will be withdrawn.");
    expect(sends()).toHaveLength(0);
  });

  it("treats Off in the form as the emergency stop that keeps today's values", async () => {
    const scheduled = { ...policy, version: "2026-10-v4", effectiveFrom: "2030-01-15T04:30:00Z" };
    setup = { ...base, dispatchPolicy: policy, dispatchPolicies: [scheduled, policy], rateCard: published, rateCards: [published] };
    render(createElement(FleetSetup));
    const panel = await section("Dispatch");
    expect(within(panel).getByLabelText("New offer rules start (IST)")).toBeTruthy();
    fireEvent.click(within(panel).getByLabelText("Off"));
    expect(within(panel).getByText("Off stops dispatch now and keeps today's values.")).toBeTruthy();
    expect(within(panel).queryByLabelText("New offer rules start (IST)")).toBeNull();

    answer = (method, path) => method === "POST" ? json({ ...policy, version: "2026-10-v5", mode: "off" }, 201) : reads(method, path);
    fireEvent.click(button("Save dispatch policy", panel));
    expect(window.confirm).toHaveBeenCalledWith("Stop dispatch now? Craves riders get no new offers; Borzo and Pidge take every order. Version 2026-10-v4 (Live, from 15 Jan 2030, 10:00 am IST) will be withdrawn.");
    expect(await within(panel).findByText("Dispatch is off.")).toBeTruthy();
    expect(within(panel).queryByText("Dispatch policy saved.")).toBeNull();
    expect(sends()).toEqual([{ method: "POST", path: "dispatch-policies", key: expect.stringMatching(/^[0-9a-f-]{36}$/), body: { mode: "off" } }]);
  });

  it("asks before going live and shows the server's refusal", async () => {
    setup = { ...base, dispatchPolicy: { ...policy, mode: "shadow" }, dispatchPolicies: [{ ...policy, mode: "shadow" }] };
    render(createElement(FleetSetup));
    const panel = await section("Dispatch");
    expect((within(panel).getByLabelText("Shadow — logs only") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(panel).getByLabelText("Live"));

    vi.stubGlobal("confirm", vi.fn(() => false));
    fireEvent.click(button("Save dispatch policy", panel));
    expect(window.confirm).toHaveBeenCalledWith("Riders will get real orders now (only the pilot riders while test mode is on). Borzo and Pidge still take any order a rider doesn't accept in time.");
    expect(sends()).toHaveLength(0);

    vi.stubGlobal("confirm", vi.fn(() => true));
    answer = (method, path) => method === "POST" ? json({ code: "RATE_CARD_REQUIRED", message: "Publish a rate card before switching dispatch to live." }, 422) : reads(method, path);
    fireEvent.click(button("Save dispatch policy", panel));
    expect((await within(panel).findByRole("alert")).textContent).toBe("Publish a rate card before switching dispatch to live.");
    // No rate card is published, so riders have no terms yet and the built-in values start at once.
    expect(sends()[0].body).toEqual({ mode: "live" });
  });

  it("asks when the built-in values start once they change riders' terms, 14 days and an hour ahead", async () => {
    // Riders have terms and are shown three nearest at once, one round: the built-in offer rules need notice.
    setup = { ...base, dispatchPolicy: { ...policy, mode: "shadow" }, dispatchPolicies: [{ ...policy, mode: "shadow" }], rateCard: published, rateCards: [published] };
    const before = noticeStart();
    render(createElement(FleetSetup));
    const panel = await section("Dispatch");
    expect(within(panel).getByText(/riders get 14 days' notice\. This whole version/).textContent).toContain("Until then riders keep the offer rules at 3 at once, 1 round, nearest first.");
    // Filled in as 14 days and 1 hour from now; exactly 14 days would bounce off the server's own clock.
    expect([before, noticeStart()]).toContain((within(panel).getByLabelText("New offer rules start (IST)") as HTMLInputElement).value);
    type("New offer rules start (IST)", new Date(Date.now() + 14 * 86_400_000 + 330 * 60_000).toISOString().slice(0, 16), panel);
    fireEvent.click(button("Save dispatch policy", panel));
    expect(within(panel).getByRole("alert").textContent).toBe("Pick a start for the new offer rules at least 14 days and 1 hour from now.");
    expect(sends()).toHaveLength(0);

    answer = (method, path) => method === "POST" ? json({ code: "NOTICE_TOO_SHORT", message: "Choose a start at least 14 days from now." }, 422) : reads(method, path);
    type("New offer rules start (IST)", "2030-01-15T10:00", panel);
    fireEvent.click(button("Save dispatch policy", panel));
    expect((await within(panel).findByRole("alert")).textContent).toBe("Choose a start at least 14 days from now.");
    answer = (method, path) => method === "POST" ? json({ ...onBuiltIn, mode: "shadow", version: "2026-10-v3", effectiveFrom: "2030-01-15T04:30:00Z" }, 201) : reads(method, path);
    fireEvent.click(button("Save dispatch policy", panel));
    expect(await within(panel).findByText("Dispatch policy saved.")).toBeTruthy();
    expect(sends().map(call => call.body)).toEqual(Array(2).fill({ mode: "shadow", effectiveFrom: "2030-01-15T04:30:00.000Z" }));
  });

  it("compares the built-in detour with the one riders are shown, and gives no notice before a rate card is published", async () => {
    // Nothing in force: riders are shown the newest draft's 120%, not the scheduled published version's.
    const draft = { ...onBuiltIn, version: "2026-10-v1", status: "DRAFT", publishedAt: undefined, mode: "off", pickupDetourPercent: 120 };
    const scheduled = { ...onBuiltIn, version: "2026-10-v2", effectiveFrom: "2030-01-15T04:30:00Z" };
    setup = { ...base, dispatchPolicies: [scheduled, draft], rateCard: published, rateCards: [published] };
    render(createElement(FleetSetup));
    let panel = await section("Dispatch");
    expect((within(panel).getByLabelText("Off") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(panel).getByLabelText("Shadow — logs only"));
    expect(within(panel).getByLabelText("New detour starts (IST)")).toBeTruthy();
    expect(within(panel).getByText(/riders get 14 days' notice\. This whole version/).textContent).toContain("Until then riders keep the detour at 120%.");
    cleanup();

    // No published rate card yet: riders have no terms, so the built-in values start at once.
    setup = { ...base, dispatchPolicy: { ...policy, mode: "shadow" }, dispatchPolicies: [{ ...policy, mode: "shadow" }] };
    answer = (method, path) => method === "POST" ? json({ ...onBuiltIn, mode: "shadow", version: "2026-10-v3" }, 201) : reads(method, path);
    render(createElement(FleetSetup));
    panel = await section("Dispatch");
    expect(within(panel).queryByLabelText(/start/)).toBeNull();
    fireEvent.click(button("Save dispatch policy", panel));
    expect(await within(panel).findByText("Dispatch policy saved.")).toBeTruthy();
    expect(sends()[0].body).toEqual({ mode: "shadow" });
  });
});

describe("rain mode", () => {
  it("is off with the notice shown, and goes on only after a confirmation that names the notice", async () => {
    render(createElement(FleetSetup));
    const panel = await section("Rain mode");
    expect(await within(panel).findByText("In force now: Off")).toBeTruthy();
    expect(within(panel).getByText(RAIN_NOTICE)).toBeTruthy();
    expect(panel.textContent).toContain("riders get at least 45 s to accept and an order at most 2 rounds, the search for a rider starts 5 minutes earlier");
    expect(panel.textContent).toContain("Never switched on. The automatic switch is off. It is a server setting; this page can't change it.");
    expect(within(panel).getByText("The rate card in force has no rain top-up, so offers add none.")).toBeTruthy();
    expect((within(panel).getByLabelText("Off") as HTMLInputElement).checked).toBe(true);

    fireEvent.click(within(panel).getByLabelText("On"));
    vi.stubGlobal("confirm", vi.fn(() => false));
    fireEvent.click(button("Save rain mode", panel));
    expect(window.confirm).toHaveBeenCalledWith(`Switch rain mode on? ${RAIN_NOTICE}`);
    expect(sends()).toHaveLength(0);

    vi.stubGlobal("confirm", vi.fn(() => true));
    answer = (method, path) => method === "PUT" ? json({ ...rainOff, level: "on", inForce: "on", setByName: "Admin +91 98xxxxx210", setAt: at }) : reads(method, path);
    fireEvent.click(button("Save rain mode", panel));
    expect(await within(panel).findByText("Rain mode saved.")).toBeTruthy();
    expect(sends()).toEqual([{ method: "PUT", path: "rain-mode", key: expect.stringMatching(/^[0-9a-f-]{36}$/), body: { level: "on" } }]);
    expect(within(panel).getByText("In force now: On")).toBeTruthy();
    expect(panel.textContent).toContain("Set to On by Admin +91 98xxxxx210, 22 Oct 2026, 10:00 am IST.");
  });

  it("asks before severe, and turns rain mode off without asking", async () => {
    rain = { ...rainOff, level: "on", inForce: "on", setByName: "Asha", setAt: at };
    render(createElement(FleetSetup));
    const panel = await section("Rain mode");
    await within(panel).findByText("In force now: On");
    fireEvent.click(within(panel).getByLabelText("Severe — new orders straight to Borzo or Pidge"));
    vi.stubGlobal("confirm", vi.fn(() => false));
    fireEvent.click(button("Save rain mode", panel));
    expect(window.confirm).toHaveBeenCalledWith(`Switch rain mode to severe? New orders go straight to Borzo or Pidge. ${RAIN_NOTICE}`);

    answer = (method, path) => method === "PUT" ? json({ ...rainOff, setByName: "Asha", setAt: at }) : reads(method, path);
    fireEvent.click(within(panel).getByLabelText("Off"));
    fireEvent.click(button("Save rain mode", panel));
    expect(await within(panel).findByText("Rain mode saved.")).toBeTruthy();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(sends().map(call => call.body)).toEqual([{ level: "off" }]);
    expect(within(panel).getByText("In force now: Off")).toBeTruthy();
  });

  it("says when it came on by itself, and the rain top-up of the rate card in force", async () => {
    rain = { ...rainOff, inForce: "on", auto: true, rainTopUpPaise: 2000 };
    render(createElement(FleetSetup));
    const panel = await section("Rain mode");
    expect(await within(panel).findByText("In force now: On, switched on by itself: the last 30 minutes' rides to the door took 1.3 times their predicted minutes.")).toBeTruthy();
    expect(panel.textContent).toContain("The automatic switch is on: while this is Off, rain mode comes on by itself when rides run 1.3 times their predicted minutes.");
    expect(within(panel).getByText("Rain top-up on the rate card in force: ₹20.00 an order.")).toBeTruthy();
    expect((within(panel).getByLabelText("Off") as HTMLInputElement).checked).toBe(true);
  });

  it("keeps the rest of the page when rain mode can't be read", async () => {
    answer = (method, path) => path === "rain-mode" ? json({ code: "FLEET_OPERATION_NOT_FOUND", message: "This fleet operation does not exist." }, 404) : reads(method, path);
    render(createElement(FleetSetup));
    const panel = await section("Rain mode");
    expect(await within(panel).findByText("This fleet operation does not exist.")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Save rain mode" })).toBeNull();
    expect(within(await section("Dispatch")).getByRole("button", { name: "Save dispatch policy" })).toBeTruthy();
  });
});

describe("rate card", () => {
  it("publishes the first card at once after a confirmation", async () => {
    render(createElement(FleetSetup));
    const panel = await section("Rate card");
    const row = within(panel).getByText("2026-10-v1").closest("tr") as HTMLElement;
    expect(row.textContent).toContain("₹40.00");
    expect(row.textContent).toContain("2 km");
    expect(row.textContent).toContain("₹80.00");

    vi.stubGlobal("confirm", vi.fn(() => false));
    fireEvent.click(button("Publish 2026-10-v1", row));
    expect(window.confirm).toHaveBeenCalledWith("Publish rate card 2026-10-v1? It is the first rate card, so it takes effect at once (or at 4 Nov 2026, 12:00 am IST, if that is later). Riders are paid by it from then.");
    expect(sends()).toHaveLength(0);

    vi.stubGlobal("confirm", vi.fn(() => true));
    answer = (method, path) => method === "POST" ? json({ ...card, status: "PUBLISHED", effectiveFrom: at, publishedAt: at }) : reads(method, path);
    fireEvent.click(button("Publish 2026-10-v1", row));
    expect(await within(row).findByText("Rate card published.")).toBeTruthy();
    expect(sends()).toEqual([{ method: "POST", path: "rate-cards/2026-10-v1/publish", key: expect.stringMatching(/^[0-9a-f-]{36}$/), body: undefined }]);
    await waitFor(() => expect(calls.filter(call => call.path === "setup")).toHaveLength(2));
  });

  it("says a later card needs 14 days' notice and shows the server's refusal", async () => {
    setup = { ...base, rateCard: published, rateCards: [{ ...card, version: "2026-10-v4" }, published] };
    render(createElement(FleetSetup));
    const panel = await section("Rate card");
    answer = (method, path) => method === "POST" ? json({ code: "VERSION_REFUSED", message: "It must start 14 days after publishing." }, 422) : reads(method, path);
    fireEvent.click(button("Publish 2026-10-v4", panel));
    expect(vi.mocked(window.confirm).mock.calls[0][0]).toMatch(/^Publish rate card 2026-10-v4\? Rate cards after the first need 14 days' notice: it starts 4 Nov 2026, 12:00 am IST, which must be on or after .+ IST\.$/);
    expect((await within(panel).findByRole("alert")).textContent).toBe("It must start 14 days after publishing.");
    // Ranges are fixed once a card is published, and a later draft starts 14 days and 1 hour from now.
    expect(within(panel).queryByText("Allowed ranges")).toBeNull();
    const form = within(panel).getByRole("heading", { name: "New draft" }).closest("form") as HTMLElement;
    expect((within(form).getByLabelText("Starts (IST)") as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    type("Starts (IST)", new Date(Date.now() + 14 * 86_400_000 + 330 * 60_000).toISOString().slice(0, 16), form);
    type(/What changes, in English/, "Base pay is ₹42.", form);
    fireEvent.click(button("Save draft", form));
    expect(within(form).getByRole("alert").textContent).toBe("Pick a start at least 14 days and 1 hour from now: riders get 14 days' notice.");
  });

  it("saves a first draft with its ranges in paise and metres", async () => {
    render(createElement(FleetSetup));
    const form = (await screen.findByRole("heading", { name: "New draft" })).closest("form") as HTMLElement;
    expect((within(form).getByLabelText("Base pay, ₹") as HTMLInputElement).value).toBe("40.00");
    expect((within(form).getByLabelText("Base pay, ₹: lowest") as HTMLInputElement).value).toBe("30.00");
    fireEvent.click(button("Save draft", form));
    expect(within(form).getByRole("alert").textContent).toBe("Enter the lowest and highest “Drop distance in the base pay, km”.");

    for (const label of ["Drop distance in the base pay, km", "Free pickup distance, km"]) { type(`${label}: lowest`, "0.5", form); type(`${label}: highest`, "3", form); }
    for (const label of ["Each drop km after that, ₹", "Each pickup km after that, ₹", "Each waiting minute after that, ₹", "Slot guarantee, ₹ an hour", "Cancellation fee at the kitchen, ₹", "Each km returning food, ₹"]) {
      type(`${label}: lowest`, "0", form); type(`${label}: highest`, "200", form);
    }
    for (const label of ["Free waiting, minutes", "Wait for an unreachable customer, minutes"]) { type(`${label}: lowest`, "5", form); type(`${label}: highest`, "15", form); }
    type("Base pay, ₹", "42.5", form);
    // Rain mode's top-up has no declared range: it only adds to pay.
    expect((within(form).getByLabelText("Rain top-up an order while rain mode is on, ₹") as HTMLInputElement).value).toBe("0.00");
    expect(within(form).queryByLabelText(/Rain top-up.*: lowest/)).toBeNull();
    type("Rain top-up an order while rain mode is on, ₹", "15", form);
    type("Starts (IST)", "2026-10-22T10:00", form);
    type(/What changes, in English/, "Base pay is ₹42.50.\nWaiting is paid after 8 minutes.", form);
    answer = (method, path) => method === "POST" ? json({ ...card, version: "2026-10-v2", basePaise: 4250 }, 201) : reads(method, path);
    fireEvent.click(button("Save draft", form));
    expect(await within(form).findByText("Draft saved. Check it in the table, then publish it.")).toBeTruthy();
    const body = sends()[0].body as Record<string, unknown> & { ranges: Record<string, number[]> };
    expect(body).toMatchObject({ basePaise: 4250, baseDropM: 2000, waitPerMinutePaise: 150, rainTopUpPaise: 1500, effectiveFrom: "2026-10-22T04:30:00.000Z", summaryOfChanges: { en: ["Base pay is ₹42.50.", "Waiting is paid after 8 minutes."] } });
    expect([body.ranges.basePaise, body.ranges.baseDropM, body.ranges.slotGuaranteePerHourPaise, body.ranges.waitFreeMinutes]).toEqual([[3000, 6000], [500, 3000], [0, 20000], [5, 15]]);
  });
});

describe("pilot zone", () => {
  it("says the lists apply only while test mode is on, and production runs with it off", async () => {
    const rule = "The list applies only while test mode is on; production runs with test mode off, so orders from every kitchen go to every eligible rider.";
    render(createElement(FleetSetup));
    expect(within(await section("Pilot riders")).getByText(`Test mode is on: only these riders get Craves offers. ${rule}`)).toBeTruthy();
    expect(within(await section("Pilot kitchens")).getByText(`Test mode is on: only orders from these kitchens go to Craves riders. ${rule}`)).toBeTruthy();
    cleanup();

    setup = { ...base, testMode: false };
    render(createElement(FleetSetup));
    for (const heading of ["Pilot riders", "Pilot kitchens"]) expect(within(await section(heading)).getByText(`Test mode is off: this list isn't used now. ${rule}`)).toBeTruthy();
  });

  it("finds a rider and adds them with a note, then removes a rider after a confirmation", async () => {
    render(createElement(FleetSetup));
    const panel = await section("Pilot riders");
    const row = within(panel).getByRole("link", { name: "Ravi Kumar" }).closest("tr") as HTMLElement;
    expect(within(row).getByRole("link").getAttribute("href")).toBe(`/admin/riders/${RIDER}`);
    expect(row.textContent).toContain("Madhapur mornings");

    type("Find a rider", " sita ", panel);
    fireEvent.click(button("Find riders", panel));
    expect(await within(panel).findByRole("option", { name: "Sita Devi · +91 98xxxxx210 · Active" })).toBeTruthy();
    type("Note (optional)", " Kondapur ", panel);
    answer = (method, path) => method === "PUT" ? json({ riderId: SITA, name: "Sita Devi", status: "ACTIVE", note: "Kondapur", addedAt: at }) : reads(method, path);
    fireEvent.click(button("Add to pilot", panel));
    expect(await within(panel).findByText("Rider added to the pilot.")).toBeTruthy();
    expect(sends()[0]).toMatchObject({ method: "PUT", path: `pilot/riders/${SITA}`, body: { note: "Kondapur" } });

    vi.stubGlobal("confirm", vi.fn(() => true));
    answer = (method, path) => method === "DELETE" ? new Response(null, { status: 204 }) : reads(method, path);
    setup = { ...base, pilotRiders: [] };
    fireEvent.click(button("Remove Ravi Kumar", row));
    expect(window.confirm).toHaveBeenCalledWith("Remove Ravi Kumar from the pilot? While test mode is on, they get no new Craves offers.");
    expect(await within(panel).findByText("No pilot riders yet.")).toBeTruthy();
    expect(sends()[1]).toMatchObject({ method: "DELETE", path: `pilot/riders/${RIDER}`, body: undefined });
  });

  it("adds a kitchen by its chef ID without a note and keeps a row whose removal failed", async () => {
    render(createElement(FleetSetup));
    const panel = await section("Pilot kitchens");
    expect(within(panel).getByText(/copy their Identity ID/).textContent).toContain("All chef applications");
    type("Chef ID", "chef-42", panel);
    fireEvent.click(button("Add kitchen", panel));
    expect(within(panel).getByRole("alert").textContent).toBe("Paste the chef's Identity ID: 36 letters, digits and dashes.");

    const other = "44444444-4444-4444-8444-444444444444";
    answer = (method, path) => method === "PUT" ? json({ chefId: other, addedAt: at }) : reads(method, path);
    type("Chef ID", ` ${other.toUpperCase()} `, panel);
    fireEvent.click(button("Add kitchen", panel));
    expect(await within(panel).findByText("Kitchen added to the pilot.")).toBeTruthy();
    expect(sends()[0]).toMatchObject({ method: "PUT", path: `pilot/kitchens/${other}`, body: undefined });

    answer = (method, path) => method === "DELETE" ? json({ code: "FORBIDDEN" }, 403) : reads(method, path);
    const row = within(panel).getByText(CHEF).closest("tr") as HTMLElement;
    fireEvent.click(button(`Remove kitchen ${CHEF}`, row));
    expect((await within(row).findByRole("alert")).textContent).toBe("Your admin role can't do this.");
    expect(within(panel).getByText(CHEF)).toBeTruthy();
  });
});
