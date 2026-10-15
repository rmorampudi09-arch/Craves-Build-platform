// @vitest-environment jsdom
// "Rate this order" on a delivered order. Synthetic ids; no network.
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OrderReviewCard } from "../components/OrderReviewCard";

// The sheet's history and motion are covered by its own tests: here it is a plain dialog.
vi.mock("@/shared/ui/overlays/overlay", () => ({
  secondaryActionClass: "",
  Sheet: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    open ? createElement("div", { role: "dialog", "aria-label": title }, children, footer) : null,
}));

const ORDER_ID = "0bde0000-0000-4000-8000-000000000010";
const saved = {
  reviewId: "0bde0000-0000-4000-8000-000000000070",
  orderId: ORDER_ID,
  kitchenId: "0bde0000-0000-4000-8000-000000000020",
  status: "PENDING_MODERATION",
  version: 1,
  overallRating: 4,
  foodTasteRating: null,
  portionValueRating: null,
  packagingRating: null,
  accuracyRating: null,
  chefPreparationRating: null,
  deliveryRating: null,
  reviewText: "Lovely",
  tagCodes: ["TASTY"],
  mediaAssetIds: [],
  submittedAt: "2026-10-10T08:00:00Z",
  updatedAt: "2026-10-10T08:00:00Z",
  publishedAt: null,
};
const tags = [
  { code: "TASTY", displayLabel: "Tasty", sortOrder: 1 },
  { code: "WELL_PACKED", displayLabel: "Well packed", sortOrder: 2 },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The review answers `review` (or each write in turn), the tag list answers `tags`. */
function serve(review: [unknown, number], writes: [unknown, number][] = []) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/reviews/tags") return json(tags);
    if (!init?.method) return json(...review);
    const next = writes.shift();
    return next ? json(...next) : json({ code: "ORDER_REVIEW_FAILED" }, 503);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const writeBody = (fetch: ReturnType<typeof serve>) => {
  const call = fetch.mock.calls.find(([, init]) => init?.method);
  return { method: call?.[1]?.method, body: JSON.parse(String(call?.[1]?.body)) };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("rate this order", () => {
  it("rates a delivered order with stars and tags, then shows the saved rating", async () => {
    const fetch = serve(
      [{ code: "ORDER_REVIEW_NOT_FOUND" }, 404],
      [[{ ...saved, overallRating: 5, tagCodes: ["WELL_PACKED"], reviewText: null }, 201]],
    );
    render(createElement(OrderReviewCard, { orderId: ORDER_ID }));
    expect(await screen.findByText("How was your order?")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Rate this order" }));
    const form = screen.getByRole("dialog", { name: "Rate your order" });
    const submit = within(form).getByRole("button", { name: "Submit review" });
    // A rating is required.
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(form).getByLabelText("5 out of 5"));
    fireEvent.click(await within(form).findByRole("button", { name: "Well packed" }));
    expect(
      within(form).getByRole("button", { name: "Well packed" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(submit);
    expect(await screen.findByRole("img", { name: "5 out of 5 stars" })).toBeTruthy();
    expect(screen.getByText(/Review submitted\. Your review is pending moderation/)).toBeTruthy();
    expect(screen.getByText("Submitted for review")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit your rating" })).toBeTruthy();
    expect(writeBody(fetch)).toEqual({
      method: "POST",
      body: expect.objectContaining({
        overallRating: 5,
        reviewText: null,
        tagCodes: ["WELL_PACKED"],
      }),
    });
  });

  it("edits the saved rating at its version", async () => {
    const fetch = serve([saved, 200], [[{ ...saved, version: 2, overallRating: 2 }, 200]]);
    render(createElement(OrderReviewCard, { orderId: ORDER_ID }));
    expect(await screen.findByRole("img", { name: "4 out of 5 stars" })).toBeTruthy();
    expect(screen.getByText("Lovely")).toBeTruthy();
    expect(await screen.findByText("Tasty")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit your rating" }));
    const form = screen.getByRole("dialog", { name: "Edit your rating" });
    expect((within(form).getByLabelText("4 out of 5") as HTMLInputElement).checked).toBe(true);
    expect((within(form).getByLabelText("Write a review") as HTMLTextAreaElement).value).toBe(
      "Lovely",
    );
    fireEvent.click(within(form).getByLabelText("2 out of 5"));
    fireEvent.click(within(form).getByRole("button", { name: "Update review" }));
    expect(await screen.findByRole("img", { name: "2 out of 5 stars" })).toBeTruthy();
    expect(writeBody(fetch)).toEqual({
      method: "PUT",
      body: expect.objectContaining({ expectedVersion: 1, overallRating: 2, tagCodes: ["TASTY"] }),
    });
  });

  it("asks for a refresh when the review changed elsewhere", async () => {
    const fetch = serve([saved, 200], [[{ code: "ORDER_REVIEW_VERSION_CONFLICT" }, 409]]);
    render(createElement(OrderReviewCard, { orderId: ORDER_ID }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit your rating" }));
    fireEvent.click(screen.getByLabelText("3 out of 5"));
    fireEvent.click(screen.getByRole("button", { name: "Update review" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Review changed");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(([url, init]) => url.endsWith("/review") && !init?.method),
      ).toHaveLength(2),
    );
  });

  it("keeps a review with photos read-only, like the app", async () => {
    serve([{ ...saved, mediaAssetIds: ["0bde0000-0000-4000-8000-000000000080"] }, 200]);
    render(createElement(OrderReviewCard, { orderId: ORDER_ID }));
    expect(
      ((await screen.findByRole("button", { name: "Edit your rating" })) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/includes photos/)).toBeTruthy();
  });

  it("says Coming soon when rating isn't live, and offers a retry when it didn't load", async () => {
    serve([{ code: "FEATURE_NOT_AVAILABLE" }, 404]);
    render(createElement(OrderReviewCard, { orderId: ORDER_ID }));
    expect(await screen.findByText("Coming soon")).toBeTruthy();
    cleanup();
    // Order-service's empty 403 reads as "something went wrong".
    serve([{ code: "ORDER_REVIEW_FAILED" }, 403]);
    render(createElement(OrderReviewCard, { orderId: ORDER_ID }));
    expect((await screen.findByRole("alert")).textContent).toContain("didn’t load");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
