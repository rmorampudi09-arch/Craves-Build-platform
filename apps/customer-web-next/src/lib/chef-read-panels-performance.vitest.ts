// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChefOperationsWorkspace } from "@/components/chef-operations-workspace";
import ChefProfilePage from "@/app/chef/profile/page";
import { CHEF_PANEL_TIMEOUT_MS } from "@/hooks/use-chef-read-panels";
import {
  captureSessionContext,
  invalidateSession,
  setSessionIdentity,
} from "@/services/auth/cravesAuth";
import type { CravesIdentity } from "@/lib/auth-contract";

vi.mock("@/components/chef-access-boundary", () => ({
  ChefAccessBoundary: ({ children }: { children: unknown }) => children,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/chef/profile" }));
const a: CravesIdentity = {
  id: "11111111-1111-4111-8111-111111111111",
  phoneNumber: "+10000000000",
  displayName: "Fixture A",
  email: "a@example.invalid",
  emailVerified: true,
  status: "ACTIVE",
  roles: ["CHEF"],
};
const b: CravesIdentity = {
  ...a,
  id: "22222222-2222-4222-8222-222222222222",
  displayName: "Fixture B",
};
const application = { status: "APPROVED", firstName: "Private A", lastName: "Fixture" };
const kitchen = {
  id: a.id,
  kitchenName: "Private kitchen A",
  addressLine1: "Fixture address",
  city: "Fixture city",
  state: "Fixture state",
  status: "ACTIVE",
  latitude: 17,
  longitude: 78,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const menu = [
  {
    id: a.id,
    itemName: "Fixture meal",
    category: "Lunch",
    foodType: "VEG",
    price: 100,
    currency: "INR",
    unitPackageWeightGrams: 500,
    thermoboxRequired: false,
    available: true,
    status: "ACTIVE",
    images: [],
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  },
];
const readiness = {
  contractVersion: 1,
  applicationStatus: "APPROVED",
  emailStatus: "VERIFIED",
  approvalReady: false,
  requiredDocumentCount: 4,
  uploadedDocumentCount: 4,
  approvedDocumentCount: 4,
  documents: ["APPLICANT_PHOTO", "GOVERNMENT_ID_FRONT", "GOVERNMENT_ID_BACK", "TAX_ID_CARD"].map(
    (documentType) => ({ documentType, status: "APPROVED", rejectionReason: null }),
  ),
  blockingIssues: [],
  evaluatedAt: "2026-10-01T00:00:00Z",
  lastSavedAt: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function normal(input: RequestInfo | URL): Promise<Response> {
  const path = String(input);
  const raw = path.endsWith("/readiness")
    ? readiness
    : path.endsWith("/application")
      ? application
      : path.endsWith("/kitchen")
        ? kitchen
        : menu;
  return Promise.resolve(Response.json(raw));
}
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  setSessionIdentity(a);
  fetcher = vi.fn<typeof fetch>(normal);
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("renders healthy operations independently while readiness is slow, then uses the existing discovery rule", async () => {
  const slow = deferred<Response>();
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/readiness") ? slow.promise : normal(input),
  );
  render(createElement(ChefOperationsWorkspace));
  expect(await screen.findByText("1 available")).toBeTruthy();
  expect(screen.getByText("APPROVED")).toBeTruthy();
  expect(screen.getByText("Checking operational states")).toBeTruthy();
  expect(screen.queryByText("Kitchen is operationally discoverable")).toBeNull();
  await act(async () => slow.resolve(Response.json(readiness)));
  expect(await screen.findByText("Kitchen is operationally discoverable")).toBeTruthy();
  expect(screen.getByText("4/4 approved")).toBeTruthy();
});

it("keeps healthy panels after a menu error without inventing zero availability, and retries fresh state", async () => {
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/menu")
      ? Promise.resolve(Response.json({}, { status: 503 }))
      : normal(input),
  );
  render(createElement(ChefOperationsWorkspace));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("0 available")).toBeNull();
  expect(screen.getByText("MAPPED")).toBeTruthy();
  expect(screen.queryByText("Kitchen is operationally discoverable")).toBeNull();
  fetcher.mockImplementation(normal);
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("Kitchen is operationally discoverable")).toBeTruthy();
});

it("bounds a hanging request, aborts it and keeps useful sections available", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation((input, init) => {
    if (String(input).endsWith("/readiness")) {
      signal = init?.signal as AbortSignal;
      return new Promise(() => {});
    }
    return normal(input);
  });
  render(createElement(ChefOperationsWorkspace));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CHEF_PANEL_TIMEOUT_MS);
  });
  expect(screen.getByRole("alert").textContent).toContain("took too long");
  expect(signal?.aborted).toBe(true);
  expect(screen.getByText("1 available")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

it("shows application details before a slow kitchen and clears private content synchronously on logout", async () => {
  const slow = deferred<Response>();
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/kitchen") ? slow.promise : normal(input),
  );
  render(createElement(ChefProfilePage));
  expect(await screen.findByRole("heading", { name: "Private A Fixture" })).toBeTruthy();
  expect(screen.getAllByText("Loading kitchen details…").length).toBeGreaterThan(0);
  act(() => {
    invalidateSession(captureSessionContext());
  });
  expect(screen.queryByRole("heading", { name: "Private A Fixture" })).toBeNull();
  await act(async () => slow.resolve(Response.json(kitchen)));
  expect(screen.queryByText("Private kitchen A")).toBeNull();
});

it("ignores an old owner's late response and hides private state on same-owner chef role revocation", async () => {
  const slow = deferred<Response>();
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/kitchen") ? slow.promise : normal(input),
  );
  render(createElement(ChefProfilePage));
  await screen.findByRole("heading", { name: "Private A Fixture" });
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/application")
      ? Promise.resolve(Response.json({ ...application, firstName: "Private B" }))
      : String(input).endsWith("/kitchen")
        ? Promise.resolve(Response.json({ ...kitchen, kitchenName: "Private kitchen B" }))
        : normal(input),
  );
  act(() => setSessionIdentity(b));
  expect(screen.queryByRole("heading", { name: "Private A Fixture" })).toBeNull();
  await screen.findByRole("heading", { name: "Private B Fixture" });
  await act(async () => slow.resolve(Response.json(kitchen)));
  expect(screen.queryByText("Private kitchen A")).toBeNull();
  act(() => setSessionIdentity({ ...b, roles: ["CUSTOMER"] }));
  expect(screen.queryByRole("heading", { name: "Private B Fixture" })).toBeNull();
  expect(screen.queryByText(/Private kitchen B/)).toBeNull();
});

it("reports invalid profile data honestly and recovers with fresh data on retry", async () => {
  fetcher.mockImplementation((input) =>
    String(input).endsWith("/application")
      ? Promise.resolve(Response.json({ status: "INVALID" }))
      : normal(input),
  );
  render(createElement(ChefProfilePage));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Chef details unavailable" })).toBeTruthy();
  expect(screen.queryByText("Application approved")).toBeNull();
  fetcher.mockImplementation(normal);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Private A Fixture" })).toBeTruthy(),
  );
});
