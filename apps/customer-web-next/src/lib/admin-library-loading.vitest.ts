// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminLayout from "../app/admin/layout";
import type { SessionState } from "./admin-renewal";

const fixture = vi.hoisted(() => ({
  pathname: "/admin", loadIdentity: vi.fn(),
  observer: null as ((state: SessionState) => void) | null,
}));
// Loading the active layout must never evaluate optional chart/grid code.
vi.mock("@syncfusion/ej2-base", () => { throw new Error("Unused Syncfusion base was imported"); });
vi.mock("@syncfusion/ej2-react-charts", () => { throw new Error("Unused Syncfusion charts were imported"); });
vi.mock("@syncfusion/ej2-react-grids", () => { throw new Error("Unused Syncfusion grids were imported"); });
vi.mock("next/navigation", () => ({ usePathname: () => fixture.pathname }));
vi.mock("./admin-session", () => ({ loadAdminIdentity: fixture.loadIdentity }));
vi.mock("./admin-renewal", () => ({
  observeAdminSession: (accept: (state: SessionState) => void) => {
    fixture.observer = accept; accept("ready");
    return () => { fixture.observer = null; };
  },
  logoutAdminSession: vi.fn(async () => {}),
}));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  fixture.pathname = "/admin";
  fixture.loadIdentity.mockReset().mockResolvedValue({
    displayName: "Verified administrator", email: "admin@example.invalid", status: "ACTIVE", adminEnabled: true,
  });
});
afterEach(cleanup);

it("renders verified administration and its navigation without importing optional chart libraries", async () => {
  render(createElement(AdminLayout, null, createElement("h1", null, "Protected module content")));
  expect(await screen.findByRole("heading", { name: "Protected module content" })).toBeTruthy();
  expect(screen.getAllByText("Verified administrator").length).toBeGreaterThan(0);
  const menu = screen.getByRole("navigation", { name: "Administration modules" });
  expect(menu.querySelector('a[href="/admin/analytics"]')).toBeTruthy();
  expect(menu.querySelector('a[href="/admin/finance"]')).toBeTruthy();
  act(() => fixture.observer?.("ended"));
  expect(screen.queryByRole("heading", { name: "Protected module content" })).toBeNull();
  expect(screen.getByText("Your administrator session has ended. Please sign in again.")).toBeTruthy();
});

it("retains the distinct Academy workspace and the same private authorization gate", async () => {
  fixture.pathname = "/admin/academy";
  render(createElement(AdminLayout, null, createElement("h2", null, "Protected learning content")));
  expect(await screen.findByRole("heading", { name: "Protected learning content" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Craves Academy" })).toBeTruthy();
  act(() => fixture.observer?.("ended"));
  expect(screen.queryByRole("heading", { name: "Protected learning content" })).toBeNull();
  expect(screen.getByText("Your administrator session has ended. Please sign in again.")).toBeTruthy();
});
