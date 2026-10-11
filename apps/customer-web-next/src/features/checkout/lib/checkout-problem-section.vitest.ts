import { describe, expect, it } from "vitest";
import { checkoutProblem } from "@/features/checkout/screens/Checkout";

describe("checkout problems show in the section that fixes them", () => {
  it.each([
    ["Delivery address is outside the Craves service area.", "address"],
    ["Select a saved delivery address before checkout.", "address"],
    ["Delivery address coordinates are required.", "address"],
    ["Order is below the minimum order value.", "cart"],
    ["The cart has changed since it was validated.", "cart"],
    ["Failed to fetch", undefined],
    ["Checkout launch policy is not configured correctly", undefined],
  ])("%s", (message, section) => {
    expect(checkoutProblem(new Error(message)).section).toBe(section);
  });

  it("never shows engineer text", () => {
    expect(checkoutProblem(new Error("NullPointerException in CheckoutService")).message)
      .toBe("We couldn’t prepare checkout right now. Your cart is safe — please try again.");
  });
});
