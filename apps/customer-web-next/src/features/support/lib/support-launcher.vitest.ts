// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));
const auth = vi.hoisted(() => ({ user: null as null | { status: string; roles: string[] }, listeners: new Set<() => void>() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  getSession: () => auth.user,
  loadSession: vi.fn(async () => { if (!auth.user) throw new Error("AUTHENTICATION_REQUIRED"); return auth.user; }),
  subscribeSession: (listener: () => void) => { auth.listeners.add(listener); return () => auth.listeners.delete(listener); },
}));
import { SupportLauncher, supportRole } from "@/features/support/components/SupportLauncher";

beforeEach(() => { nav.pathname = "/"; auth.user = null; auth.listeners.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows a floating Ask Craves button on the landing page and opens the visitor chat", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ reply: "Choose Home Chef, then Send verification code.", supportCase: null }));
  vi.stubGlobal("fetch", fetch);
  render(createElement(SupportLauncher));
  const button = screen.getByRole("button", { name: "Questions? Ask Craves assistant" });
  expect(button.getAttribute("aria-expanded")).toBe("false");
  await act(async () => { fireEvent.click(button); });
  expect(screen.getByRole("dialog", { name: "Craves assistant" })).toBeTruthy();
  expect(screen.getByText(/I can help you sign in or sign up/)).toBeTruthy();
  expect(document.activeElement?.id).toBe("support-chat-input");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "How do I sign up as a home chef?" })); });
  expect(await screen.findByText("Choose Home Chef, then Send verification code.")).toBeTruthy();
  expect(fetch.mock.calls[0][0]).toBe("/api/support/chat/guest");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ messages: [{ role: "user", content: "How do I sign up as a home chef?" }] });
});

it("closes with Escape and keeps the conversation for next time", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ reply: "Hello there.", supportCase: null })));
  render(createElement(SupportLauncher));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Questions? Ask Craves assistant" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "I didn't get my OTP" })); });
  expect(await screen.findByText("Hello there.")).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Questions? Ask Craves assistant" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Questions? Ask Craves assistant" })); });
  expect(screen.getByText("Hello there.")).toBeTruthy();
});

it("signed-in customers get their own assistant", async () => {
  auth.user = { status: "ACTIVE", roles: ["customer"] };
  const fetch = vi.fn().mockResolvedValue(Response.json({ reply: "It is on the way.", supportCase: null }));
  vi.stubGlobal("fetch", fetch);
  render(createElement(SupportLauncher));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Questions? Ask Craves assistant" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Where is my order?" })); });
  expect(await screen.findByText("It is on the way.")).toBeTruthy();
  expect(fetch.mock.calls[0][0]).toBe("/api/support/chat");
  expect(JSON.parse(fetch.mock.calls[0][1].body).contextRole).toBe("CUSTOMER");
});

it.each(["/support", "/chef/support", "/admin", "/admin/support/abc"])("stays off %s, which already has the chat or is admin", path => {
  nav.pathname = path;
  render(createElement(SupportLauncher));
  expect(screen.queryByRole("button", { name: "Questions? Ask Craves assistant" })).toBeNull();
});

it("picks the chat role from who is signed in and where", () => {
  expect(supportRole(null, "/")).toBe("GUEST");
  expect(supportRole({ status: "SUSPENDED", roles: ["CUSTOMER"] } as never, "/home")).toBe("GUEST");
  expect(supportRole({ status: "ACTIVE", roles: ["CUSTOMER", "CHEF"] } as never, "/home")).toBe("CUSTOMER");
  expect(supportRole({ status: "ACTIVE", roles: ["CUSTOMER", "CHEF"] } as never, "/chef/orders")).toBe("CHEF");
  expect(supportRole({ status: "ACTIVE", roles: ["CHEF"] } as never, "/home")).toBe("CHEF");
  expect(supportRole({ status: "ACTIVE", roles: [] } as never, "/home")).toBe("GUEST");
});
