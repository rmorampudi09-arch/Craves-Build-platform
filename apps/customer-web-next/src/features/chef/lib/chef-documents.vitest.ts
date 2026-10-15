// @vitest-environment jsdom
// Synthetic application for a fixture chef; no backend is contacted.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetcher = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/session-fetch", () => ({ sessionFetch: fetcher }));
import { ChefDocuments } from "@/features/chef/components/chef-documents";

const PROOF = "00000000-0000-4000-8000-00000000d001";
const onboarding = {
  enabled: true,
  legacy: false,
  version: 3,
  resumeStep: "waiting",
  submitted: true,
  phoneNumber: "+919876543210",
  supportPhone: "+918367366787",
  supportEmail: "support@craves.in",
  requiredDocuments: [],
  application: {
    id: null,
    status: "PENDING",
    rejectionReason: null,
    submittedAt: null,
    reviewedAt: null,
    documents: [],
  },
  details: { proofKind: "PAN", fssaiNumber: "12345678901234", language: "en" },
  documents: [
    {
      id: PROOF,
      documentType: "SELECTED_PROOF_FRONT",
      originalFileName: "pan.jpg",
      fileSizeBytes: 2048,
      status: "REJECTED",
      reviewReason: "The photo is blurred",
      reviewedAt: null,
    },
  ],
};

function respond(routes: Record<string, () => Response>) {
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    if (!routes[key]) throw new Error(`Unexpected ${key}`);
    return routes[key]();
  });
}

beforeEach(() => {
  fetcher.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Documents & verification", () => {
  it("shows the banner and each document with its state, and opens a document in a new tab", async () => {
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.stubGlobal(
      "open",
      vi.fn(() => tab),
    );
    respond({
      "GET /api/chef/onboarding": () => Response.json(onboarding),
      [`GET /api/chef/onboarding/documents/${PROOF}/preview`]: () =>
        Response.json({ url: "https://files.craves.in/pan.jpg?sig=1" }),
    });
    render(createElement(ChefDocuments));
    expect(await screen.findByText("Craves is checking your documents")).toBeTruthy();
    expect(screen.getByText("FSSAI registration").closest("li")!.textContent).toContain(
      "1234 5678 9012 34",
    );
    const proof = screen.getByRole("button", {
      name: "PAN card · front, Needs update. Open the file",
    });
    expect(proof.textContent).toContain("The photo is blurred");
    fireEvent.click(proof);
    await waitFor(() => expect(tab.location.href).toBe("https://files.craves.in/pan.jpg?sig=1"));
    expect(tab.opener).toBeNull();
    expect(
      screen.getByRole("link", { name: "Ask to update a document" }).getAttribute("href"),
    ).toBe("/chef/support/new?topic=Update%20a%20document");
  });

  it("never opens a link that is not https", async () => {
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.stubGlobal(
      "open",
      vi.fn(() => tab),
    );
    respond({
      "GET /api/chef/onboarding": () => Response.json(onboarding),
      [`GET /api/chef/onboarding/documents/${PROOF}/preview`]: () =>
        Response.json({ url: "javascript:alert(1)" }),
    });
    render(createElement(ChefDocuments));
    fireEvent.click(await screen.findByRole("button", { name: /PAN card · front/ }));
    expect(await screen.findByText("We couldn't open that file. Please try again.")).toBeTruthy();
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe("");
  });

  it("uploads another document and reads the status again", async () => {
    respond({
      "GET /api/chef/onboarding": () => Response.json(onboarding),
      "POST /api/chef/application/proof-files": () => Response.json({ id: PROOF }),
    });
    render(createElement(ChefDocuments));
    fireEvent.click(await screen.findByText("Upload another document"));
    const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
    const picker = vi.spyOn(input, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByText("Kitchen photo"));
    expect(picker).toHaveBeenCalled();
    expect(input.accept).toBe("image/jpeg,image/png");
    fireEvent.change(input, {
      target: { files: [new File(["photo"], "kitchen.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("Document uploaded. Craves will check it.")).toBeTruthy();
    const upload = fetcher.mock.calls.find(([url]) => url === "/api/chef/application/proof-files")!;
    expect((upload[1].body as FormData).get("documentType")).toBe("KITCHEN_PHOTO_1");
    await waitFor(() =>
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/chef/onboarding")).toHaveLength(2),
    );
  });

  it("refuses a PDF kitchen photo before sending, and shows the service's words for a refused upload", async () => {
    respond({
      "GET /api/chef/onboarding": () => Response.json(onboarding),
      "POST /api/chef/application/proof-files": () =>
        Response.json(
          {
            code: "CHEF_DOCUMENT_ALREADY_APPROVED",
            message: "This document is already approved and cannot be replaced.",
          },
          { status: 409 },
        ),
    });
    render(createElement(ChefDocuments));
    fireEvent.click(await screen.findByText("Upload another document"));
    const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
    vi.spyOn(input, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByText("Cooking setup photo"));
    fireEvent.change(input, {
      target: { files: [new File(["%PDF"], "kitchen.pdf", { type: "application/pdf" })] },
    });
    expect((await screen.findByRole("alert")).textContent).toBe("Choose a JPG or PNG photo.");
    fireEvent.click(screen.getByText("PAN card · back"));
    fireEvent.change(input, {
      target: { files: [new File(["%PDF"], "pan.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "This document is already approved and cannot be replaced.",
      ),
    );
  });

  it("tells a chef with no application on file to contact support", async () => {
    respond({
      "GET /api/chef/onboarding": () => Response.json({ code: "NOT_FOUND" }, { status: 404 }),
    });
    render(createElement(ChefDocuments));
    expect(await screen.findByText(/Your documents were checked when you joined/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe(
      "/chef/support/new?topic=Update%20a%20document",
    );
  });

  it("offers a refresh when the documents did not load", async () => {
    let calls = 0;
    respond({
      "GET /api/chef/onboarding": () =>
        ++calls === 1 ? Response.json({}, { status: 503 }) : Response.json(onboarding),
    });
    render(createElement(ChefDocuments));
    expect(await screen.findByText(/Your documents didn’t load/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh document status" }));
    expect(await screen.findByText("Craves is checking your documents")).toBeTruthy();
  });
});
