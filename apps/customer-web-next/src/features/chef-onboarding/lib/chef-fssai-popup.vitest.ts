// @vitest-environment jsdom
// The FSSAI screen an approved chef sees when a dish is about to go live. Fixture responses only.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { ChefFssaiPopup } from "@/features/chef-onboarding/components/chef-fssai-popup";
import { EMPTY_ONBOARDING } from "./chef-onboarding-v2-contract";
import { fssaiNeededToGoLive, requireFssaiToGoLive } from "./fssai-go-live";

const id = "12345678-1234-4123-8123-123456789012";
const approved = () => ({
  enabled: true,
  legacy: false,
  version: 4,
  resumeStep: "waiting",
  submitted: true,
  phoneNumber: "+910000000000",
  details: { ...EMPTY_ONBOARDING, firstName: "Test", lastName: "Chef", kitchenName: "Saved kitchen", proofKind: "PAN" as const },
  application: { id, status: "APPROVED", documents: [] },
  documents: [],
  requiredDocuments: [],
  supportPhone: "+910000000000",
  supportEmail: "support@example.invalid",
});
let state: ReturnType<typeof approved> & { callbackRequest?: unknown; progress?: unknown };
let content: unknown[];
const onClose = vi.fn();
const calls = (method: string, path = "/api/chef/onboarding") =>
  vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url) === path && (init?.method ?? "GET") === method);

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
beforeEach(() => {
  state = approved();
  content = [];
  onClose.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/content")) return Response.json(content);
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        state = { ...state, version: state.version + 1, details: body.details };
      }
      return Response.json(state);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const open = () => render(createElement(ChefFssaiPopup, { open: true, onClose }));
const progress = (fssaiVerified: boolean) => ({ status: "APPROVED", reason: null, nextAction: "VIEW_STATUS", fssaiVerified, termsVersion: "v1" });

it("asks only for the number, says why, saves it, and then tells the chef to wait for Craves", async () => {
  open();
  const input = (await screen.findByLabelText("FSSAI registration number")) as HTMLInputElement;
  expect(screen.getByRole("heading", { name: "Add your FSSAI number" })).toBeTruthy();
  expect(screen.getByText(/once Craves has verified your FSSAI number/)).toBeTruthy();
  expect(screen.getByText(/government requires it for every food business/)).toBeTruthy();
  expect(screen.queryByLabelText(/certificate|licence document|selfie/i)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save number" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Enter your 14-digit FSSAI registration number.");
  expect(calls("PATCH")).toHaveLength(0);
  fireEvent.change(input, { target: { value: "1234-5678-9012-34xx" } });
  fireEvent.click(screen.getByRole("button", { name: "Save number" }));
  expect(await screen.findByText(/We are verifying your FSSAI number/)).toBeTruthy();
  expect(JSON.parse(String(calls("PATCH")[0]![1]!.body))).toMatchObject({
    expectedVersion: 4,
    details: { fssaiNumber: "12345678901234", kitchenName: "Saved kitchen", proofKind: "PAN" },
  });
  // Nothing more to save: the button closes the popup. Correcting the number brings Save back.
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "12345678901235" } });
  expect(screen.getByRole("button", { name: "Save number" })).toBeTruthy();
  expect(screen.queryByText(/We are verifying/)).toBeNull();
});

it("shows a saved number as waiting for Craves, or as verified", async () => {
  state.details.fssaiNumber = "12345678901234";
  state.progress = progress(false);
  const first = open();
  expect(await screen.findByText(/We are verifying your FSSAI number/)).toBeTruthy();
  expect(calls("PATCH")).toHaveLength(0);
  first.unmount();
  state.progress = progress(true);
  open();
  expect(await screen.findByText(/Craves has verified your FSSAI number/)).toBeTruthy();
});

it("keeps the typed number when the save fails and confirms only after a retry works", async () => {
  open();
  fireEvent.change(await screen.findByLabelText("FSSAI registration number"), { target: { value: "12345678901234" } });
  const normal = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) =>
    init?.method === "PATCH" ? Response.json({ message: "Save is temporarily unavailable." }, { status: 503 }) : normal(url, init),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save number" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Save is temporarily unavailable.");
  expect(screen.queryByText(/We are verifying/)).toBeNull();
  expect((screen.getByLabelText("FSSAI registration number") as HTMLInputElement).value).toBe("12345678901234");
  vi.mocked(fetch).mockImplementation(normal);
  fireEvent.click(screen.getByRole("button", { name: "Save number" }));
  expect(await screen.findByText(/We are verifying your FSSAI number/)).toBeTruthy();
});

