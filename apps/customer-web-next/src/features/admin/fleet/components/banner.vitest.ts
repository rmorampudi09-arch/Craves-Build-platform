// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FleetBanner } from "./fleet-banner";

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

const banner = { tone: "warning", text: "Heavy rain in Madhapur. Ride slowly.", until: "2030-01-15T16:30:00Z" };
const lists = (method: string, path: string) => method === "GET" && path === "banner"
  ? new Response(null, { status: 204 }) : json({ code: "UNMOCKED", message: path }, 500);
const json = (body: unknown, status = 200) => Response.json(body, { status });
const posts = () => calls.filter(call => call.method !== "GET");
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

describe("zone banner", () => {
  it("shows a banner with a 160-character counter, through every state", async () => {
    render(createElement(FleetBanner));
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
    render(createElement(FleetBanner));
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
    render(createElement(FleetBanner));
    expect(await within(section("Zone banner")).findByText("Your admin role can't do this.")).toBeTruthy();
  });
});
