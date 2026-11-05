// @vitest-environment jsdom
// The staff pages with stubbed /api/admin answers; no backend is contacted.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeletionRequestDetail } from "./deletion-request-detail";
import { DeletionRequestList } from "./deletion-request-list";

type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];
let answer: (call: Call) => Response | Promise<Response>;
vi.mock("@/features/admin/shell/lib/admin-renewal", () => ({
  adminFetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return answer(call);
  },
}));

const ID = "0f8e7d6c-1111-4222-8333-444455556666";
const OTHER = "9a8b7c6d-2222-4333-8444-555566667777";
const BASE = "/api/admin/account-deletions";
const summary = (over: Record<string, unknown> = {}) => ({
  requestId: ID, identityId: "71111111-1111-4111-8111-111111111111", scope: "CHEF", status: "PENDING_REVIEW", via: "APP",
  requestedAt: "2026-11-04T08:30:00Z", dueAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null, ...over,
});
const detail = (over: Record<string, unknown> = {}) => ({
  request: summary(), phoneLast4: "4321", roles: ["CUSTOMER", "CHEF"], canDecide: true,
  steps: [{ phase: "ERASE", service: "catalog", status: "PENDING", attempts: 2, lastError: "timeout talking to catalog", completedAt: null }],
  blockers: [{ service: "order", code: "ACTIVE_ORDERS", detail: "2 orders in progress" }, { service: "catalog", code: "SERVICE_UNREACHABLE", detail: null }],
  ...over,
});
const failure = (status: number, code: string, extra: Record<string, unknown> = {}) => Response.json({ code, ...extra }, { status });
const decisions = () => calls.filter((call) => call.method === "POST");
const gets = (url: string) => calls.filter((call) => call.method === "GET" && call.url === url);
const REASON = "Checked the open items with the chef.";

