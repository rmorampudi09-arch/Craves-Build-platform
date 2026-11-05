// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deadLetterRetryError } from "./dead-letter-contract";
import { DeadLettersConsole } from "./dead-letters-console";

type Call = { method: string; url: string; reason: string | null };
const calls: Call[] = [];
let answer: (method: string, query: URLSearchParams) => Response | Promise<Response>;
vi.mock("@/features/admin/shell/lib/admin-renewal", () => ({
  adminFetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url: String(input), reason: new Headers(init.headers).get("X-Admin-Reason") });
    return answer(method, new URL(String(input), "https://admin.craves.in").searchParams);
  },
}));

const ID = "6212c931-b8ac-4cc7-8cf6-3a9672046b11";
const OTHER = "7212c931-b8ac-4cc7-8cf6-3a9672046b11";
const REASON = "INC-42 Borzo webhooks stuck since 9 pm";
const item = (id: string, source: string, status: string) => ({
  id, source, provider: source === "CASHFREE_WEBHOOK" ? null : "borzo", kind: "DELIVERED", status, attemptCount: 8,
  firstSeenAt: "2026-11-03T15:00:00Z", lastChangedAt: "2026-11-03T16:10:00Z", nextAttemptAt: status === "FAILED" ? "2026-11-05T16:20:00Z" : null,
  providerEventId: "evt-981", deliveryJobId: null, orderId: null, chefSubOrderId: null, lastError: "Delivery job not found", payloadBytes: 1834,
});
const json = (body: unknown, status = 200, reference = "") => Response.json(body, { status, headers: reference ? { "X-Correlation-ID": reference } : {} });
const list = (query: URLSearchParams) => {
  const source = query.get("source") ?? "", status = query.get("status") ?? "";
  return json({ source, status, total: 2, limit: 25, offset: 0, items: [item(ID, source, status), item(OTHER, source, status)] }, 200, "list-ref");
};
const posts = () => calls.filter(call => call.method === "POST");
const row = (id: string) => screen.getByText(id).closest("article") as HTMLElement;
const retryButton = (id: string) => within(row(id)).queryByRole("button", { name: "Retry once" }) as HTMLButtonElement | null;

async function show(source: string, status: string, heading: string) {
  fireEvent.change(screen.getByLabelText("Source"), { target: { value: source } });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: status } });
  fireEvent.change(screen.getByLabelText(/^Why you are looking/), { target: { value: REASON } });
  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  await screen.findByRole("heading", { name: heading });
}
const showGivenUp = () => show("DELIVERY_WEBHOOK", "DEAD_LETTER", "Delivery webhooks · gave up");

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("confirm", vi.fn(() => true));
  answer = (method, query) => method === "GET" ? list(query) : json({ code: "UNMOCKED" }, 500);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("dead-letter retry", () => {
  it("offers Retry once only on given-up delivery webhooks, each described by its record", async () => {
    render(createElement(DeadLettersConsole));
    await showGivenUp();
    expect(within(row(ID)).getByRole("button", { name: "Retry once", description: `Record ${ID}` })).toBeTruthy();
    expect(within(row(OTHER)).getByRole("button", { name: "Retry once", description: `Record ${OTHER}` })).toBeTruthy();
    await show("CASHFREE_WEBHOOK", "DEAD_LETTER", "Cashfree webhooks · gave up");
    expect(screen.queryByRole("button", { name: "Retry once" })).toBeNull();
    await show("DELIVERY_WEBHOOK", "FAILED", "Delivery webhooks · failed, still retrying");
    expect(screen.queryByRole("button", { name: "Retry once" })).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it("sends the reason the confirmation shows, and says in that row that retrying is switched off", async () => {
    answer = (method, query) => method === "GET" ? list(query) : json(deadLetterRetryError(404), 404, "retry-ref");
    render(createElement(DeadLettersConsole));
    await showGivenUp();
    fireEvent.change(screen.getByLabelText(/^Why you are looking/), { target: { value: "Edited after the list was shown" } });
    fireEvent.click(retryButton(ID) as HTMLButtonElement);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(`your reason "${REASON}"`));
    const alert = await within(row(ID)).findByRole("alert");
    expect(alert.textContent).toBe(`${deadLetterRetryError(404).message} Reference retry-ref.`);
    expect(alert.textContent).toMatch(/switched off/);
    expect(posts()).toEqual([{ method: "POST", url: `/api/admin/dead-letters?id=${ID}&source=DELIVERY_WEBHOOK`, reason: REASON }]);
    expect(screen.getAllByRole("alert")).toHaveLength(1); // nothing in the "What to show" panel
    expect(screen.getByText(/Audit reference/).textContent).toContain("Audit reference list-ref.");
    expect(retryButton(ID)?.disabled).toBe(false);
  });

  it("asks for another go after the session was renewed, and names a refused origin", async () => {
    answer = (method, query) => method === "GET" ? list(query) : json({ code: "SESSION_RENEWED_RETRY_REQUIRED" }, 409);
    render(createElement(DeadLettersConsole));
    await showGivenUp();
    fireEvent.click(retryButton(ID) as HTMLButtonElement);
    expect((await within(row(ID)).findByRole("alert")).textContent).toBe("Your session was renewed. Try again.");
    answer = (method, query) => method === "GET" ? list(query) : json({ code: "ORIGIN_REJECTED" }, 403);
    fireEvent.click(retryButton(ID) as HTMLButtonElement);
    expect((await within(row(ID)).findByText(/isn't allowed/)).textContent).toBe("This page isn't allowed to send that. Reload the page and try again.");
  });

  it("works in the row: saving there, then the new row without its button, with focus on what happened", async () => {
    let finish!: (response: Response) => void;
    answer = (method, query) => method === "GET" ? list(query) : new Promise(resolve => { finish = resolve; });
    render(createElement(DeadLettersConsole));
    await showGivenUp();
    fireEvent.click(retryButton(ID) as HTMLButtonElement);
    expect(await within(row(ID)).findByText("Saving…")).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(retryButton(OTHER)?.disabled).toBe(true);
    finish(json({ ...item(ID, "DELIVERY_WEBHOOK", "FAILED"), attemptCount: 7 }, 200, "retry-ref"));
    const done = await within(row(ID)).findByText("Queued for one more attempt, reference retry-ref. Show the list again in a minute to see how it went.");
    expect(retryButton(ID)).toBeNull();
    expect(within(row(ID)).getByText("Failed")).toBeTruthy();
    expect(row(ID).textContent).toContain("7 attempts");
    expect(row(ID).textContent).toContain("next try");
    expect(row(ID).contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent).toBe(done.textContent);
    expect(retryButton(OTHER)?.disabled).toBe(false);
    expect(screen.getByText(/Audit reference/).textContent).toContain("Audit reference list-ref.");
  });
});
