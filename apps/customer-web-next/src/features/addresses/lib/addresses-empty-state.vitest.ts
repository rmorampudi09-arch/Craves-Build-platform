// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AddressesPage from "@/features/addresses/screens/Addresses";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => createElement("a", { href: to, ...props }, children),
}));
vi.mock("@/features/addresses/components/AddressEditorFlow", () => ({ AddressEditorFlow: () => null }));
vi.mock("@/features/auth/api/cravesAuth", () => ({
  loadSession: async () => ({ firstName: "Fixture", lastName: "Customer", phoneNumber: "+910000000000" }),
  invalidateSelectedAddress: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("says there are no saved addresses once, not twice", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
  render(createElement(AddressesPage));
  expect(await screen.findByRole("heading", { name: "No saved addresses" })).toBeTruthy();
  expect(screen.queryByText(/No addresses saved yet/)).toBeNull();
  expect(screen.getAllByRole("status").every((region) => !/no .*address/i.test(region.textContent ?? ""))).toBe(true);
});
