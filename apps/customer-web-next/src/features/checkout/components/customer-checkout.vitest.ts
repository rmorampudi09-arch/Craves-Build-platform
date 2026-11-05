// @vitest-environment jsdom
// Synthetic cart and address; no real checkout is created.
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CustomerCheckoutForm } from "@/features/checkout/components/customer-checkout";

const cart = {
  id: "c1111111-1111-4111-8111-111111111111", currency: "INR", foodSubtotal: 200,
  items: [{ id: "a1111111-1111-4111-8111-111111111111", itemName: "Hyderabadi biryani", quantity: 1, lineTotal: 200, currency: "INR" }],
};
const address = { id: "44444444-4444-4444-8444-444444444444", addressLabel: "HOME", addressLine1: "Flat 302", areaName: "Banjara Hills", isDefault: true };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function createCheckoutAnswering(answer: Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/cart") return Response.json(cart);
    if (url === "/api/customer/addresses") return Response.json([address]);
    if (url === "/api/cart/validate") return Response.json({});
    return answer;
  }));
  render(createElement(CustomerCheckoutForm));
  const create = await screen.findByRole("button", { name: "Create checkout" });
  await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(create);
}

it("says new orders are paused, with a link to keep the account, when an account deletion is open", async () => {
  await createCheckoutAnswering(Response.json({ code: "ACCOUNT_DELETION_PENDING" }, { status: 409 }));

  expect(await screen.findByText(/Your account is set to be deleted, so new orders are paused\./)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Keep my account" }).getAttribute("href")).toBe("/account/delete");
});

it("shows any other checkout failure as before, without the keep-account link", async () => {
  await createCheckoutAnswering(Response.json({ error: "CART_CHANGED", message: "Your cart changed." }, { status: 409 }));

  expect(await screen.findByText("Your cart changed.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Keep my account" })).toBeNull();
});
