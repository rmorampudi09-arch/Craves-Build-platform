// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminAccountIntervention } from "../components/admin-account-intervention";
import { AdminNotificationRecovery } from "../components/admin-notification-recovery";
import { AdminChefReviewList } from "../components/admin-chef-review-list";
import { AdminChefReviewDetails } from "../components/admin-chef-review-details";
import { AdminCustomer360 } from "../components/admin-customer-360";
import { AdminGlobalSearch } from "../components/admin-global-search";

const { fetcher } = vi.hoisted(() => ({ fetcher: vi.fn() }));
vi.mock("@/lib/admin-renewal", () => ({ adminFetch: fetcher }));

const id = "00112233-4455-4677-8899-aabbccddeeff";
const docId = "11223344-5566-4788-99aa-bbccddeeff00";
const now = "2026-09-30T09:00:00Z";
const application = { id, phoneNumber: "+919999999999", email: "chef@example.test", firstName: "Test", lastName: "Kitchen", addressLine1: "Test address", city: "Hyderabad", state: "Telangana", status: "PENDING", submittedAt: now, documents: [] };
const account = { identityId: id, status: "ACTIVE", tokenVersion: 1, providerAttemptCount: 0, changed: false };
const backlog = { requestId: id, sourceService: "order-service", eventType: "Order update", channel: "EMAIL", status: "DEAD_LETTER", attemptCount: 3, updatedAt: now };
const id2 = "22334455-6677-4899-aabb-ccddeeff0011";
const order = { orderId: docId, kitchenName: "First Kitchen", status: "DELIVERED", currency: "INR", grandTotal: 100, createdAt: now, updatedAt: now };
function journey(identityId = id, rows = [order], hasMore = false) {
  return { orders: { customerIdentityId: identityId, items: rows, hasMore, nextBeforeCreatedAt: hasMore ? now : null, nextBeforeOrderId: hasMore ? docId : null }, payments: { customerIdentityId: identityId, items: [], hasMore: false }, refunds: { customerIdentityId: identityId, items: [], hasMore: false }, errors: {} };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => { cleanup(); fetcher.mockReset(); vi.restoreAllMocks(); });

