// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RiderDetailView } from "./rider-detail";
import { RidersList } from "./riders-list";
import { SelfieQueue } from "./selfie-queue";

type Call = { method: string; path: string; key: string | null; body: unknown };
const calls: Call[] = [];
let answer: (method: string, path: string, body: unknown) => Response | Promise<Response>;
vi.mock("@/features/admin/shell/lib/admin-renewal", () => ({
  adminFetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = String(input).replace("/api/admin/fleet/", "");
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, key: new Headers(init.headers).get("Idempotency-Key"), body });
    return answer(method, path, body);
  },
}));

const RIDER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const SHIFT = "44444444-4444-4444-8444-444444444444";
const at = "2026-10-20T06:30:00Z";
const summary = { riderId: RIDER, name: "Ravi Kumar", phoneMasked: "+91 98xxxxx210", status: "PENDING", pendingDocuments: 1, pendingDevice: true, createdAt: at };
const document = { documentId: DOC, type: "DRIVING_LICENCE", status: "PENDING", expiresOn: "2030-01-31", reason: null, reviewedBy: null, reviewedAt: null, uploadedAt: at };
const device = { deviceId: DEVICE, model: "Redmi 13C", appVersion: "1.0.0", state: "PENDING_APPROVAL", firstSeenAt: at, approvedBy: null, approvedAt: null };
const detail = { rider: { ...summary, kycName: "RAVI KUMAR", language: "te", vehicleNumberMasked: null }, documents: [document], devices: [device], payoutAccount: null, shifts: [], statusEvents: [] };
const event = { eventId: "55555555-5555-4555-8555-555555555555", kind: "NOTICE", reason: "x", evidenceSummary: "y", deadline: at, reviewBy: null, appealPhone: "+914012345678", approverName: "Asha", createdAt: at, statusAfter: "ACTIVE" };
const UUID = /^[0-9a-f-]{36}$/;
const json = (body: unknown, status = 200) => Response.json(body, { status });
const posts = () => calls.filter(call => call.method !== "GET");
const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const field = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string | RegExp, value: string) => fireEvent.change(field(label), { target: { value } });
/** The IST wall time the form expects, whatever zone the test machine uses. */
function localInput(hoursAhead: number) {
  return new Date(Date.now() + hoursAhead * 3_600_000 + 330 * 60_000).toISOString().slice(0, 16);
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("confirm", () => true);
  answer = (method, path) => {
    if (path.startsWith("riders?")) return json({ riders: [summary], nextCursor: null });
    if (path === `riders/${RIDER}`) return json(detail);
    if (path.startsWith("audit?")) return json({ entries: [{ entryId: "66666666-6666-4666-8666-666666666666", at, actorName: "Asha", action: "RIDER_CREATED", riderId: RIDER, targetId: null, summary: "Added at the office" }], nextCursor: null });
    if (path.startsWith("selfie-reviews")) return json({ items: [{ shiftId: SHIFT, riderId: RIDER, riderName: "Ravi Kumar", startedAt: at, state: "PENDING", reason: null, reviewedBy: null, reviewedAt: null }] });
    return json({ code: "UNMOCKED", message: `${method} ${path}` }, 500);
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("riders list", () => {
  it("lists riders and adds one through every state", async () => {
    render(createElement(RidersList));
    expect((await screen.findByRole("link", { name: "Ravi Kumar" })).getAttribute("href")).toBe(`/admin/riders/${RIDER}`);
    expect(screen.getByText("1 document, new phone")).toBeTruthy();

    type("Name as on their documents", "Ravi Kumar");
    type("Phone", "+91 12345");
    fireEvent.click(button("Add rider"));
    expect(screen.getByRole("alert").textContent).toBe("Enter the phone as +91 and 10 digits.");
    expect(posts()).toHaveLength(0);

    let finish!: (response: Response) => void;
    answer = (method) => method === "POST" ? new Promise(resolve => { finish = resolve; }) : json({ riders: [summary], nextCursor: null });
    type("Phone", "+919876543210");
    fireEvent.click(button("Add rider"));
    expect(await screen.findByText("Saving…")).toBeTruthy();
    expect(button("Add rider").disabled).toBe(true);
    expect(posts()[0]).toMatchObject({ path: "riders", body: { name: "Ravi Kumar", phone: "+919876543210", language: "te" } });
    expect(posts()[0].key).toMatch(UUID);
    finish(json(summary, 201));
    expect(await screen.findByText("Rider added. They can now sign in and upload documents.")).toBeTruthy();

    answer = () => json({ code: "PHONE_IN_USE", message: "This phone already belongs to a rider." }, 409);
    type("Name as on their documents", "Ravi Kumar");
    type("Phone", "+919876543210");
    fireEvent.click(button("Add rider"));
    expect((await screen.findByRole("alert")).textContent).toBe("This phone already belongs to a rider.");
  });

  it("links the joins and exits CSV for the chosen day", async () => {
    render(createElement(RidersList));
    type("Day", "2026-10-19");
    expect(screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")).toBe("/api/admin/fleet/exports/rider-joins-exits?date=2026-10-19");
  });
});

describe("rider detail", () => {
  it("keeps an audit refusal in the audit section for roles that can open the rider", async () => {
    answer = (_, path) => path.startsWith("audit?") ? json({ code: "FORBIDDEN", message: "Your admin role can't do this." }, 403) : json(detail);
    render(createElement(RiderDetailView, { riderId: RIDER }));
    expect(await screen.findByText("Your admin role can't do this.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept document" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("No admin actions recorded yet.")).toBeNull();
  });

  it("accepts a document and approves the new phone", async () => {
    answer = (method, path) => method === "POST" && path.endsWith("/approve")
      ? json(path.includes("devices") ? { ...device, state: "BOUND", approvedBy: "Asha", approvedAt: at } : { ...document, status: "VERIFIED", reviewedBy: "Asha", reviewedAt: at })
      : path.startsWith("audit?") ? json({ entries: [], nextCursor: null }) : json(detail);
    render(createElement(RiderDetailView, { riderId: RIDER }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept document" }));
    expect(await screen.findByText("Document accepted.")).toBeTruthy();
    fireEvent.click(button("Approve this phone"));
    expect(await screen.findByText("New phone approved.")).toBeTruthy();
    expect(posts().map(call => [call.path, call.body])).toEqual([
      [`riders/${RIDER}/documents/${DOC}/approve`, undefined],
      [`riders/${RIDER}/devices/${DEVICE}/approve`, undefined],
    ]);
  });

  it("rejects a document only with a reason, shows the server's refusal and retries with the same key", async () => {
    render(createElement(RiderDetailView, { riderId: RIDER }));
    fireEvent.click(await screen.findByRole("button", { name: "Reject document" }));
    fireEvent.click(button("Reject document"));
    expect(screen.getByRole("alert").textContent).toBe("Write a reason of at least 3 characters.");
    expect(posts()).toHaveLength(0);

    answer = (method) => method === "POST" ? json({ code: "DOCUMENT_NOT_PENDING", message: "Someone already reviewed this document." }, 409) : json(detail);
    type(/Reason for/, "The photo is blurred");
    fireEvent.click(button("Reject document"));
    expect((await screen.findByRole("alert")).textContent).toBe("Someone already reviewed this document.");
    fireEvent.click(button("Reject document"));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[0].body).toEqual({ reason: "The photo is blurred" });
    expect(posts()[1].key).toBe(posts()[0].key);
  });

  it("keeps the notice and safety pause limits before anything is sent", async () => {
    render(createElement(RiderDetailView, { riderId: RIDER }));
    await screen.findByText("Record a status change");
    type("Reason (the rider sees it)", "Cash not handed over twice");
    type("Evidence summary", "Two customer calls and the trip log");
    type("Appeal phone", "+914012345678");
    type(/^Deadline/, localInput(3 * 24));
    fireEvent.click(button("Record status change"));
    expect(screen.getByRole("alert").textContent).toBe("The notice deadline must be at least 7 days from now.");

    fireEvent.change(field("Action"), { target: { value: "SAFETY_PAUSE" } });
    type(/^Review by/, localInput(80));
    fireEvent.click(button("Record status change"));
    expect(screen.getByRole("alert").textContent).toBe("The safety pause review must be within the next 72 hours.");
    expect(posts()).toHaveLength(0);

    answer = (method, path) => method === "POST" ? json(event, 201) : path.startsWith("audit?") ? json({ entries: [], nextCursor: null }) : json(detail);
    fireEvent.change(field("Action"), { target: { value: "NOTICE" } });
    type(/^Deadline/, "2030-01-15T10:00");
    fireEvent.click(button("Record status change"));
    expect(await screen.findByText("Status change recorded.")).toBeTruthy();
    expect(posts()[0].path).toBe(`riders/${RIDER}/status-events`);
    expect(posts()[0].body).toMatchObject({ kind: "NOTICE", reason: "Cash not handed over twice", evidenceSummary: "Two customer calls and the trip log", appealPhone: "+914012345678" });
    // 10:00 IST, even when the PC is set to another zone.
    expect((posts()[0].body as { deadline: string }).deadline).toBe("2030-01-15T04:30:00.000Z");
  });

  it("sets the payout account in person and shows a name mismatch from the server", async () => {
    render(createElement(RiderDetailView, { riderId: RIDER }));
    await screen.findByText("Payout account");
    type("UPI ID", "ravi@okaxis");
    type("Account holder name", "R KUMAR");
    fireEvent.click(button("Save payout account"));
    expect(screen.getByRole("alert").textContent).toBe("Tick that you saw the rider and their ID in person.");

    answer = (method) => method === "PUT" ? json({ code: "HOLDER_NAME_MISMATCH", message: "The holder name must match the KYC name RAVI KUMAR." }, 422) : json(detail);
    fireEvent.click(screen.getByLabelText(/I saw the rider/));
    fireEvent.click(button("Save payout account"));
    expect((await screen.findByRole("alert")).textContent).toBe("The holder name must match the KYC name RAVI KUMAR.");
    expect(posts()[0]).toMatchObject({ method: "PUT", path: `riders/${RIDER}/payout-account`, body: { method: "UPI", upiId: "ravi@okaxis", holderName: "R KUMAR", verifiedInPerson: true } });
  });
});

describe("selfie queue", () => {
  it("approves a selfie and needs a reason to reject", async () => {
    render(createElement(SelfieQueue));
    expect((await screen.findByRole("img", { name: "Go-online selfie of Ravi Kumar" })).getAttribute("src")).toBe(`/api/admin/fleet/shifts/${SHIFT}/selfie`);
    fireEvent.click(button("Reject selfie"));
    fireEvent.click(button("Reject selfie"));
    expect(screen.getByRole("alert").textContent).toBe("Write a reason of at least 3 characters.");
    fireEvent.click(button("Back"));

    answer = (method) => method === "POST" ? json({ shiftId: SHIFT, riderId: RIDER, riderName: "Ravi Kumar", startedAt: at, state: "APPROVED", reason: null, reviewedBy: "Asha", reviewedAt: at })
      : json({ items: [] });
    fireEvent.click(button("Approve selfie"));
    expect(await screen.findByText("No selfies are waiting for review.")).toBeTruthy();
    expect(screen.getByText("Ravi Kumar's selfie approved.")).toBeTruthy();
    expect(posts()[0]).toMatchObject({ path: `shifts/${SHIFT}/selfie/approve`, body: undefined });
  });
});
