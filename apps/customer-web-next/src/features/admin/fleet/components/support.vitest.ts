// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FleetSupport } from "./fleet-support";

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
const ISSUE = "55555555-5555-4555-8555-555555555555";
const TRIP = "77777777-7777-4777-8777-777777777777";
const SOS = "66666666-6666-4666-8666-666666666666";
const later = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
type Issue = {
  issueId: string; riderId: string; riderName: string; tripId: string | null; category: string; text: string; state: string; createdAt: string;
  acknowledgeBy: string; fixBy: string; acknowledgedAt: string | null; acknowledgedBy: string | null; fixedAt: string | null; fixedBy: string | null;
  resolution: string | null;
};
const issue: Issue = {
  issueId: ISSUE, riderId: RIDER, riderName: "Ravi Kumar", tripId: TRIP, category: "WRONG_DISTANCE", text: "The drop was 5 km, not 4.2",
  state: "OPEN", createdAt: later(-1), acknowledgeBy: later(23), fixBy: later(71), acknowledgedAt: null, acknowledgedBy: null, fixedAt: null,
  fixedBy: null, resolution: null,
};
const sos = { sosId: SOS, riderId: RIDER, riderName: "Ravi Kumar", phoneMasked: "+91 98xxxxx210", at: later(-2), lat: 17.4483, lng: 78.3915, tripId: TRIP, alertedAt: null };
const json = (body: unknown, status = 200) => Response.json(body, { status });
const posts = () => calls.filter(call => call.method !== "GET");
const button = (name: string | RegExp, scope: HTMLElement = document.body) => within(scope).getByRole("button", { name }) as HTMLButtonElement;
let current: Issue = issue;
function lists(path: string) {
  if (path === "sos-events") return json({ events: [sos] });
  if (path === `support-issues?state=${current.state}`) return json({ issues: [current] });
  if (path.startsWith("support-issues?state=")) return json({ issues: [] });
  return json({ code: "UNMOCKED", message: path }, 500);
}
const issues = async () => (await screen.findByRole("heading", { name: "Issues riders raised" })).closest("section") as HTMLElement;

beforeEach(() => {
  calls.length = 0;
  current = issue;
  answer = (method, path) => method === "GET" ? lists(path) : json({ code: "UNMOCKED", message: path }, 500);
});
afterEach(cleanup);

describe("rider support", () => {
  it("lists SOS presses with a map link and flags one whose alert email did not go", async () => {
    render(createElement(FleetSupport));
    const section = (await screen.findByRole("heading", { name: "SOS, last 7 days" })).closest("section") as HTMLElement;
    const row = (await within(section).findByText("+91 98xxxxx210")).closest("tr") as HTMLElement;
    expect(within(row).getByRole("link", { name: "Open map" }).getAttribute("href")).toBe("https://maps.google.com/?q=17.448300,78.391500");
    expect(within(row).getByText("Email not sent")).toBeTruthy();
    expect(within(row).getByText(TRIP)).toBeTruthy();
  });

  it("acknowledges an open issue, then fixes it with what was done", async () => {
    answer = (method, path) => {
      if (method === "POST" && path.endsWith("/acknowledge")) {
        current = { ...issue, state: "ACKNOWLEDGED", acknowledgedAt: later(0), acknowledgedBy: "Asha" };
        return json(current);
      }
      if (method === "POST" && path.endsWith("/fix")) {
        current = { ...current, state: "FIXED", fixedAt: later(0), fixedBy: "Asha", resolution: "Checked the route: it was 5 km. Paid ₹12 more." };
        return json(current);
      }
      return lists(path);
    };
    render(createElement(FleetSupport));
    const section = await issues();
    expect(await within(section).findByText("The drop was 5 km, not 4.2")).toBeTruthy();
    expect(within(section).getByText("Wrong distance")).toBeTruthy();
    expect(within(section).getByText(TRIP)).toBeTruthy();

    fireEvent.click(button("Acknowledge", section));
    expect(await within(section).findByText("Acknowledged Ravi Kumar's issue. Call them, then mark it fixed with what was done.")).toBeTruthy();
    fireEvent.click(button("Acknowledged", section));
    expect(await within(section).findByText(/Acknowledged by Asha/)).toBeTruthy();

    fireEvent.click(button("Mark fixed", section));
    fireEvent.change(within(section).getByLabelText(/What was done/), { target: { value: "ok" } });
    fireEvent.click(button("Mark fixed", section));
    expect(within(section).getByRole("alert").textContent).toBe("Write a reason of at least 3 characters.");
    fireEvent.change(within(section).getByLabelText(/What was done/), { target: { value: "Checked the route: it was 5 km. Paid ₹12 more." } });
    fireEvent.click(button("Mark fixed", section));
    expect(await within(section).findByText("Marked Ravi Kumar's issue fixed. Any pay this issue held is released.")).toBeTruthy();
    expect(posts().map(call => [call.path, call.body])).toEqual([
      [`support-issues/${ISSUE}/acknowledge`, undefined],
      [`support-issues/${ISSUE}/fix`, { resolution: "Checked the route: it was 5 km. Paid ₹12 more." }],
    ]);
    expect(posts()[0].key).not.toBe(posts()[1].key);
  });

  it("marks an issue past its acknowledge-by time", async () => {
    current = { ...issue, createdAt: later(-25), acknowledgeBy: later(-1) };
    render(createElement(FleetSupport));
    expect(await within(await issues()).findByText("Past acknowledge-by")).toBeTruthy();
  });

  it("shows the server's refusal", async () => {
    answer = (method, path) => method === "POST" ? json({ code: "ISSUE_NOT_OPEN", message: "This issue was acknowledged already." }, 409) : lists(path);
    render(createElement(FleetSupport));
    const section = await issues();
    fireEvent.click(await within(section).findByRole("button", { name: "Acknowledge" }));
    expect((await within(section).findByRole("alert")).textContent).toBe("This issue was acknowledged already.");
  });
});
