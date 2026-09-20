// @vitest-environment jsdom
// Synthetic applications and mocked requests only; no live identity documents.
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChefApplicationDocumentPanel } from "../components/chef-application-document-panel";
import { ChefApplicationEvidenceUploader } from "../components/chef-application-evidence-uploader";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const id = "11111111-1111-4111-8111-111111111111";
const approved = { id, status: "APPROVED", documents: [] };
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("chef document readiness", () => {
  it("shows a loading check, not a fabricated empty history", () => {
    fetcher.mockImplementation(() => new Promise(() => {}));
    render(createElement(ChefApplicationDocumentPanel));
    expect(screen.getByText("Checking your document history…")).toBeTruthy();
    expect(screen.queryByText(/0\/4/)).toBeNull();
    expect(screen.queryByText(/still need to be uploaded/)).toBeNull();
  });
  it("keeps failed evidence reads separate from zero documents and retries", async () => {
    fetcher.mockResolvedValueOnce(Response.json(approved)).mockResolvedValueOnce(Response.json({}, { status: 503 }));
    render(createElement(ChefApplicationDocumentPanel));
    await screen.findByRole("alert");
    expect(screen.queryByText(/0\/4/)).toBeNull();
    fetcher.mockResolvedValueOnce(Response.json(approved)).mockResolvedValueOnce(Response.json([]));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText(/current document history is incomplete/);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("does not ask an approved chef to use disabled upload controls", async () => {
    fetcher.mockResolvedValueOnce(Response.json(approved)).mockResolvedValueOnce(Response.json([]));
    const { container } = render(createElement(ChefApplicationDocumentPanel));
    await screen.findByText(/current document history is incomplete/);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/still need to be uploaded/)).toBeNull();
    expect(screen.getByText(/Missing history has not been marked as verified/)).toBeTruthy();
  });
  it("shows expired-session guidance, without upload controls", async () => {
    fetcher.mockResolvedValue(Response.json({}, { status: 401 }));
    render(createElement(ChefApplicationDocumentPanel));
    expect((await screen.findByRole("alert")).textContent).toContain("sign in again");
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull();
  });
  it("does not expose untrusted transport errors as customer copy", async () => {
    fetcher.mockRejectedValue(new Error("private backend diagnostics"));
    render(createElement(ChefApplicationDocumentPanel));
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn’t load your documents. Please try again.");
  });
  it("rejects malformed evidence instead of displaying zero uploaded", async () => {
    fetcher.mockResolvedValueOnce(Response.json(approved)).mockResolvedValueOnce(Response.json({ data: [] }));
    render(createElement(ChefApplicationDocumentPanel));
    expect((await screen.findByRole("alert")).textContent).toContain("confirm your document history");
    expect(screen.queryByText(/0\/4/)).toBeNull();
  });
  it("refreshes after application submission without endless polling", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ id: null, status: "NOT_SUBMITTED", documents: [] }));
    render(createElement(ChefApplicationDocumentPanel));
    await screen.findByText("Submit your Chef details first.");
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce(Response.json({ ...approved, status: "PENDING" })).mockResolvedValueOnce(Response.json([]));
    act(() => window.dispatchEvent(new Event("craves:chef-application-updated")));
    await screen.findByText(/4 required documents still need to be uploaded/);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(screen.queryByText("Submit your Chef details first.")).toBeNull();
  });
  it("aborts on unmount and removes the update listener", () => {
    fetcher.mockImplementation(() => new Promise(() => {}));
    const view = render(createElement(ChefApplicationDocumentPanel));
    const signal = fetcher.mock.calls[0][1]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
    act(() => window.dispatchEvent(new Event("craves:chef-application-updated")));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects an unsupported file before any upload request", () => {
    const xhr = vi.fn();
    vi.stubGlobal("XMLHttpRequest", xhr);
    const view = render(createElement(ChefApplicationEvidenceUploader, { applicationReady: true, locked: false, initialDocuments: [] }));
    const input = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["synthetic"], "not-a-photo.txt", { type: "text/plain" })] } });
    fireEvent.click(screen.getAllByRole("button", { name: "Upload" })[0]);
    expect(screen.getByText(/Choose a supported file up to 10 MB/)).toBeTruthy();
    expect(xhr).not.toHaveBeenCalled();
  });
});
