// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FleetHealth } from "./fleet-health";

const paths: string[] = [];
let answer: () => Response;
vi.mock("@/features/admin/shell/lib/admin-renewal", () => ({
  adminFetch: async (input: RequestInfo | URL) => { paths.push(String(input)); return answer(); },
}));

const report = {
  generatedAt: "2026-10-20T06:30:00Z",
  results: [
    { name: "offer_to_ring", description: "From the server creating an offer to the phone ringing. Targets: p95 <= 5 s and p99 <= 12 s over 100+ offers.",
      columns: ["channel", "offers", "p95_s"], rows: [["fcm", 120, 3.4], ["never rang", 10, null]], truncated: false, error: null },
    { name: "shift_survival", description: "Each shift: the longest gap between two calls.", columns: ["started_at", "open"],
      rows: Array.from({ length: 200 }, () => ["2026-10-20T04:30:00Z", true]), truncated: true, error: null },
    { name: "track_size", description: "trip_track on disk.", columns: [], rows: [], truncated: false, error: "This check failed: canceling statement due to statement timeout" },
    { name: "offer_outcomes", description: "", columns: ["day_ist", "state"], rows: [], truncated: false, error: null },
  ],
};
const section = (name: string) => screen.getByRole("heading", { name }).closest("section") as HTMLElement;

beforeEach(() => { paths.length = 0; answer = () => Response.json(report); });
afterEach(cleanup);

describe("pilot health", () => {
  it("shows every check with what to look for, times in IST and a failed check on its own", async () => {
    render(createElement(FleetHealth));
    await screen.findByRole("heading", { name: "Offer to ring" });
    const ring = section("Offer to ring");
    expect(within(ring).getByText(/Targets: p95 <= 5 s/)).toBeTruthy();
    expect(within(ring).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["channel", "offers", "p95_s"]);
    expect(within(ring).getByText("3.4")).toBeTruthy();
    expect(within(ring).getByText("—")).toBeTruthy();
    const survival = section("Shift survival");
    expect(within(survival).getAllByText(/^20 Oct 2026.*IST$/)).toHaveLength(200);
    expect(within(survival).getAllByText("Yes")).toHaveLength(200);
    expect(within(survival).getByText("Showing the first 200 rows. Run the query with psql for the rest.")).toBeTruthy();
    expect(within(section("Track size")).getByRole("alert").textContent).toBe("This check failed: canceling statement due to statement timeout");
    expect(within(section("Offer outcomes")).getByText("No rows yet.")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(paths).toEqual(["/api/admin/fleet/pilot-health"]);
  });

  it("runs again on request and keeps the last report when that fails", async () => {
    render(createElement(FleetHealth));
    await screen.findByRole("heading", { name: "Offer to ring" });
    answer = () => Response.json({ code: "FLEET_UNAVAILABLE", message: "The fleet service is unavailable. Try again shortly." }, { status: 503 });
    fireEvent.click(screen.getByRole("button", { name: "Run again" }));
    expect((await screen.findByText("The fleet service is unavailable. Try again shortly.")).getAttribute("role")).toBe("alert");
    expect(screen.getByRole("heading", { name: "Offer to ring" })).toBeTruthy();
    expect(paths).toHaveLength(2);
  });

  it("tells a role without trip access it can't open the page", async () => {
    answer = () => Response.json({ code: "FORBIDDEN", message: "Needs OPERATIONS_ADMIN" }, { status: 403 });
    render(createElement(FleetHealth));
    expect((await screen.findByText("Your admin role can't do this.")).getAttribute("role")).toBe("status");
    expect(screen.queryByRole("button", { name: "Run again" })).toBeNull();
  });
});
