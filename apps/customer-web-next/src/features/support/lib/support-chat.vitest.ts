// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { chatHistory, richText, SupportChat } from "@/features/support/components/SupportChat";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (Element.prototype as Partial<Element>).scrollIntoView; });

function type(text: string) {
  const input = screen.getByLabelText("Message Craves support");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

it("sends the conversation without the greeting, shows typing, the reply, Sent and the ticket chip", async () => {
  let answer: (value: Response) => void = () => {};
  const fetch = vi.fn().mockReturnValue(new Promise<Response>(resolve => { answer = resolve; }));
  vi.stubGlobal("fetch", fetch);
  render(createElement(SupportChat, { contextRole: "CHEF", orderId: "0b6f3f1e-8d0a-4c43-9a3e-2f7f6c2d9b11" }));
  type("My payout is missing");
  expect(screen.getByText(/Sending$/)).toBeTruthy();
  expect(screen.getByText("Craves Assistant is typing")).toBeTruthy();
  answer(Response.json({ reply: "I've raised this with our team.", supportCase: { id: "c1", caseNumber: "SUP-1042" } }));
  expect(await screen.findByText("I've raised this with our team.")).toBeTruthy();
  expect(screen.getByText(/ Sent$/)).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Ticket SUP-1042 created — our team will reply in your notifications");
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("/api/support/chat");
  expect(JSON.parse(init.body)).toEqual({
    contextRole: "CHEF", orderId: "0b6f3f1e-8d0a-4c43-9a3e-2f7f6c2d9b11",
    messages: [{ role: "user", content: "My payout is missing" }],
  });
});

it("asks a suggested question in one tap, in browsers whose scrollIntoView returns a Promise", async () => {
  // Current Chrome returns a Promise here; returning it from an effect crashed the page on send.
  Element.prototype.scrollIntoView = () => Promise.resolve() as never;
  const fetch = vi.fn().mockResolvedValue(Response.json({ reply: "Profile › Delivery addresses.", supportCase: null }));
  vi.stubGlobal("fetch", fetch);
  render(createElement(SupportChat, { contextRole: "CUSTOMER" }));
  fireEvent.click(screen.getByRole("button", { name: "How do I change my delivery address?" }));
  expect(await screen.findByText("Profile › Delivery addresses.")).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[0][1].body).messages).toEqual([{ role: "user", content: "How do I change my delivery address?" }]);
  expect(screen.queryByRole("button", { name: "How do I change my delivery address?" })).toBeNull();
});

it("keeps a failed message with Retry and explains rate limiting", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ code: "SUPPORT_CHAT_RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "12" } }))
    .mockResolvedValueOnce(Response.json({ reply: "Here now.", supportCase: null }));
  vi.stubGlobal("fetch", fetch);
  render(createElement(SupportChat, { contextRole: "CUSTOMER" }));
  type("Hello?");
  expect((await screen.findByRole("alert")).textContent).toContain("try again in 12 s");
  expect(screen.getByText(/Not sent/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Here now.")).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[1][1].body).messages).toEqual([{ role: "user", content: "Hello?" }]);
  expect(screen.getAllByText("Hello?")).toHaveLength(1);
});

it("links only Craves pages and contacts, and bolds quoted button names", () => {
  render(createElement("p", null, richText('Tap "Edit profile" at https://craves.in/profile. Mail support@craves.in, call 8367366787, not https://evil.example/x.')));
  const link = screen.getByRole("link", { name: "craves.in/profile" });
  expect(link.getAttribute("href")).toBe("https://craves.in/profile");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(screen.getByRole("link", { name: "support@craves.in" }).getAttribute("href")).toBe("mailto:support@craves.in");
  expect(screen.getByRole("link", { name: "8367366787" }).getAttribute("href")).toBe("tel:8367366787");
  expect(screen.queryByRole("link", { name: /evil/ })).toBeNull();
  expect(screen.getByText("Edit profile").className).toContain("font-semibold");
});

it("keeps only the newest 20 turns", () => {
  const turns = Array.from({ length: 25 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: String(index) }));
  const history = chatHistory(turns);
  expect(history).toHaveLength(20);
  expect(history.at(-1)?.content).toBe("24");
});
