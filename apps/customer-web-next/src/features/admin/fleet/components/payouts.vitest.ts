// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, istDay } from "@/features/admin/fleet/lib/payout-contract";
import { FleetPayouts } from "./fleet-payouts";

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

const BATCH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAYOUT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TRIP = "77777777-7777-4777-8777-777777777777";
const HOLD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RIDER = "11111111-1111-4111-8111-111111111111";
const at = "2026-10-20T06:30:00Z";
const payout = { payoutId: PAYOUT, riderId: RIDER, riderName: "Ravi Kumar", amountPaise: 12345678, maskedAccount: "xxxxxx4321", status: "PENDING", utr: null, failureReason: null, markedBy: null, markedAt: null };
const batch = (extra: object = {}) => ({ batchId: BATCH, kind: "WEEKLY", payoutDate: "2026-10-19", status: "CREATED", totalPaise: 12345678, payoutCount: 1, createdBy: "Asha", createdByMe: false, createdAt: at, approvedBy: null, approvedAt: null, sentAt: null, payouts: [payout], ...extra });
const hold = { holdId: HOLD, tripId: TRIP, orderCode: "#0BDE0107", riderId: RIDER, riderName: "Ravi Kumar", amountPaise: 9050, reason: "Photo delivery to check", releaseOn: addDays(istDay(), 3), state: "ACTIVE", createdBy: "Asha", createdAt: at, releasedBy: null, releasedAt: null };
const json = (body: unknown, status = 200) => Response.json(body, { status });
const posts = () => calls.filter(call => call.method !== "GET");
const button = (name: string | RegExp, scope: HTMLElement = document.body) => within(scope).getByRole("button", { name }) as HTMLButtonElement;
let current = batch();
function lists(path: string) {
  if (path === "payout-batches") return json({ batches: [current] }); // the list parser drops the payout rows
  if (path === `payout-batches/${BATCH}`) return json(current);
  if (path.startsWith("holds?state=ACTIVE")) return json({ holds: [hold] });
  if (path.startsWith("holds?")) return json({ holds: [] });
  return json({ code: "UNMOCKED", message: path }, 500);
}
async function openBatch() {
  render(createElement(FleetPayouts));
  fireEvent.click(await screen.findByRole("button", { name: "Open the 2026-10-19 Weekly (Monday) batch" }));
  return (await screen.findByRole("heading", { name: "Weekly (Monday) · 2026-10-19" })).closest("section") as HTMLElement;
}

