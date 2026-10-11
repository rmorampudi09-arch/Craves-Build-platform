// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChefReadinessPanel } from "@/features/chef/components/chef-readiness-panel";

const missing = {
  contractVersion: 1, applicationStatus: "PENDING", emailStatus: "VERIFIED", approvalReady: false,
  requiredDocumentCount: 4, uploadedDocumentCount: 0, approvedDocumentCount: 0,
  documents: ["APPLICANT_PHOTO", "GOVERNMENT_ID_FRONT", "GOVERNMENT_ID_BACK", "TAX_ID_CARD"].map(documentType => ({ documentType, status: "MISSING", rejectionReason: null })),
  blockingIssues: [], evaluatedAt: "2026-10-01T00:00:00Z", lastSavedAt: null,
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("loads current server evidence and refreshes after an upload event", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => missing });
  vi.stubGlobal("fetch", fetch);
  render(createElement(ChefReadinessPanel));
  expect(await screen.findByText("0 of 4 required documents approved.")).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  fireEvent(window, new Event("craves:chef-application-updated"));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("0 of 4 required documents approved.")).toBeTruthy();
});

it("replaces unavailable readiness with an explicit error and can retry", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, json: async () => missing });
  vi.stubGlobal("fetch", fetch);
  render(createElement(ChefReadinessPanel));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("list")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh readiness" }));
  expect(await screen.findByText("0 of 4 required documents approved.")).toBeTruthy();
});
