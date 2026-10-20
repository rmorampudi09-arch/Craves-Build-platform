// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FleetTrips } from "./fleet-trips";

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
const IDLE = "88888888-8888-4888-8888-888888888888";
const TRIP = "77777777-7777-4777-8777-777777777777";
const QUEUED = "66666666-6666-4666-8666-666666666666";
const at = "2026-10-20T06:30:00Z";
const trip = { tripId: TRIP, orderCode: "#0BDE0107", kitchenName: "Lakshmi's Kitchen", dropArea: "Madhapur", state: "PICKED_UP", provider: "CRAVES_FLEET", riderId: RIDER, riderName: "Ravi Kumar", createdAt: at, updatedAt: at };
const queueItem = (tripId: string, orderCode: string, alertLevel: string) => ({ tripId, orderCode, kitchenName: "Anu's Kitchen", dropArea: "Kondapur", queuedAt: at, alertLevel, alertMessage: `${alertLevel} alert for ${orderCode}`, attempts: [{ provider: "PIDGE", outcome: "NO_COURIER", at }] });
const position = (riderId: string, riderName: string, extra: object) => ({ riderId, riderName, lat: 17.44, lng: 78.38, recordedAt: at, ageSeconds: 75, onShift: true, onTrip: false, tripId: null, mock: false, ...extra });
const lists: Record<string, unknown> = {
  trips: { trips: [trip] },
  "dispatch-queue": { items: [queueItem(QUEUED, "#0BDE0101", "WARNING"), queueItem("55555555-5555-4555-8555-555555555555", "#0BDE0102", "CRITICAL")] },
  positions: { positions: [position(RIDER, "Ravi Kumar", { onTrip: true, tripId: TRIP }), position(IDLE, "Sita Devi", {}), position("99999999-9999-4999-8999-999999999999", "Mock Rider", { mock: true })] },
};
const json = (body: unknown, status = 200) => Response.json(body, { status });
const posts = () => calls.filter(call => call.method !== "GET");
const button = (name: string | RegExp, scope: HTMLElement = document.body) => within(scope).getByRole("button", { name }) as HTMLButtonElement;

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("confirm", vi.fn(() => true));
  answer = (method, path) => method === "GET" ? json(lists[path]) : json({ code: "UNMOCKED", message: path }, 500);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("trips and dispatch", () => {
  it("puts critical queue alerts first and lists positions with their age and mock flag", async () => {
    render(createElement(FleetTrips));
    expect(await screen.findByText("2 trips without a courier after fleet, Borzo and Pidge · 1 critical.")).toBeTruthy();
    const alerts = screen.getAllByText(/alert for/).map(node => node.textContent);
    expect(alerts).toEqual(["CRITICAL alert for #0BDE0102", "WARNING alert for #0BDE0101"]);
    expect(screen.getAllByText("Tried: Pidge (No courier)")).toHaveLength(2);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Mock Rider").closest("tr")?.textContent).toContain("mock location reported");
    expect(within(table).getByText("Sita Devi").closest("tr")?.textContent).toContain("1 min ago");
    expect(within(table).getByText("Ravi Kumar").closest("tr")?.textContent).toContain("On a trip");
  });

  it("reassigns only to an idle, real rider or a 3PL, with a reason and a confirmation", async () => {
    render(createElement(FleetTrips));
    const card = (await screen.findByText("WARNING alert for #0BDE0101")).closest("article") as HTMLElement;
    fireEvent.click(button("Reassign", card));
    const select = within(card).getByLabelText("New courier for #0BDE0101") as HTMLSelectElement;
    expect([...select.options].map(option => option.textContent)).toEqual(["Choose…", "Sita Devi (waiting, seen 1 min ago)", "Borzo", "Pidge"]);

    const reason = within(card).getByLabelText("Reason");
    fireEvent.change(reason, { target: { value: "Rider is next to the kitchen" } });
    fireEvent.click(button("Reassign #0BDE0101", card));
    expect(within(card).getByRole("alert").textContent).toBe("Choose one new courier: a rider, Borzo or Pidge.");
    fireEvent.change(select, { target: { value: IDLE } });
    fireEvent.change(reason, { target: { value: " " } });
    fireEvent.click(button("Reassign #0BDE0101", card));
    expect(within(card).getByRole("alert").textContent).toBe("Write a reason of at least 3 characters.");
    expect(posts()).toHaveLength(0);

    let finish!: (response: Response) => void;
    answer = (method, path) => method === "POST" ? new Promise(resolve => { finish = resolve; }) : json(lists[path]);
    fireEvent.change(reason, { target: { value: "Rider is next to the kitchen" } });
    fireEvent.click(button("Reassign #0BDE0101", card));
    expect(window.confirm).toHaveBeenCalledWith("Reassign #0BDE0101 to Sita Devi? The current courier is released first.");
    expect(await within(card).findByText("Saving…")).toBeTruthy();
    expect(posts()[0]).toMatchObject({ path: `trips/${QUEUED}/reassign`, body: { riderId: IDLE, reason: "Rider is next to the kitchen" } });
    expect(posts()[0].key).toMatch(/^[0-9a-f-]{36}$/);
    finish(json({ ...trip, tripId: QUEUED, provider: "CRAVES_FLEET", riderId: IDLE, riderName: "Sita Devi", state: "ASSIGNED" }));
    expect(await screen.findByText("#0BDE0101 reassigned to Sita Devi.")).toBeTruthy();
  });

  it("does nothing when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", () => false);
    render(createElement(FleetTrips));
    const card = (await screen.findByText("Courier:", { exact: false })).closest("article") as HTMLElement;
    fireEvent.click(button("Cancel trip", card));
    fireEvent.change(within(card).getByLabelText(/Reason for/), { target: { value: "Customer cancelled on the phone" } });
    fireEvent.click(button("Cancel trip", card));
    expect(posts()).toHaveLength(0);
  });

  it("cancels with a reason and shows the server's refusal", async () => {
    answer = (method, path) => method === "POST" ? json({ code: "TRIP_ALREADY_FINISHED", message: "This trip was delivered a minute ago." }, 409) : json(lists[path]);
    render(createElement(FleetTrips));
    const card = (await screen.findByText("Courier:", { exact: false })).closest("article") as HTMLElement;
    fireEvent.click(button("Cancel trip", card));
    fireEvent.change(within(card).getByLabelText(/Reason for/), { target: { value: "Customer cancelled on the phone" } });
    fireEvent.click(button("Cancel trip", card));
    expect((await within(card).findByRole("alert")).textContent).toBe("This trip was delivered a minute ago.");
    await waitFor(() => expect(posts()[0]).toMatchObject({ path: `trips/${TRIP}/cancel`, body: { reason: "Customer cancelled on the phone" } }));
  });
});
