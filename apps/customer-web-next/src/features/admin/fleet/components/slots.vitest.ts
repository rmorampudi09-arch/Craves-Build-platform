// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, istDay } from "@/features/admin/fleet/lib/payout-contract";
import { FleetSlots } from "./fleet-slots";

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
const SLOT = "77777777-7777-4777-8777-777777777777";
const at = "2026-10-20T06:30:00Z";
const rider = (riderId: string, name: string) => ({ riderId, name, phoneMasked: "+91 98xxxxx210", status: "ACTIVE", pendingDocuments: 0, pendingDevice: false, createdAt: at });
const slot = { slotId: SLOT, riderId: RIDER, riderName: "Ravi Kumar", zoneName: "Madhapur", startsAt: "2026-10-21T12:30:00Z", endsAt: "2026-10-21T16:30:00Z", guaranteedPerHourPaise: 8000, status: "BOOKED" };
const done = { ...slot, slotId: "66666666-6666-4666-8666-666666666666", status: "COMPLETED", onlineInZoneMinutes: 214, topUpPaise: 6550 };
const banner = { tone: "warning", text: "Heavy rain in Madhapur. Ride slowly.", until: "2030-01-15T16:30:00Z" };
const lists = (method: string, path: string) => method !== "GET" ? json({ code: "UNMOCKED", message: path }, 500)
  // Two pages, newest first; the pickers read both and sort by name.
  : path === "riders?status=ACTIVE" ? json({ riders: [rider(SITA, "Sita Devi")], nextCursor: "page-2" })
    : path === "riders?status=ACTIVE&cursor=page-2" ? json({ riders: [rider(RIDER, "Ravi Kumar")], nextCursor: null })
    : path.startsWith("slots?") ? json({ slots: [slot, done] })
      : path === "banner" ? new Response(null, { status: 204 }) : json({ code: "UNMOCKED", message: path }, 500);