describe("admin operational workflows", () => {
  it("reports a failed notification load separately from an empty backlog", async () => {
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(Response.json([]));
    render(createElement(AdminNotificationRecovery));
    fireEvent.click(screen.getByRole("button", { name: "Load backlog" }));
    await screen.findByRole("heading", { name: "Backlog unavailable" });
    expect(screen.queryByText("No requests in this backlog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load backlog" }));
    await screen.findByRole("heading", { name: "No requests in this backlog" });
  });

  it("clears a selected notification when the admin changes backlog filters", async () => {
    fetcher.mockResolvedValue(Response.json([backlog]));
    render(createElement(AdminNotificationRecovery));
    fireEvent.click(screen.getByRole("button", { name: "Load backlog" }));
    fireEvent.click(await screen.findByRole("button", { name: /Order update/ }));
    fireEvent.change(screen.getByLabelText("Recovery reason"), { target: { value: "Confirmed delivery failure" } });
    fireEvent.change(screen.getByLabelText("Type RETRY to confirm"), { target: { value: "RETRY" } });
    expect((screen.getByRole("button", { name: "Retry selected notification" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Backlog status"), { target: { value: "FAILED" } });
    expect((screen.getByRole("button", { name: "Retry selected notification" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /Order update/ })).toBeNull();
  });

  it("locks account targets while a lookup runs and prevents duplicate submissions", async () => {
    const lookup = deferred<Response>();
    fetcher.mockReturnValue(lookup.promise);
    render(createElement(AdminAccountIntervention));
    const input = screen.getByLabelText("Identity UUID") as HTMLInputElement;
    fireEvent.change(input, { target: { value: id } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.submit(input.closest("form")!);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(input.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Loading account status");
    await act(async () => { lookup.resolve(Response.json(account)); });
    expect(input.disabled).toBe(false);
    expect(screen.getByRole("heading", { name: "ACTIVE" })).toBeTruthy();
  });

  it("does not display an unverified partial account as actionable evidence", async () => {
    fetcher.mockResolvedValue(Response.json({ identityId: id }));
    render(createElement(AdminAccountIntervention));
    fireEvent.change(screen.getByLabelText("Identity UUID"), { target: { value: id } });
    fireEvent.click(screen.getByRole("button", { name: "Load account status" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("could not be verified");
    expect((screen.getByLabelText("Mandatory audit reason") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("keeps the newest chef queue when a previous status request finishes late", async () => {
    const pending = deferred<Response>();
    fetcher.mockImplementation((url: string) => url.includes("status=PENDING") ? pending.promise : Promise.resolve(Response.json([{ ...application, status: "APPROVED", firstName: "Approved" }])));
    render(createElement(AdminChefReviewList));
    fireEvent.click(screen.getByRole("button", { name: "Approved" }));
    await screen.findByRole("heading", { name: "Approved Kitchen" });
    await act(async () => { pending.resolve(Response.json([application])); });
    expect(screen.queryByRole("heading", { name: "Test Kitchen" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Approved Kitchen" })).toBeTruthy();
  });

  it("reports a saved document decision even when its follow-up refresh fails", async () => {
    const evidence = [{ id: docId, documentType: "APPLICANT_PHOTO", originalFileName: "photo.png", fileSizeBytes: 100, status: "UPLOADED", reviewReason: null, reviewedAt: null }];
    let reads = 0;
    fetcher.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(Response.json({}));
      reads++;
      return Promise.resolve(reads <= 2 ? Response.json(url.endsWith("evidence-status") ? evidence : application) : Response.json({}, { status: 503 }));
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(createElement(AdminChefReviewDetails, { applicationId: id }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve document" }));
    await screen.findByText(/Document decision was saved/);
    expect((screen.getByRole("button", { name: "Approve document" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Refresh application" }) as HTMLButtonElement).disabled).toBe(false);
    await waitFor(() => expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1));
  });

  it("does not overwrite the selected customer with a late previous journey response", async () => {
    const old = deferred<Response>();
    fetcher.mockImplementation((_url: string, init: RequestInit) => JSON.parse(init.body as string).identityId === id ? old.promise : Promise.resolve(Response.json(journey(id2, [{ ...order, kitchenName: "Current Kitchen" }]))));
    const view = render(createElement(AdminCustomer360, { identityId: id, reason: "Customer support request" }));
    view.rerender(createElement(AdminCustomer360, { identityId: id2, reason: "Customer support request" }));
    await screen.findByText("Current Kitchen");
    await act(async () => { old.resolve(Response.json(journey())); });
    expect(screen.queryByText("First Kitchen")).toBeNull();
    expect(screen.getByText("Current Kitchen")).toBeTruthy();
  });

  it("keeps pagination on applied filters and avoids duplicated records", async () => {
    fetcher.mockResolvedValueOnce(Response.json(journey(id, [order], true))).mockResolvedValueOnce(Response.json(journey(id, [order, { ...order, orderId: id2, kitchenName: "Next Kitchen" }])));
    render(createElement(AdminCustomer360, { identityId: id, reason: "Customer support request" }));
    await screen.findByText("First Kitchen");
    fireEvent.change(screen.getByLabelText("Payment provider"), { target: { value: "RAZORPAY" } });
    fireEvent.click(screen.getByRole("button", { name: "Load more orders" }));
    await screen.findByText("Next Kitchen");
    const nextQuery = JSON.parse(fetcher.mock.calls[1][1].body as string);
    expect(nextQuery.provider).toBeUndefined();
    expect(nextQuery.orderBeforeId).toBe(docId);
    expect(screen.getAllByText("First Kitchen")).toHaveLength(1);
  });

  it("shows unavailable customer sections when the journey fails", async () => {
    fetcher.mockResolvedValue(Response.json({}, { status: 503 }));
    render(createElement(AdminCustomer360, { identityId: id, reason: "Customer support request" }));
    await screen.findByText("Orders are unavailable. Select Refresh journey to retry.");
    expect(screen.queryByText(/No orders matched/)).toBeNull();
    expect(screen.queryByText(/No payments matched/)).toBeNull();
  });

  it("clears previous directory hits when the next search fails", async () => {
    const hit = { entityType: "CUSTOMER", identityId: id, recordId: docId, displayName: "Previous Customer", secondaryLabel: "Customer", status: "ACTIVE", matchField: "EMAIL", maskedMatchValue: "c***@example.test" };
    fetcher.mockResolvedValueOnce(Response.json({ correlationId: id, queryType: "EMAIL", hits: [hit] })).mockResolvedValueOnce(Response.json({}, { status: 503 }));
    render(createElement(AdminGlobalSearch));
    fireEvent.change(screen.getByLabelText("Find a customer or chef"), { target: { value: "customer@example.test" } });
    fireEvent.change(screen.getByLabelText("Operational reason · required"), { target: { value: "Customer support request" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Previous Customer");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Directory search is temporarily unavailable.");
    expect(screen.queryByText("Previous Customer")).toBeNull();
  });
});