beforeEach(() => {
  calls.length = 0;
  current = batch();
  vi.stubGlobal("confirm", vi.fn(() => true));
  answer = (method, path) => method === "GET" ? lists(path) : json({ code: "UNMOCKED", message: path }, 500);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("payout batches", () => {
  it("creates the weekly file only for a Monday and opens it", async () => {
    render(createElement(FleetPayouts));
    fireEvent.change(await screen.findByLabelText("Pay date"), { target: { value: "2026-10-20" } });
    fireEvent.click(button("Create payout file"));
    expect(screen.getByRole("alert").textContent).toBe("A weekly payout date must be a Monday.");
    expect(posts()).toHaveLength(0);

    let finish!: (response: Response) => void;
    answer = (method, path) => method === "POST" ? new Promise(resolve => { finish = resolve; }) : lists(path);
    fireEvent.change(screen.getByLabelText("Pay date"), { target: { value: "2026-10-19" } });
    fireEvent.click(button("Create payout file"));
    expect(await screen.findByText("Saving…")).toBeTruthy();
    expect(button("Create payout file").disabled).toBe(true);
    finish(json(batch({ createdByMe: true }), 201));
    expect(await screen.findByText("Payout file created. Check it below, then a second payments admin approves it.")).toBeTruthy();
    expect(posts()[0]).toMatchObject({ path: "payout-batches", body: { kind: "WEEKLY", payoutDate: "2026-10-19" } });
    expect(await screen.findByRole("link", { name: "Download bank file (CSV)" })).toBeTruthy();
    expect(screen.getAllByText("₹1,23,456.78").length).toBeGreaterThan(0);
  });

  it("blocks the creator from approving", async () => {
    current = batch({ createdByMe: true });
    const section = await openBatch();
    expect(button("Approve as second approver", section).disabled).toBe(true);
    expect(within(section).getByText("You created this batch, so a different payments admin must approve it.")).toBeTruthy();
    expect(within(section).getByRole("link", { name: "Download bank file (CSV)" }).getAttribute("href")).toBe(`/api/admin/fleet/payout-batches/${BATCH}/file`);
  });

  it("shows the server's same-approver refusal", async () => {
    answer = (method, path) => method === "POST" ? json({ code: "SAME_APPROVER", message: "You created this batch. Another payments admin must approve it." }, 403) : lists(path);
    const section = await openBatch();
    fireEvent.click(button("Approve as second approver", section));
    expect((await within(section).findByRole("alert")).textContent).toBe("You created this batch. Another payments admin must approve it.");
    expect(posts()[0]).toMatchObject({ path: `payout-batches/${BATCH}/approve`, body: undefined });
  });

  it("approves, then marks the batch sent", async () => {
    answer = (method, path) => {
      if (method === "POST" && path.endsWith("/approve")) current = batch({ status: "APPROVED", approvedBy: "Kiran", approvedAt: at });
      if (method === "POST" && path.endsWith("/mark-sent")) current = batch({ status: "SENT", approvedBy: "Kiran", approvedAt: at, sentAt: at });
      return method === "POST" ? json(current) : lists(path);
    };
    const section = await openBatch();
    fireEvent.click(button("Approve as second approver", section));
    expect(await within(section).findByText("Batch approved. Upload the file to the bank, then mark it sent.")).toBeTruthy();
    fireEvent.click(button("Mark sent to the bank", section));
    expect(await within(section).findByText("Batch marked sent. Add each UTR as the bank confirms it.")).toBeTruthy();
    expect(posts().map(call => call.path)).toEqual([`payout-batches/${BATCH}/approve`, `payout-batches/${BATCH}/mark-sent`]);
    expect(posts()[0].key).not.toBe(posts()[1].key);
  });

  it("records a UTR or a failure only after the batch is sent", async () => {
    current = batch({ status: "SENT" });
    answer = (method, path) => {
      if (method === "POST" && path.endsWith("/utr")) { current = batch({ status: "CLOSED", payouts: [{ ...payout, status: "PAID", utr: "429312345678", markedBy: "Asha", markedAt: at }] }); return json(current.payouts[0]); }
      if (method === "POST" && path.endsWith("/fail")) return json({ code: "PAYOUT_NOT_PENDING", message: "This payout was already marked." }, 409);
      return lists(path);
    };
    const section = await openBatch();
    const row = within(section).getByText("Ravi Kumar").closest("tr") as HTMLElement;
    fireEvent.click(button("Mark failed", row));
    fireEvent.change(within(row).getByLabelText(/Reason for/), { target: { value: "Account closed" } });
    fireEvent.click(button("Mark failed", row));
    expect((await within(row).findByRole("alert")).textContent).toBe("This payout was already marked.");
    fireEvent.click(button("Back", row));

    fireEvent.change(within(row).getByLabelText("UTR for Ravi Kumar"), { target: { value: "123" } });
    fireEvent.click(button("Save UTR", row));
    expect(within(row).getByRole("alert").textContent).toBe("Enter the UTR from the bank: 12 to 22 letters or digits.");
    fireEvent.change(within(row).getByLabelText("UTR for Ravi Kumar"), { target: { value: "429312345678" } });
    fireEvent.click(button("Save UTR", row));
    expect(await within(section).findByText("429312345678")).toBeTruthy();
    expect(posts().map(call => [call.path, call.body])).toEqual([
      [`payout-batches/${BATCH}/payouts/${PAYOUT}/fail`, { reason: "Account closed" }],
      [`payout-batches/${BATCH}/payouts/${PAYOUT}/utr`, { utr: "429312345678" }],
    ]);
  });
});

describe("corrections", () => {
  it("cancels an unsent file only after the not-uploaded check, then closes it", async () => {
    answer = (method, path) => method === "POST" && path.endsWith("/cancel")
      ? json({ batchId: BATCH, kind: "WEEKLY", payoutDate: "2026-10-19", payoutCount: 1, totalPaise: 12345678 }) : lists(path);
    const section = await openBatch();
    fireEvent.click(button("Cancel this payout file", section));
    fireEvent.change(within(section).getByLabelText("Why cancel it"), { target: { value: "Made for the wrong Monday" } });
    fireEvent.click(button("Cancel the file", section));
    expect(within(section).getByRole("alert").textContent).toBe("Tick the box once you have checked this file was not uploaded to the bank.");
    expect(posts()).toHaveLength(0);

    fireEvent.click(within(section).getByLabelText("I checked: this file was not uploaded to the bank."));
    fireEvent.click(button("Cancel the file", section));
    expect(await screen.findByText("Cancelled the 2026-10-19 Weekly (Monday) file: 1 payout, ₹1,23,456.78. Make the file again once the mistake is fixed.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Weekly (Monday) · 2026-10-19" })).toBeNull();
    expect(posts()[0]).toMatchObject({ path: `payout-batches/${BATCH}/cancel`, body: { reason: "Made for the wrong Monday", notUploaded: true } });
  });

  it("offers no cancel once the file is sent", async () => {
    current = batch({ status: "SENT" });
    const section = await openBatch();
    expect(within(section).queryByRole("button", { name: "Cancel this payout file" })).toBeNull();
  });

  it("records the bank's reversal of a paid payout", async () => {
    const paid = { ...payout, status: "PAID", utr: "429312345678", markedBy: "Asha", markedAt: at };
    current = batch({ status: "CLOSED", payouts: [paid] });
    answer = (method, path) => {
      if (method === "POST" && path.endsWith("/reverse")) {
        current = batch({ status: "CLOSED", payouts: [{ ...paid, status: "FAILED", failureReason: "Returned by the bank: Account closed" }] });
        return json(current.payouts[0]);
      }
      return lists(path);
    };
    const section = await openBatch();
    const row = within(section).getByText("Ravi Kumar").closest("tr") as HTMLElement;
    fireEvent.click(button("Record bank reversal", row));
    fireEvent.change(within(row).getByLabelText(/Reason for/), { target: { value: "Account closed" } });
    fireEvent.click(button("Record bank reversal", row));
    expect(await within(row).findByText("Reversal recorded. The money is back in the rider's balance; their payouts pause until ops sets the payout account again with them.")).toBeTruthy();
    expect(await within(row).findByText(/Returned by the bank: Account closed/)).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Record bank reversal" })).toBeNull();
    expect(posts()[0]).toMatchObject({ path: `payout-batches/${BATCH}/payouts/${PAYOUT}/reverse`, body: { reason: "Account closed" } });
  });

  it("takes back a wrong drop distance with the reason the rider sees", async () => {
    answer = (method, path) => method === "POST"
      ? json({ tripId: TRIP, orderCode: "#0BDE0107", riderId: RIDER, component: "drop-km", revision: 2, amountPaise: -1250, reason: "The drop was 2.9 km, not 4.2 km" }, 201)
      : lists(path);
    render(createElement(FleetPayouts));
    const form = (await screen.findByRole("heading", { name: "Adjust a trip's pay" })).closest("form") as HTMLElement;
    fireEvent.change(within(form).getByLabelText("Trip ID"), { target: { value: TRIP } });
    fireEvent.change(within(form).getByLabelText("Amount, ₹"), { target: { value: "12.50" } });
    fireEvent.click(button("Adjust pay", form));
    expect(within(form).getByRole("alert").textContent).toBe("Write a reason of at least 3 characters.");
    expect(posts()).toHaveLength(0);

    fireEvent.change(within(form).getByLabelText("Reason (the rider sees it)"), { target: { value: "The drop was 2.9 km, not 4.2 km" } });
    fireEvent.click(button("Adjust pay", form));
    expect(window.confirm).toHaveBeenCalledWith("Drop distance: take back ₹12.50 on this trip? The rider sees it with your reason.");
    expect(await within(form).findByText(/^Adjusted Drop distance on #0BDE0107 by -₹12.50\. The rider owes it/)).toBeTruthy();
    expect(posts()[0]).toMatchObject({ path: `trips/${TRIP}/pay-adjustments`, body: { component: "drop-km", amountPaise: -1250, reason: "The drop was 2.9 km, not 4.2 km" } });
    expect((within(form).getByLabelText("Trip ID") as HTMLInputElement).value).toBe("");
  });
});

describe("pay holds", () => {
  it("places a hold with a reason and a release date at most 7 days away", async () => {
    answer = (method, path) => method === "POST" ? json({ ...hold, holdId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }, 201) : lists(path);
    render(createElement(FleetPayouts));
    const section = (await screen.findByRole("heading", { name: "Pay holds" })).closest("section") as HTMLElement;
    fireEvent.change(within(section).getByLabelText("Trip ID"), { target: { value: TRIP } });
    fireEvent.change(within(section).getByLabelText("Reason (the rider sees it)"), { target: { value: "Photo delivery to check" } });
    fireEvent.change(within(section).getByLabelText("Release on"), { target: { value: addDays(istDay(), 8) } });
    fireEvent.click(button("Place hold", section));
    expect(within(section).getByRole("alert").textContent).toContain("a hold never lasts more than 7 days");
    expect(posts()).toHaveLength(0);

    fireEvent.change(within(section).getByLabelText("Release on"), { target: { value: addDays(istDay(), 7) } });
    fireEvent.click(button("Place hold", section));
    expect(await within(section).findByText("Hold placed. Only this trip's pay is held.")).toBeTruthy();
    expect(posts()[0]).toMatchObject({ path: "holds", body: { tripId: TRIP, reason: "Photo delivery to check", releaseOn: addDays(istDay(), 7) } });
  });

  it("releases a hold after confirmation", async () => {
    answer = (method, path) => method === "POST" ? json({ ...hold, state: "RELEASED", releasedBy: "Asha", releasedAt: at }) : lists(path);
    render(createElement(FleetPayouts));
    const row = (await screen.findByText("#0BDE0107")).closest("tr") as HTMLElement;
    expect(row.textContent).toContain("₹90.50");
    fireEvent.click(button("Release now", row));
    expect(window.confirm).toHaveBeenCalledWith("Release the hold on #0BDE0107? ₹90.50 becomes withdrawable.");
    expect(await screen.findByText("Hold on #0BDE0107 released.")).toBeTruthy();
    await waitFor(() => expect(posts()[0]).toMatchObject({ path: `holds/${HOLD}/release`, body: undefined }));
  });
});
