// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { chatHistory, SupportChat } from "@/components/support/SupportChat";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function type(text: string) {
  const input = screen.getByLabelText("Message Craves support");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

it("sends the conversation without the greeting, shows the reply and the ticket chip", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ reply: "I've raised this with our team.", supportCase: { id: "c1", caseNumber: "SUP-1042" } }));
  vi.stubGlobal("fetch", fetch);
  render(createElement(SupportChat, { contextRole: "CHEF", orderId: "0b6f3f1e-8d0a-4c43-9a3e-2f7f6c2d9b11" }));
  type("My payout is missing");
  expect(await screen.findByText("I've raised this with our team.")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Ticket SUP-1042 created — our team will reply in your notifications");
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("/api/support/chat");
  expect(JSON.parse(init.body)).toEqual({
    contextRole: "CHEF", orderId: "0b6f3f1e-8d0a-4c43-9a3e-2f7f6c2d9b11",
    messages: [{ role: "user", content: "My payout is missing" }],
  });
});

it("explains rate limiting and restores the unsent message", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "SUPPORT_CHAT_RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "12" } })));
  render(createElement(SupportChat, { contextRole: "CUSTOMER" }));
  type("Hello?");
  expect((await screen.findByRole("alert")).textContent).toContain("try again in 12 s");
  expect((screen.getByLabelText("Message Craves support") as HTMLTextAreaElement).value).toBe("Hello?");
});

it("keeps only the newest 20 turns", () => {
  const turns = Array.from({ length: 25 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: String(index) }));
  const history = chatHistory(turns);
  expect(history).toHaveLength(20);
  expect(history.at(-1)?.content).toBe("24");
});
