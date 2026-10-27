// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("shows how each shift's phone kept in touch and how its recent offers rang", async () => {
    const shift = {
      shiftId: SHIFT, startedAt: at, endedAt: null, selfieState: "APPROVED", selfieReason: null, selfieReviewedBy: "Asha", inZoneSeconds: 1800,
      lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString(), maxSilenceSeconds: 75, silencesOver60s: 1,
      phone: { batteryPct: 54, charging: false, powerSave: true, canRing: false, batteryPerHourPct: null, lastExitReason: null, queuePending: 0, queueOldestAgeS: null },
    };
    const offer = {
      offerId: "77777777-7777-4777-8777-777777777777", tripId: "88888888-8888-4888-8888-888888888888", orderCode: "#0A1B2C3D", state: "EXPIRED",
      offeredAt: at, pushedAt: at, pushResult: "NO_TOKEN", rangAt: "2026-10-20T06:30:09Z", rangChannel: "locations",
    };
    answer = (_, path) => path.startsWith("audit?") ? json({ entries: [], nextCursor: null }) : json({ ...detail, shifts: [shift], recentOffers: [offer] });
    render(createElement(RiderDetailView, { riderId: RIDER }));
    expect(await screen.findByText("5 min ago: the phone may have stopped")).toBeTruthy();
    expect(screen.getByText("75 s · 1 over 60 s")).toBeTruthy();
    expect(screen.getByText("Battery 54% · battery saver on · offers can't ring")).toBeTruthy();
    const offers = screen.getByRole("heading", { name: "Recent offers" }).closest("section") as HTMLElement;
    for (const text of ["#0A1B2C3D", "Expired", "No token", "9.0 s, by the location call"]) expect(within(offers).getByText(text)).toBeTruthy();
  });

  it("leaves the phone health and offers out for an older server", async () => {
    const shift = { shiftId: SHIFT, startedAt: at, endedAt: at, selfieState: "APPROVED", selfieReason: null, selfieReviewedBy: "Asha", inZoneSeconds: 60 };
    answer = (_, path) => path.startsWith("audit?") ? json({ entries: [], nextCursor: null }) : json({ ...detail, shifts: [shift] });
    render(createElement(RiderDetailView, { riderId: RIDER }));
    expect(await screen.findByText("No report")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Recent offers" })).toBeNull();
  });

  it("accepts a document with the expiry it shows and approves the new phone", async () => {
    answer = (method, path) => method === "POST" && path.endsWith("/approve")
      ? json(path.includes("devices") ? { ...device, state: "BOUND", approvedBy: "Asha", approvedAt: at } : { ...document, status: "VERIFIED", reviewedBy: "Asha", reviewedAt: at })
      : path.startsWith("audit?") ? json({ entries: [], nextCursor: null }) : json(detail);
    render(createElement(RiderDetailView, { riderId: RIDER }));
    expect((await screen.findByLabelText("Driving licence expiry date (as printed)") as HTMLInputElement).value).toBe("2030-01-31");
    fireEvent.click(button("Accept document"));
    expect(await screen.findByText("Document accepted.")).toBeTruthy();
    fireEvent.click(button("Approve this phone"));
    expect(await screen.findByText("New phone approved.")).toBeTruthy();
    expect(posts().map(call => [call.path, call.body])).toEqual([
      [`riders/${RIDER}/documents/${DOC}/approve`, { expiresOn: "2030-01-31" }],
      [`riders/${RIDER}/devices/${DEVICE}/approve`, undefined],
    ]);
  });

  it("needs a current expiry date for a PUC certificate and shows the server's refusal", async () => {
    const puc = { ...document, type: "PUC", expiresOn: null };
    answer = (_, path) => path.startsWith("audit?") ? json({ entries: [], nextCursor: null }) : json({ ...detail, documents: [puc] });
    render(createElement(RiderDetailView, { riderId: RIDER }));
    await screen.findByText("PUC certificate");
    fireEvent.click(button("Accept document"));
    expect(screen.getByRole("alert").textContent).toBe("Enter the expiry date printed on the document.");
    type("PUC certificate expiry date (as printed)", "2020-03-31");
    fireEvent.click(button("Accept document"));
    expect(screen.getByRole("alert").textContent).toBe("This document has expired. Reject it so the rider uploads a new one.");
    expect(posts()).toHaveLength(0);

    let finish!: (response: Response) => void;
    answer = (method) => method === "POST" ? new Promise(resolve => { finish = resolve; }) : json({ ...detail, documents: [puc] });
    type("PUC certificate expiry date (as printed)", "2031-03-31");
    fireEvent.click(button("Accept document"));
    expect(await screen.findByText("Saving…")).toBeTruthy();
    expect(button("Accept document").disabled).toBe(true);
    expect(posts()[0]).toMatchObject({ path: `riders/${RIDER}/documents/${DOC}/approve`, body: { expiresOn: "2031-03-31" } });
    expect(posts()[0].key).toMatch(UUID);
    finish(json({ code: "EXPIRY_REQUIRED", message: "Add the expiry date printed on the PUC certificate." }, 422));
    expect((await screen.findByRole("alert")).textContent).toBe("Add the expiry date printed on the PUC certificate.");
  });

  it("accepts a document that doesn't expire without asking for a date", async () => {
    const pan = { ...document, type: "PAN", expiresOn: null };
    answer = (method, path) => method === "POST" ? json({ ...pan, status: "VERIFIED", reviewedBy: "Asha", reviewedAt: at })
      : path.startsWith("audit?") ? json({ entries: [], nextCursor: null }) : json({ ...detail, documents: [pan] });
    render(createElement(RiderDetailView, { riderId: RIDER }));
    await screen.findByText("PAN card");
    expect(screen.queryByLabelText(/expiry date/)).toBeNull();
    fireEvent.click(button("Accept document"));
    expect(await screen.findByText("Document accepted.")).toBeTruthy();
    expect(posts()[0]).toMatchObject({ path: `riders/${RIDER}/documents/${DOC}/approve`, body: undefined });
  });

  it("saves the vehicle through every state", async () => {
    render(createElement(RiderDetailView, { riderId: RIDER }));
    await screen.findByText("No vehicle recorded yet.", { exact: false });
    type("Vehicle (make and model)", "Honda Activa 6G");
    type("Registration number", "TS 09 E 12");
    fireEvent.click(button("Save vehicle"));
    expect(screen.getByRole("alert").textContent).toBe("Enter the registration number, like TS09EA1234.");
    expect(posts()).toHaveLength(0);

    answer = (method) => method === "PUT" ? json({ code: "FORBIDDEN", message: "OPERATIONS_ADMIN required" }, 403) : json(detail);
    type("Registration number", "ts-09-ea-1234");
    fireEvent.click(button("Save vehicle"));
    expect((await screen.findByRole("alert")).textContent).toBe("Your admin role can't do this.");

    answer = (method) => method === "PUT" ? json({ code: "FLEET_UNAVAILABLE", message: "The fleet service is busy. Try again." }, 503) : json(detail);
    fireEvent.click(button("Save vehicle"));
    expect((await screen.findByRole("alert")).textContent).toBe("The fleet service is busy. Try again.");

    let finish!: (response: Response) => void;
    answer = (method) => method === "PUT" ? new Promise(resolve => { finish = resolve; }) : json({ ...detail, rider: { ...detail.rider, vehicleNumberMasked: "TS09xx1234" } });
    fireEvent.click(button("Save vehicle"));
    expect(await screen.findByText("Saving…")).toBeTruthy();
    finish(json({ label: "Honda Activa 6G", regNumberMasked: "TS09xx1234" }));
    expect(await screen.findByText("Vehicle saved. The rider sees it on their profile.")).toBeTruthy();
    expect(await screen.findByText("Registration TS09xx1234.", { exact: false })).toBeTruthy();
    expect(posts().map(call => [call.method, call.path, call.body])).toEqual(Array(3).fill(["PUT", `riders/${RIDER}/vehicle`, { label: "Honda Activa 6G", regNumber: "TS09EA1234" }]));
    // The same save after a refusal keeps its Idempotency-Key.
    expect(new Set(posts().map(call => call.key)).size).toBe(1);
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

  it("confirms the account the rider sent from the app", async () => {
    const sent = { method: "BANK", maskedAccount: "xxxxxx4020", ifsc: "SBIN0001234", holderName: "Ravi Kumar", setBy: "Ravi Kumar", setAt: at };
    answer = (method, path) => method === "POST" ? json({ ...sent, setBy: "Asha" })
      : path === `riders/${RIDER}` ? json({ ...detail, submittedPayoutAccount: sent }) : json({}, 500);
    render(createElement(RiderDetailView, { riderId: RIDER }));
    expect((await screen.findByText(/Sent from the app, not paid yet/)).parentElement?.textContent).toContain("Bank xxxxxx4020 · SBIN0001234 · Ravi Kumar");
    fireEvent.click(button("Confirm this account"));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({ method: "POST", path: `riders/${RIDER}/payout-account/confirm`, key: expect.stringMatching(UUID) });
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
