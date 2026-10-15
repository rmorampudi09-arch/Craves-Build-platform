// @vitest-environment jsdom
// Synthetic tickets for a fixture chef; no backend is contacted.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportCaseError } from "@/shared/lib/support-cases-client";
import type { SupportCase, SupportCaseSummary } from "@/shared/lib/support-cases-contract";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  reply: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/shared/lib/support-cases-client", async (original) => ({
  ...(await original<typeof import("@/shared/lib/support-cases-client")>()),
  listSupportCases: api.list,
  getSupportCase: api.get,
  createSupportCase: api.create,
  replyToSupportCase: api.reply,
}));
vi.mock("@/shared/lib/session-fetch", () => ({ sessionFetch: api.fetch }));
import { ChefSupportHub, ChefSupportTicket } from "@/features/chef/components/chef-support";

const ticket = (id: string, role: "CHEF" | "CUSTOMER", subject: string): SupportCaseSummary => ({
  id,
  caseNumber: `CRV-0000000${id.slice(-5).toUpperCase()}`,
  requesterRole: role,
  orderId: null,
  subject,
  status: "OPEN",
  lastRequesterMessageAt: new Date().toISOString(),
  lastSupportMessageAt: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const CHEF_TICKET = ticket("5a0c0000-0000-4000-8000-0000000c0001", "CHEF", "Payout not received");
const OLDER_TICKET = ticket("5a0c0000-0000-4000-8000-0000000c0002", "CHEF", "Move my kitchen");
const CUSTOMER_TICKET = ticket("5a0c0000-0000-4000-8000-0000000c0003", "CUSTOMER", "Late delivery");
const thread = (summary: SupportCaseSummary, bodies: string[]): SupportCase => ({
  ...summary,
  messages: bodies.map((body, index) => ({
    id: `3e000000-0000-4000-8000-00000000000${index}`,
    senderRole: index % 2 ? "SUPPORT" : "CHEF",
    body,
    createdAt: summary.createdAt,
  })),
});

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Help & support", () => {
  it("lists only the chef's own tickets, with their number and status, and loads more", async () => {
    api.list
      .mockResolvedValueOnce({ items: [CHEF_TICKET, CUSTOMER_TICKET], nextCursor: "next" })
      .mockResolvedValueOnce({ items: [CHEF_TICKET, OLDER_TICKET], nextCursor: null });
    render(createElement(ChefSupportHub));
    const row = await screen.findByRole("link", { name: /#C0001 · Payout not received/ });
    expect(row.getAttribute("href")).toBe(`/chef/support/tickets/${CHEF_TICKET.id}`);
    expect(row.textContent).toContain("You wrote · Just now");
    expect(row.textContent).toContain("Open");
    expect(screen.queryByText(/Late delivery/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText(/Move my kitchen/);
    expect(api.list).toHaveBeenLastCalledWith("next");
    expect(screen.getAllByText(/#C0001/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("opens each common topic as a new ticket and keeps the chat", async () => {
    api.list.mockResolvedValue({ items: [], nextCursor: null });
    render(createElement(ChefSupportHub));
    expect(await screen.findByText("No tickets yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Delivery partner issue" }).getAttribute("href")).toBe(
      "/chef/support/new?topic=Delivery%20partner%20issue",
    );
    expect(screen.getByRole("link", { name: "Chat with us" }).getAttribute("href")).toBe(
      "/chef/support/chat",
    );
  });

  it("shows Coming soon when tickets are not live yet", async () => {
    api.list.mockRejectedValue(new SupportCaseError("FEATURE_NOT_AVAILABLE", 404));
    render(createElement(ChefSupportHub));
    expect(await screen.findByText("Your tickets are on their way")).toBeTruthy();
  });

  it("calls the number onboarding gives, or today's number when that read fails", async () => {
    api.list.mockResolvedValue({ items: [], nextCursor: null });
    const assign = vi.fn();
    const browser = window;
    vi.stubGlobal(
      "window",
      new Proxy(browser, {
        get: (target, key) => (key === "location" ? { assign } : Reflect.get(target, key, target)),
      }),
    );
    api.fetch
      .mockResolvedValueOnce(Response.json({ supportPhone: "+919876543210" }))
      .mockRejectedValueOnce(new TypeError("offline"));
    render(createElement(ChefSupportHub));
    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("tel:+919876543210"));
    expect(api.fetch).toHaveBeenCalledWith("/api/chef/onboarding", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    await waitFor(() => expect(assign).toHaveBeenLastCalledWith("tel:+918367366787"));
    expect(screen.getByText("Calling Craves support on +91 83673 66787")).toBeTruthy();
  });
});

describe("a ticket", () => {
  it("opens a ticket with the first message, then replies in the same thread", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    api.create.mockResolvedValue(thread(CHEF_TICKET, ["Please close my account"]));
    api.reply.mockResolvedValue(thread(CHEF_TICKET, ["Please close my account", "Done", "Thanks"]));
    render(createElement(ChefSupportTicket, { topic: "Delete my account" }));
    expect(screen.getByRole("heading", { level: 1, name: "Chat with us" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Write your message"), {
      target: { value: "  Please close my account " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("heading", { level: 1, name: "#C0001" });
    expect(api.create).toHaveBeenCalledWith({
      contextRole: "CHEF",
      orderId: null,
      subject: "Delete my account",
      message: "Please close my account",
    });
    expect(replaceState).toHaveBeenCalledWith(null, "", `/chef/support/tickets/${CHEF_TICKET.id}`);
    fireEvent.change(screen.getByLabelText("Write a reply"), { target: { value: "Thanks" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Craves support");
    expect(api.reply).toHaveBeenCalledWith(CHEF_TICKET.id, "Thanks");
    expect((screen.getByLabelText("Write a reply") as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps the message and offers Call when tickets are not live yet", async () => {
    api.create.mockRejectedValue(new SupportCaseError("FEATURE_NOT_AVAILABLE", 404));
    render(createElement(ChefSupportTicket, { topic: "Payout not received" }));
    fireEvent.change(screen.getByLabelText("Write your message"), {
      target: { value: "Where is my money?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Chat is on its way")).toBeTruthy();
    expect(screen.getByText("Your message is still in the box below.")).toBeTruthy();
    expect((screen.getByLabelText("Write your message") as HTMLTextAreaElement).value).toBe(
      "Where is my money?",
    );
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Call" })).toBeTruthy();
  });

  it("says when a send failed and keeps the words", async () => {
    api.get.mockResolvedValue(thread(CHEF_TICKET, ["Hello"]));
    api.reply.mockRejectedValue(new SupportCaseError("SUPPORT_CASE_FAILED", 503));
    render(createElement(ChefSupportTicket, { caseId: CHEF_TICKET.id }));
    fireEvent.change(await screen.findByLabelText("Write a reply"), {
      target: { value: "Any news?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "We couldn't send that. Your message is still here.",
    );
    expect((screen.getByLabelText("Write a reply") as HTMLTextAreaElement).value).toBe("Any news?");
  });

  it("takes no reply on a closed ticket and offers a new chat", async () => {
    api.get.mockResolvedValue(
      thread({ ...CHEF_TICKET, status: "CLOSED", closedAt: CHEF_TICKET.updatedAt }, [
        "Hello",
        "Sorted",
      ]),
    );
    render(createElement(ChefSupportTicket, { caseId: CHEF_TICKET.id }));
    expect(await screen.findByText("This ticket is closed")).toBeTruthy();
    expect(screen.queryByLabelText("Write a reply")).toBeNull();
    expect(screen.getByRole("link", { name: "Start a new chat" }).getAttribute("href")).toBe(
      "/chef/support/new",
    );
    expect(screen.getByText("Closed")).toBeTruthy();
  });
});