beforeEach(() => {
  calls.length = 0;
  answer = () => Response.json({ items: [], nextCursor: null });
  // jsdom has no modal <dialog>; opening one is all the page asks of it.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(cleanup);

describe("Deletion requests list", () => {
  it("shows requests in review first, one row each, and loads more with the cursor", async () => {
    answer = ({ url }) => url.includes("cursor=")
      ? Response.json({ items: [summary({ requestId: OTHER, scope: "ALL", via: "WEB", status: "PENDING_REVIEW" })], nextCursor: null })
      : Response.json({ items: [summary({ dueAt: "2026-12-04T08:30:00Z", status: "SCHEDULED" })], nextCursor: "c2" });
    render(createElement(DeletionRequestList));
    expect(await screen.findByText("0F8E7D6C")).toBeTruthy();
    expect(calls[0].url).toBe(`${BASE}?status=PENDING_REVIEW`);
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Requested", "Scope", "Status", "Via", "Due", "Request"]);
    const row = screen.getByText("0F8E7D6C").closest("tr") as HTMLElement;
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["4 Nov 2026, 2:00 pm IST", "Chef", "Scheduled", "App", "4 Dec 2026", "0F8E7D6C"]);
    expect(within(row).getByRole("link", { name: "0F8E7D6C" }).getAttribute("href")).toBe(`/admin/account-deletions/${ID}`);

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("9A8B7C6D")).toBeTruthy();
    expect(calls[1].url).toBe(`${BASE}?status=PENDING_REVIEW&cursor=c2`);
    // Both pages stay, in the server's order, and the button goes with the cursor.
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    const second = screen.getByText("9A8B7C6D").closest("tr") as HTMLElement;
    expect(within(second).getAllByRole("cell").slice(1, 5).map((cell) => cell.textContent)).toEqual(["Whole account", "In review", "Web", "—"]);
  });

  it("offers the eight filters in order and asks the server for the one picked", async () => {
    render(createElement(DeletionRequestList));
    await screen.findByText("No requests are in review.");
    const filters = screen.getAllByRole("button").map((button) => button.textContent);
    expect(filters.slice(0, 8)).toEqual(["All", "In review", "Scheduled", "Waiting", "Erasing", "Completed", "Rejected", "Cancelled"]);
    expect(screen.getByRole("button", { name: "In review" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Waiting" }));
    expect(await screen.findByText("No requests are waiting.")).toBeTruthy();
    expect(calls[1].url).toBe(`${BASE}?status=WAITING_ON_OPEN_ITEMS`);
    expect(screen.getByRole("button", { name: "Waiting" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByText("No deletion requests yet.")).toBeTruthy();
    expect(calls[2].url).toBe(BASE);
  });

  it("drops a slow answer for a filter the person has already left", async () => {
    let release: (response: Response) => void = () => undefined;
    answer = ({ url }) => url.endsWith("status=PENDING_REVIEW")
      ? new Promise<Response>((resolve) => { release = resolve; })
      : Response.json({ items: [summary({ requestId: OTHER, status: "ERASING" })], nextCursor: null });
    render(createElement(DeletionRequestList));
    fireEvent.click(screen.getByRole("button", { name: "Erasing" }));
    expect(await screen.findByText("9A8B7C6D")).toBeTruthy();
    release(Response.json({ items: [summary()], nextCursor: null }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("0F8E7D6C")).toBeNull();
    expect(screen.getByText("9A8B7C6D")).toBeTruthy();
  });

  it.each([
    [503, "ACCOUNT_DELETION_NOT_ENABLED", "Account deletion is not switched on yet."],
    [403, "ADMIN_ROLE_REQUIRED", "Your administrator role can't view deletion requests."],
    [403, "ADMIN_ACCESS_REQUIRED", "Your administrator role can't view deletion requests."],
    [401, "ADMIN_SESSION_EXPIRED", "Your administrator session ended. Sign in again."],
    [400, "INVALID_DELETION_QUERY", "That filter isn't valid. Refresh and try again."],
    [502, "INVALID_DELETION_RESPONSE", "Craves sent back something unexpected. Refresh and try again."],
    [503, "ACCOUNT_DELETION_UNAVAILABLE", "Account deletion couldn't be reached. Refresh and try again."],
    [500, "SOMETHING_NEW", "Something went wrong. Refresh and try again."],
  ])("says what a %i %s means instead of an empty list", async (status, code, message) => {
    answer = () => failure(status, code);
    render(createElement(DeletionRequestList));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.queryByText(/^No requests/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the loaded rows when Load more fails", async () => {
    answer = ({ url }) => url.includes("cursor=") ? failure(503, "ACCOUNT_DELETION_UNAVAILABLE") : Response.json({ items: [summary()], nextCursor: "c2" });
    render(createElement(DeletionRequestList));
    await screen.findByText("0F8E7D6C");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Account deletion couldn't be reached. Refresh and try again.");
    expect(screen.getByText("0F8E7D6C")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
  });
});

describe("Deletion request detail", () => {
  const open = () => render(createElement(DeletionRequestDetail, { requestId: ID }));
  const url = `${BASE}/${ID}`;

  it("shows a loading state while the slow detail request is pending", async () => {
    let release: (response: Response) => void = () => undefined;
    answer = () => new Promise<Response>((resolve) => { release = resolve; });
    open();
    expect(screen.getByRole("status").textContent).toMatch(/Loading this request.*up to 30 seconds/);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    release(Response.json(detail()));
    expect(await screen.findByRole("heading", { name: "Open items" })).toBeTruthy();
    expect(screen.queryByText(/Loading this request/)).toBeNull();
    expect(calls[0].url).toBe(url);
  });

  it("shows the summary, the open items (marking a service it couldn't ask) and the steps", async () => {
    answer = () => Response.json(detail({ request: summary({ dueAt: "2026-12-04T08:30:00Z", status: "WAITING_ON_OPEN_ITEMS", via: "WEB" }) }));
    open();
    await screen.findByRole("heading", { name: "Open items" });
    const facts = within(screen.getByRole("heading", { name: "Summary" }).closest("section") as HTMLElement);
    for (const text of ["Chef", "Waiting", "Web", "4 Nov 2026, 2:00 pm IST", "4 Dec 2026", "Ends in 4321", "CUSTOMER, CHEF", "71111111-1111-4111-8111-111111111111"]) {
      expect(facts.getByText(text)).toBeTruthy();
    }

    const items = within(screen.getByRole("heading", { name: "Open items" }).closest("section") as HTMLElement);
    expect(items.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Service", "Code", "Detail"]);
    const active = items.getByText("ACTIVE_ORDERS").closest("tr") as HTMLElement;
    expect(within(active).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["order", "ACTIVE_ORDERS", "2 orders in progress"]);
    expect(within(active).queryByText("Couldn't check")).toBeNull();
    const unreachable = items.getByText("Couldn't check").closest("tr") as HTMLElement;
    expect(within(unreachable).getByText("catalog")).toBeTruthy();

    const steps = within(screen.getByRole("heading", { name: "Steps" }).closest("section") as HTMLElement);
    expect(steps.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Phase", "Service", "Status", "Attempts", "Last error", "Done"]);
    expect(within(steps.getByText("timeout talking to catalog").closest("tr") as HTMLElement).getAllByRole("cell").map((cell) => cell.textContent))
      .toEqual(["ERASE", "catalog", "PENDING", "2", "timeout talking to catalog", "—"]);
  });

  it("says Erased in place of the phone digits, and shows who reviewed it and why", async () => {
    answer = () => Response.json(detail({
      phoneLast4: null, blockers: [], steps: [],
      request: summary({ status: "REJECTED", reviewedBy: "81111111-1111-4111-8111-111111111111", reviewedAt: "2026-11-05T05:00:00Z", reviewNote: "Orders still open." }),
    }));
    open();
    await screen.findByRole("heading", { name: "Open items" });
    expect(screen.getByText("Erased")).toBeTruthy();
    expect(screen.getByText("81111111-1111-4111-8111-111111111111")).toBeTruthy();
    expect(screen.getByText("Orders still open.")).toBeTruthy();
    expect(screen.getByText("Nothing is open.")).toBeTruthy();
    expect(screen.getByText("No erasure steps have started.")).toBeTruthy();
  });

  it("offers Approve and Reject only while the request is in review and the route says canDecide", async () => {
    answer = () => Response.json(detail());
    const first = open();
    expect(await screen.findByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    first.unmount();

    answer = () => Response.json(detail({ canDecide: false }));
    const second = open();
    await screen.findByRole("heading", { name: "Open items" });
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.getByText("Approve and Reject aren't available. Refresh to try again.")).toBeTruthy();
    second.unmount();

    for (const status of ["SCHEDULED", "WAITING_ON_OPEN_ITEMS", "ERASING", "COMPLETED", "REJECTED", "CANCELLED"]) {
      answer = () => Response.json(detail({ request: summary({ status }), canDecide: true }));
      const view = open();
      await screen.findByRole("heading", { name: "Open items" });
      expect(screen.queryByRole("button", { name: "Approve" }), status).toBeNull();
      expect(screen.queryByRole("button", { name: "Reject" }), status).toBeNull();
      expect(screen.queryByText("Approve and Reject aren't available. Refresh to try again."), status).toBeNull();
      view.unmount();
    }
  });

  it("rejects with the reason, says the person will see it, and reloads the request", async () => {
    answer = ({ method }) => method === "POST" ? Response.json(summary({ status: "REJECTED" })) : Response.json(detail());
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog", { name: "Reject deletion request" });
    expect(within(dialog).getByText("The person will see this reason.")).toBeTruthy();
    expect(within(dialog).getByText("0 / 500")).toBeTruthy();
    const confirm = within(dialog).getByRole("button", { name: "Reject request" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    const box = within(dialog).getByLabelText(/Reason/) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "too short" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(box, { target: { value: `  ${REASON}  ` } });
    expect(within(dialog).getByText(`${REASON.length + 4} / 500`)).toBeTruthy();
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(decisions()).toEqual([{ url: `${url}/reject`, method: "POST", body: { reason: REASON } }]);
    await waitFor(() => expect(gets(url)).toHaveLength(2));
    expect(await screen.findByText("Rejected. The person can see your reason.")).toBeTruthy();
  });

  it("approves with the reason and reloads the request", async () => {
    answer = ({ method }) => method === "POST" ? Response.json(summary({ status: "SCHEDULED" })) : Response.json(detail());
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve deletion request" });
    expect(within(dialog).queryByText("The person will see this reason.")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve request" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(decisions()).toEqual([{ url: `${url}/approve`, method: "POST", body: { reason: REASON } }]);
    await waitFor(() => expect(gets(url)).toHaveLength(2));
    expect(await screen.findByText("Approved.")).toBeTruthy();
  });

  it("lists the open items an approval was refused for, inside the dialog, and keeps the reason", async () => {
    answer = ({ method }) => method === "POST"
      ? failure(409, "ACCOUNT_DELETION_HAS_OPEN_ITEMS", { blockers: [{ service: "order", code: "ACTIVE_ORDERS", detail: "2 orders in progress" }, { service: "payments", code: "SERVICE_UNREACHABLE", detail: null }] })
      : Response.json(detail({ blockers: [] }));
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve request" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Approval is blocked while these items are open.");
    const items = within(alert).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["order: ACTIVE_ORDERS. 2 orders in progress", "payments: Couldn't check"]);
    expect((within(dialog).getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe(REASON);
    expect((within(dialog).getByRole("button", { name: "Approve request" }) as HTMLButtonElement).disabled).toBe(false);
    expect(gets(url)).toHaveLength(1);
  });

  it.each([
    ["approve", 403, "ADMIN_ROLE_REQUIRED", "Your administrator role can't make this decision."],
    ["approve", 403, "ADMIN_ACCESS_REQUIRED", "Your administrator role can't make this decision."],
    ["reject", 403, "ACCOUNT_DELETION_OWN_REQUEST", "You can't review your own request."],
    ["reject", 401, "ADMIN_SESSION_EXPIRED", "Your administrator session ended. Sign in again."],
    ["approve", 404, "NO_DELETION_REQUEST", "This deletion request was not found."],
    ["approve", 503, "ACCOUNT_DELETION_NOT_ENABLED", "Account deletion is not switched on yet."],
    ["reject", 400, "ADMIN_REASON_INVALID", "The reason must be 10 to 500 characters."],
    ["approve", 403, "ORIGIN_REJECTED", "This page isn't allowed to send that. Reload the page and try again."],
    ["approve", 415, "JSON_REQUIRED", "Craves couldn't read the decision. Reload the page and try again."],
    ["approve", 400, "INVALID_REQUEST_BODY", "Craves couldn't read the decision. Reload the page and try again."],
    ["approve", 413, "REQUEST_BODY_TOO_LARGE", "The reason is too long. Keep it to 500 characters."],
    ["approve", 408, "REQUEST_BODY_TIMEOUT", "The decision took too long to send. Try again."],
    ["approve", 429, "REQUEST_READER_BUSY", "Craves is busy. Try again in a moment."],
    ["reject", 500, "SOMETHING_NEW", "Something went wrong. Refresh and try again."],
  ])("on %s, a %i %s says %j and leaves the dialog open to retry", async (action, status, code, message) => {
    answer = ({ method }) => method === "POST" ? failure(status, code) : Response.json(detail());
    open();
    fireEvent.click(await screen.findByRole("button", { name: action === "approve" ? "Approve" : "Reject" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: action === "approve" ? "Approve request" : "Reject request" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(message);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).queryByRole("button", { name: "Refresh" })).toBeNull();
    expect((within(dialog).getByRole("button", { name: action === "approve" ? "Approve request" : "Reject request" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("tells a changed request to be refreshed, and Refresh closes the dialog and asks again", async () => {
    answer = ({ method }) => method === "POST" ? failure(409, "ACCOUNT_DELETION_NOT_REVIEWABLE") : Response.json(detail());
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve request" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("This request changed. Refresh before deciding.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(gets(url)).toHaveLength(2));
  });

  it.each([
    ["a 503", () => failure(503, "ACCOUNT_DELETION_UNAVAILABLE")],
    ["an answer Craves could not read", () => failure(502, "INVALID_DELETION_RESPONSE")],
    ["a dropped connection", () => { throw new TypeError("Failed to fetch"); }],
  ])("after %s on a decision, says it may have gone through and offers Refresh, not a second try", async (_name, reply) => {
    answer = ({ method }) => method === "POST" ? reply() : Response.json(detail());
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject request" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Craves couldn't confirm the decision. Refresh the request to see whether it went through.");
    expect(within(dialog).queryByRole("button", { name: "Reject request" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(gets(url)).toHaveLength(2));
    expect(decisions()).toHaveLength(1);
  });

  it("closes with Cancel without sending anything", async () => {
    answer = () => Response.json(detail());
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(decisions()).toHaveLength(0);
    expect(gets(url)).toHaveLength(1);
  });

  it.each([
    ["a 503, closed with Cancel", () => failure(503, "ACCOUNT_DELETION_UNAVAILABLE"), false],
    ["a dropped connection, closed with Escape", () => { throw new TypeError("Failed to fetch"); }, true],
    ["a changed request, closed with Cancel", () => failure(409, "ACCOUNT_DELETION_NOT_REVIEWABLE"), false],
  ])("after %s, reloads the request, so Approve and Reject from before the decision are gone", async (_name, reply, escape) => {
    answer = ({ method }) => method === "POST" ? reply() : Response.json(detail());
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve request" }));
    await within(dialog).findByRole("alert");
    if (escape) fireEvent(dialog, new Event("cancel", { cancelable: true }));
    else fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(gets(url)).toHaveLength(2));
    expect(decisions()).toHaveLength(1);
  });

  it("lists two open items with the same service and code, each once, without a key clash", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    answer = ({ method }) => method === "POST"
      ? failure(409, "ACCOUNT_DELETION_HAS_OPEN_ITEMS", { blockers: [{ service: "order", code: "ACTIVE_ORDERS", detail: "Order A" }, { service: "order", code: "ACTIVE_ORDERS", detail: "Order B" }] })
      : Response.json(detail({ blockers: [] }));
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve request" }));
    const alert = await within(dialog).findByRole("alert");
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["order: ACTIVE_ORDERS. Order A", "order: ACTIVE_ORDERS. Order B"]);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    errors.mockRestore();
  });

  it.each([
    [404, "NO_DELETION_REQUEST", "This deletion request was not found."],
    [503, "ACCOUNT_DELETION_NOT_ENABLED", "Account deletion is not switched on yet."],
    [403, "ADMIN_ROLE_REQUIRED", "Your administrator role can't view deletion requests."],
    [503, "ACCOUNT_DELETION_UNAVAILABLE", "Account deletion couldn't be reached. Refresh and try again."],
    [502, "INVALID_DELETION_RESPONSE", "Craves sent back something unexpected. Refresh and try again."],
    [500, "SOMETHING_NEW", "Something went wrong. Refresh and try again."],
  ])("says what a %i %s means when the request can't load, and Refresh tries again", async (status, code, message) => {
    answer = () => failure(status, code);
    open();
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.queryByRole("heading", { name: "Open items" })).toBeNull();
    answer = () => Response.json(detail());
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("heading", { name: "Open items" })).toBeTruthy();
    expect(gets(url)).toHaveLength(2);
  });

  it("Refresh on a loaded request asks again and shows the loading state meanwhile", async () => {
    answer = () => Response.json(detail());
    open();
    await screen.findByRole("heading", { name: "Open items" });
    let release: (response: Response) => void = () => undefined;
    answer = () => new Promise<Response>((resolve) => { release = resolve; });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByRole("status").textContent).toMatch(/Loading this request/);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    release(Response.json(detail({ request: summary({ status: "SCHEDULED" }) })));
    expect(await screen.findByRole("heading", { name: "Open items" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});