it("guides a chef without FSSAI: steps, videos in their language, and an earlier callback request", async () => {
  state.callbackRequest = { caseNumber: "SUP-2041", status: "OPEN", requestedAt: "2026-10-09T05:00:00Z" };
  content = [{
    id: "22222222-2222-4222-8222-222222222222", language: "en", title: "Apply for FSSAI", kind: "ARTICLE",
    body: "Synthetic English guide", published: true, ready: true, version: 1, contentType: null, fileSizeBytes: null,
    createdAt: "2026-10-09T00:00:00Z",
  }];
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Don’t have FSSAI?" }));
  await screen.findByRole("heading", { name: "How to apply for FSSAI" });
  expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
  expect(await screen.findByText("Apply for FSSAI")).toBeTruthy();
  expect(screen.getByText("Request received")).toBeTruthy();
  expect(screen.getByText(/SUP-2041/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Request a call from Craves" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save number" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Video language/ }));
  fireEvent.click(await screen.findByRole("button", { name: /తెలుగు/ }));
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("language=te"))).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "I have an FSSAI number" }));
  expect(await screen.findByRole("button", { name: "Save number" })).toBeTruthy();
});

it("confirms a callback only after a real case response and reuses the request key on retry", async () => {
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Don’t have FSSAI?" }));
  const normal = vi.mocked(fetch).getMockImplementation()!;
  let attempts = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith("/help"))
      return ++attempts === 1 ? Response.json({}, { status: 503 }) : Response.json({ id, caseNumber: "FIXTURE-123" });
    return normal(url, init);
  });
  fireEvent.click(await screen.findByRole("button", { name: "Request a call from Craves" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("Request received")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Request a call from Craves" }));
  await screen.findByText("Request received");
  const requests = calls("POST", "/api/chef/onboarding/help");
  expect(requests).toHaveLength(2);
  expect(JSON.parse(String(requests[0]![1]!.body)).requestKey).toBe(JSON.parse(String(requests[1]![1]!.body)).requestKey);
});

// The web server's check before a dish is saved as live.
const request = () =>
  new NextRequest("https://craves.test/api/chef/menu", { method: "POST", headers: { cookie: "craves_access_token=token" } });
it("needs a Craves-verified FSSAI number, only from chefs who joined through the current application", () => {
  const base = approved();
  const withNumber = { ...base, details: { ...base.details, fssaiNumber: "12345678901234" } };
  expect(fssaiNeededToGoLive(base)).toBe(true);
  expect(fssaiNeededToGoLive(withNumber)).toBe(true); // saved, not verified yet
  expect(fssaiNeededToGoLive({ ...withNumber, progress: progress(false) })).toBe(true);
  expect(fssaiNeededToGoLive({ ...withNumber, progress: progress(true) })).toBe(false);
  expect(fssaiNeededToGoLive({ ...base, progress: progress(true) })).toBe(true); // no number
  // Joined under the older process, which collected the licence itself.
  expect(fssaiNeededToGoLive({ ...base, submitted: false, details: null })).toBe(false);
  expect(fssaiNeededToGoLive({ ...base, enabled: false })).toBe(false);
});
it("refuses to put a dish live until FSSAI is verified, and when FSSAI cannot be checked", async () => {
  vi.stubEnv("CRAVES_API_BASE_URL", "https://api.craves.test");
  expect((await requireFssaiToGoLive(request()))?.status).toBe(409);
  state.details.fssaiNumber = "12345678901234";
  expect(await (await requireFssaiToGoLive(request()))?.json()).toMatchObject({ code: "FSSAI_REQUIRED" });
  state.progress = progress(true);
  expect(await requireFssaiToGoLive(request())).toBeNull();
  vi.mocked(fetch).mockImplementation(async () => Response.json({ code: "DOWN" }, { status: 500 }));
  expect((await requireFssaiToGoLive(request()))?.status).toBe(503);
  vi.mocked(fetch).mockImplementation(async () => Response.json({}, { status: 401 }));
  expect((await requireFssaiToGoLive(request()))?.status).toBe(401);
  expect((await requireFssaiToGoLive(new NextRequest("https://craves.test/api/chef/menu", { method: "POST" })))?.status).toBe(401);
  vi.unstubAllEnvs();
});