const json = (body: unknown, status = 200) => Response.json(body, { status });
const posts = () => calls.filter(call => call.method !== "GET");
const gets = (prefix: string) => calls.filter(call => call.method === "GET" && call.path.startsWith(prefix)).map(call => call.path);
const button = (name: string | RegExp, scope: HTMLElement = document.body) => within(scope).getByRole("button", { name }) as HTMLButtonElement;
const type = (label: string | RegExp, value: string, scope: HTMLElement = document.body) => fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
const section = (heading: string) => screen.getByRole("heading", { name: heading }).closest("section, form") as HTMLElement;
/** IST wall time n hours from now, as a datetime-local value, whatever zone the test machine uses. */
const localInput = (hoursAhead: number) => new Date(Date.now() + hoursAhead * 3_600_000 + 330 * 60_000).toISOString().slice(0, 16);

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("confirm", vi.fn(() => true));
  answer = lists;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("slots", () => {
  it("lists this week's slots in IST with the guarantee and the top-up, and filters by days and rider", async () => {
    render(createElement(FleetSlots));
    const row = (await screen.findAllByText("Ravi Kumar", { selector: "a" }))[0].closest("tr") as HTMLElement;
    expect(row.textContent).toContain("21 Oct 2026, 6:00 pm – 10:00 pm IST");
    expect(row.textContent).toContain("₹80.00 an hour");
    expect(screen.getByText("214 min").closest("tr")?.textContent).toContain("₹65.50");
    expect(gets("slots?")).toEqual([`slots?from=${istDay()}&to=${addDays(istDay(), 6)}`]);

    const filters = section("Slots");
    type("Last day", "2026-10-01", filters);
    fireEvent.click(button("Show slots", filters));
    expect(within(filters).getByRole("status").textContent).toBe("The last day must be on or after the first day.");
    type("First day", "2026-10-01", filters);
    type("Last day", "2026-11-15", filters);
    fireEvent.click(button("Show slots", filters));
    expect(within(filters).getByRole("status").textContent).toBe("Show at most 31 days at a time.");
    expect(gets("slots?")).toHaveLength(1);

    type("Last day", "2026-10-31", filters);
    fireEvent.change(within(filters).getByLabelText("Rider"), { target: { value: SITA } });
    answer = (method, path) => path.startsWith("slots?") ? json({ slots: [] }) : lists(method, path);
    fireEvent.click(button("Show slots", filters));
    expect(await within(filters).findByText("No slots on these days.")).toBeTruthy();
    expect(gets("slots?")[1]).toBe(`slots?from=2026-10-01&to=2026-10-31&riderId=${SITA}`);
  });

  it("books a slot from IST times and rupees, through every state", async () => {
    render(createElement(FleetSlots));
    const form = (await screen.findByRole("heading", { name: "Book a slot" })).closest("form") as HTMLElement;
    await waitFor(() => expect(within(form).getAllByRole("option")).toHaveLength(3));
    expect(within(form).getAllByRole("option").map(option => option.textContent)).toEqual(["Choose…", "Ravi Kumar", "Sita Devi"]);
    expect(gets("riders?")).toEqual(["riders?status=ACTIVE", "riders?status=ACTIVE&cursor=page-2"]);
    fireEvent.click(button("Book slot", form));
    expect(within(form).getByRole("alert").textContent).toBe("Choose the rider.");

    fireEvent.change(within(form).getByLabelText("Rider for the slot"), { target: { value: RIDER } });
    type("Zone", "Madhapur", form);
    type("Day", "2030-01-15", form);
    type("Starts (IST)", "18:00", form);
    type("Ends (IST)", "18:00", form);
    type("Guarantee, ₹ an hour", "80.5", form);
    fireEvent.click(button("Book slot", form));
    expect(within(form).getByRole("alert").textContent).toBe("The slot must end after it starts.");
    type("Ends (IST)", "22:00", form);
    type("Guarantee, ₹ an hour", "eighty", form);
    fireEvent.click(button("Book slot", form));
    expect(within(form).getByRole("alert").textContent).toBe("Enter the guarantee in rupees an hour, like 80 or 80.50.");
    expect(posts()).toHaveLength(0);

    answer = (method, path) => method === "POST" ? json({ code: "FORBIDDEN", message: "OPERATIONS_ADMIN only" }, 403) : lists(method, path);
    type("Guarantee, ₹ an hour", "80.5", form);
    fireEvent.click(button("Book slot", form));
    expect((await within(form).findByRole("alert")).textContent).toBe("Your admin role can't do this.");

    answer = (method, path) => method === "POST" ? json({ code: "SLOT_OVERLAP", message: "Ravi Kumar already has a slot from 7 pm to 11 pm." }, 409) : lists(method, path);
    fireEvent.click(button("Book slot", form));
    expect((await within(form).findByRole("alert")).textContent).toBe("Ravi Kumar already has a slot from 7 pm to 11 pm.");

    let finish!: (response: Response) => void;
    answer = (method, path) => method === "POST" ? new Promise(resolve => { finish = resolve; }) : lists(method, path);
    fireEvent.click(button("Book slot", form));
    expect(await within(form).findByText("Saving…")).toBeTruthy();
    expect(button("Book slot", form).disabled).toBe(true);
    finish(json(slot, 201));
    expect(await within(form).findByText("Slot booked.")).toBeTruthy();

    expect(posts()).toHaveLength(3);
    for (const call of posts()) {
      // 18:00–22:00 IST on 15 Jan 2030, ₹80.50 → 8050 paise, the same key for the same booking.
      expect(call).toMatchObject({ path: "slots", key: posts()[0].key, body: { riderId: RIDER, zoneName: "Madhapur", startsAt: "2030-01-15T12:30:00.000Z", endsAt: "2030-01-15T16:30:00.000Z", guaranteedPerHourPaise: 8050 } });
    }
    await waitFor(() => expect(gets("slots?")).toHaveLength(2));
    expect((within(form).getByLabelText("Starts (IST)") as HTMLInputElement).value).toBe("");
    expect((within(form).getByLabelText("Zone") as HTMLInputElement).value).toBe("Madhapur");
  });

  it("shows the server's rate card refusal", async () => {
    answer = (method, path) => method === "POST" ? json({ code: "GUARANTEE_OUT_OF_RANGE", message: "The rate card allows ₹60 to ₹120 an hour." }, 422) : lists(method, path);
    render(createElement(FleetSlots));
    const form = (await screen.findByRole("heading", { name: "Book a slot" })).closest("form") as HTMLElement;
    await waitFor(() => expect(within(form).getAllByRole("option")).toHaveLength(3));
    fireEvent.change(within(form).getByLabelText("Rider for the slot"), { target: { value: SITA } });
    type("Zone", "Kondapur", form);
    type("Starts (IST)", "07:00", form);
    type("Ends (IST)", "11:00", form);
    type("Guarantee, ₹ an hour", "500", form);
    fireEvent.click(button("Book slot", form));
    expect((await within(form).findByRole("alert")).textContent).toBe("The rate card allows ₹60 to ₹120 an hour.");
    expect(posts()[0].body).toMatchObject({ riderId: SITA, guaranteedPerHourPaise: 50000, startsAt: `${istDay()}T01:30:00.000Z` });
  });

  it("books a slot that runs past midnight IST and lists it with both dates", async () => {
    const late = { ...slot, startsAt: "2030-01-15T16:30:00Z", endsAt: "2030-01-15T20:30:00Z" };
    answer = (method, path) => method === "POST" ? json(late, 201) : path.startsWith("slots?") ? json({ slots: [late] }) : lists(method, path);
    render(createElement(FleetSlots));
    expect((await screen.findByText("Ravi Kumar", { selector: "a" })).closest("tr")?.textContent).toContain("15 Jan 2030, 10:00 pm – 16 Jan 2030, 2:00 am IST");
    const form = screen.getByRole("heading", { name: "Book a slot" }).closest("form") as HTMLElement;
    await waitFor(() => expect(within(form).getAllByRole("option")).toHaveLength(3));
    fireEvent.change(within(form).getByLabelText("Rider for the slot"), { target: { value: RIDER } });
    type("Zone", "Madhapur", form);
    type("Day", "2030-01-15", form);
    type("Starts (IST)", "22:00", form);
    type("Ends (IST)", "02:00", form);
    expect(within(form).getByLabelText("Ends (IST), next day")).toBeTruthy();
    type("Guarantee, ₹ an hour", "80.10", form);
    fireEvent.click(button("Book slot", form));
    expect(await within(form).findByText("Slot booked.")).toBeTruthy();
    // 22:00 on 15 Jan to 02:00 on 16 Jan IST; ₹80.10 is 8010 paise.
    expect(posts()[0].body).toMatchObject({ startsAt: "2030-01-15T16:30:00.000Z", endsAt: "2030-01-15T20:30:00.000Z", guaranteedPerHourPaise: 8010 });
  });

  it("says when riders or slots can't load", async () => {
    answer = (method, path) => /^(riders|slots)\?/.test(path) ? json({ code: "FLEET_UNAVAILABLE", message: "The fleet service is busy." }, 503) : lists(method, path);
    render(createElement(FleetSlots));
    expect(await within(section("Slots")).findByText("The fleet service is busy.")).toBeTruthy();
    expect(await within(section("Book a slot")).findByText("The fleet service is busy.")).toBeTruthy();
  });

  it("cancels a booked slot only with a reason and a confirmation", async () => {
    render(createElement(FleetSlots));
    const row = (await screen.findAllByText("Ravi Kumar", { selector: "a" }))[0].closest("tr") as HTMLElement;
    expect(within(screen.getByText("214 min").closest("tr") as HTMLElement).queryByRole("button")).toBeNull();
    fireEvent.click(button("Cancel slot", row));
    fireEvent.click(button("Cancel slot", row));
    expect(within(row).getByRole("alert").textContent).toBe("Write a reason of at least 3 characters.");

    vi.stubGlobal("confirm", vi.fn(() => false));
    type(/Reason for/, "Rider is unwell today", row);
    fireEvent.click(button("Cancel slot", row));
    expect(posts()).toHaveLength(0);

    vi.stubGlobal("confirm", vi.fn(() => true));
    answer = (method, path) => method === "POST" ? json({ code: "FLEET_UNAVAILABLE", message: "The fleet service is busy. Try again." }, 503) : lists(method, path);
    fireEvent.click(button("Cancel slot", row));
    expect(window.confirm).toHaveBeenCalledWith("Cancel Ravi Kumar's slot, 21 Oct 2026, 6:00 pm – 10:00 pm IST? The rider loses its guarantee.");
    expect((await within(row).findByRole("alert")).textContent).toBe("The fleet service is busy. Try again.");

    let finish!: (response: Response) => void;
    answer = (method, path) => method === "POST" ? new Promise(resolve => { finish = resolve; }) : path.startsWith("slots?") ? json({ slots: [{ ...slot, status: "CANCELLED" }] }) : lists(method, path);
    fireEvent.click(button("Cancel slot", row));
    expect(await within(row).findByText("Saving…")).toBeTruthy();
    finish(json({ ...slot, status: "CANCELLED" }));
    expect(await within(row).findByText("Slot cancelled.")).toBeTruthy();
    expect(row.textContent).toContain("Cancelled");
    expect(posts()).toHaveLength(2);
    // The retry after a failure keeps the same Idempotency-Key.
    for (const call of posts()) expect(call).toMatchObject({ method: "POST", path: `slots/${SLOT}/cancel`, body: { reason: "Rider is unwell today" }, key: posts()[0].key });
    expect(posts()[0].key).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("zone banner", () => {
  it("shows a banner with a 160-character counter, through every state", async () => {
    render(createElement(FleetSlots));
    const panel = section("Zone banner");
    expect(await within(panel).findByText("No banner is showing.")).toBeTruthy();
    fireEvent.click(button("Show banner", panel));
    expect(within(panel).getByRole("alert").textContent).toBe("Write the banner text.");

    // The counter counts what is sent and what the server counts: the trimmed text.
    type("Banner text", `  ${banner.text} `, panel);
    expect(within(panel).getByText("36 of 160 characters")).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("Tone"), { target: { value: "warning" } });
    type("Show until (IST)", localInput(-1), panel);
    fireEvent.click(button("Show banner", panel));
    expect(within(panel).getByRole("alert").textContent).toBe("Pick a time in the future.");
    expect(posts()).toHaveLength(0);

    answer = (method, path) => method === "PUT" ? json({ code: "FORBIDDEN" }, 403) : lists(method, path);
    type("Show until (IST)", "2030-01-15T22:00", panel);
    fireEvent.click(button("Show banner", panel));
    expect((await within(panel).findByRole("alert")).textContent).toBe("Your admin role can't do this.");

    let finish!: (response: Response) => void;
    answer = (method, path) => method === "PUT" ? new Promise(resolve => { finish = resolve; }) : lists(method, path);
    fireEvent.click(button("Show banner", panel));
    expect(await within(panel).findByText("Saving…")).toBeTruthy();
    finish(json(banner));
    expect(await within(panel).findByText("Banner is showing on riders' Home.")).toBeTruthy();
    expect(within(panel).getByText(banner.text)).toBeTruthy();
    expect(within(panel).getByText("Warning", { selector: ".cr-status" })).toBeTruthy();
    expect(within(panel).getByText(/^until 15 Jan 2030, 10:00 pm IST$/i)).toBeTruthy();
    expect(posts().map(call => [call.method, call.path, call.body])).toEqual(Array(2).fill(["PUT", "banner", { ...banner, until: "2030-01-15T16:30:00.000Z" }]));
  });

  it("clears the banner after a confirmation and shows a refusal", async () => {
    answer = (method, path) => path === "banner" && method === "GET" ? json(banner) : lists(method, path);
    render(createElement(FleetSlots));
    const panel = section("Zone banner");
    expect(await within(panel).findByText(banner.text)).toBeTruthy();

    answer = (method, path) => method === "DELETE" ? json({ code: "FORBIDDEN", message: "No." }, 403) : path === "banner" ? json(banner) : lists(method, path);
    fireEvent.click(button("Clear banner", panel));
    expect((await within(panel).findByRole("alert")).textContent).toBe("Your admin role can't do this.");
    expect(within(panel).getByText(banner.text)).toBeTruthy();

    answer = (method, path) => method === "DELETE" ? new Response(null, { status: 204 }) : lists(method, path);
    fireEvent.click(button("Clear banner", panel));
    expect(await within(panel).findByText("Banner cleared.")).toBeTruthy();
    expect(await within(panel).findByText("No banner is showing.")).toBeTruthy();
    expect(within(panel).queryByText(banner.text)).toBeNull();
    expect(posts().map(call => [call.method, call.path, call.body])).toEqual([["DELETE", "banner", undefined], ["DELETE", "banner", undefined]]);
    expect(posts()[0].key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("shows the server's refusal to read the banner in its own section", async () => {
    answer = (method, path) => path === "banner" ? json({ code: "FORBIDDEN" }, 403) : lists(method, path);
    render(createElement(FleetSlots));
    expect(await within(section("Zone banner")).findByText("Your admin role can't do this.")).toBeTruthy();
    expect(await screen.findAllByText("Ravi Kumar", { selector: "a" })).toHaveLength(2);
  });
});
