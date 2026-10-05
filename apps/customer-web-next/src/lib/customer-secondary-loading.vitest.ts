// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AddressesPage from "../screens/Profile/Addresses";
import { AddressEditorFlow } from "../components/profile/AddressEditorFlow";
import { RazorpayPayment } from "../components/checkout/RazorpayPayment";
import { CheckoutPaymentButton } from "../components/checkout/CheckoutPaymentButton";
import { setSessionIdentity } from "../services/auth/cravesAuth";
import { parseCheckout } from "./checkout-contract";
import type { CustomerAddress } from "./address-contract";
import type { CravesIdentity } from "./auth-contract";

const fixture = vi.hoisted(() => ({ loadEditor: vi.fn(), request: vi.fn(), navigate: vi.fn() }));
vi.mock("../components/profile/address-editor-loader", () => ({ loadAddressEditor: fixture.loadEditor }));
vi.mock("../services/auth/sessionFetch", () => ({ sessionFetch: fixture.request }));
vi.mock("../components/location/AddressMapPicker", () => ({ AddressMapPicker: () => null }));
vi.mock("../services/api/cravesCart", () => ({ ensureCheckoutCart: vi.fn(async () => true), clearCartAfterCheckoutPayment: vi.fn(), clearCartForCheckout: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: fixture.navigate, push: fixture.navigate }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => fixture.navigate, Link: ({ children }: { children: unknown }) => children }));

const owner: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+919876543210", displayName: "Verified customer", email: "customer@example.invalid", emailVerified: true, status: "ACTIVE", roles: ["CUSTOMER"] };
const address: CustomerAddress = { id: "22222222-2222-4222-8222-222222222222", addressLabel: "HOME", recipientName: "Fixture customer", contactPhoneNumber: owner.phoneNumber, addressLine1: "Original house", addressLine2: null, landmark: "Fixture landmark", areaName: "Fixture area", districtName: "Fixture district", city: "Hyderabad", state: "Telangana", postalCode: "500072", latitude: 17.4, longitude: 78.4, isDefault: true, active: true, createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" };
const checkoutId = "33333333-3333-4333-8333-333333333333";
function checkout(status = "PAYMENT_PENDING") {
  return { id: checkoutId, status, currency: "INR", foodSubtotal: 234, platformFee: 0, taxAmount: 0, deliveryFee: 0, grandTotal: 234, chargePolicyId: "44444444-4444-4444-8444-444444444444", deliveryAddressId: address.id, orders: [], createdAt: address.createdAt };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  setSessionIdentity(owner);
  fixture.loadEditor.mockReset().mockResolvedValue(AddressEditorFlow);
  fixture.request.mockReset().mockImplementation(async (input: string) => {
    if (input === "/api/customer/profile") return new Promise<Response>(() => {});
    if (input === `/api/customer/addresses/${address.id}`) return Response.json(address);
    if (input === "/api/payments/orders") return Response.json({ paymentOrderId: "66666666-6666-4666-8666-666666666666", checkoutId, provider: "RAZORPAY", providerOrderId: "order_fixture", checkoutKeyId: "rzp_fixture", amount: 234, amountPaise: 23400, currency: "INR", status: "PAYMENT_PENDING", createdAt: address.createdAt });
    throw new Error(`Unexpected authenticated fixture request ${input}`);
  });
  fixture.navigate.mockReset();
  fetcher = vi.fn<typeof fetch>(async input => {
    const url = String(input);
    if (url === "/api/auth/me") return Response.json(owner);
    if (url === "/api/customer/profile") return new Promise<Response>(() => {});
    if (url === "/api/customer/addresses") return Response.json([address]);
    if (url === `/api/checkout/${checkoutId}`) return Response.json(checkout("PAID"));
    throw new Error(`Unexpected fixture request ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({ media, matches: true, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("deferred address form", () => {
  it("keeps a closed form unloaded, supports closing a pending download and resets the real editor when reopened", async () => {
    const pending = deferred<typeof AddressEditorFlow>();
    fixture.loadEditor.mockReturnValueOnce(pending.promise);
    render(createElement(AddressesPage));
    await screen.findByRole("button", { name: "Edit" });
    expect(fixture.loadEditor).not.toHaveBeenCalled();
    const trigger = screen.getByRole("button", { name: "Edit" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByText("Preparing your address form…");
    fireEvent.click(screen.getByRole("button", { name: "Close address form" }));
    expect(document.activeElement).toBe(trigger);
    await act(async () => { pending.resolve(AddressEditorFlow); });
    expect(screen.queryByLabelText("Flat / house / floor")).toBeNull();
    fireEvent.click(trigger);
    const field = await screen.findByLabelText("Flat / house / floor");
    fireEvent.change(field, { target: { value: "Unsaved draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Close address flow" }));
    fireEvent.click(trigger);
    expect((await screen.findByLabelText("Flat / house / floor") as HTMLInputElement).value).toBe("Original house");
  });

  it("shows a failed chunk with retry, then saves through the existing form and endpoint", async () => {
    fixture.loadEditor.mockRejectedValueOnce(new Error("Chunk unavailable"));
    render(createElement(AddressesPage));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByText("We couldn’t open the address form. Please try again.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByLabelText("Flat / house / floor");
    fireEvent.click(screen.getByRole("button", { name: "Save and use this address" }));
    await waitFor(() => expect(fixture.request).toHaveBeenCalledWith(`/api/customer/addresses/${address.id}`, expect.objectContaining({ method: "PUT" })));
    await screen.findByText("Address saved and set as your default delivery address.");
  });

  it("closes a pending private form on session replacement and ignores the late chunk", async () => {
    const pending = deferred<typeof AddressEditorFlow>();
    fixture.loadEditor.mockReturnValueOnce(pending.promise);
    render(createElement(AddressesPage));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByText("Preparing your address form…");
    act(() => { setSessionIdentity({ ...owner, id: "55555555-5555-4555-8555-555555555555" }); });
    expect(screen.queryByRole("button", { name: "Close address form" })).toBeNull();
    await act(async () => { pending.resolve(AddressEditorFlow); });
    expect(screen.queryByLabelText("Flat / house / floor")).toBeNull();
  });
});

describe("payment optional display profile", () => {
  it("renders an authoritative checkout while profile hydration remains pending", async () => {
    render(createElement(RazorpayPayment, { checkoutId }));
    await screen.findByText("This checkout is already paid.");
    expect(fetcher.mock.calls.some(([input]) => String(input) === `/api/checkout/${checkoutId}`)).toBe(true);
    expect(fixture.request).toHaveBeenCalledWith("/api/customer/profile", expect.anything());
  });

  it("opens backend-created payment with verified identity prefill before optional profile completes", async () => {
    let options: { prefill: { name: string; email: string; contact: string }; modal: { ondismiss(): void } } | undefined;
    vi.stubGlobal("Razorpay", class {
      constructor(value: typeof options) { options = value; }
      open() { options!.modal.ondismiss(); }
      on() {}
    });
    const parsed = parseCheckout(checkout())!;
    expect(parsed).not.toBeNull();
    render(createElement(CheckoutPaymentButton, { checkout: parsed, previewAmount: 234, currency: "INR", failure: null, ensureCheckout: vi.fn(async () => parsed), onFailure: vi.fn() }));
    fireEvent.click(screen.getByRole("button", { name: "Pay ₹234" }));
    await waitFor(() => expect(options).toBeDefined());
    expect(options!.prefill).toEqual({ name: owner.displayName, email: owner.email, contact: owner.phoneNumber });
    expect(fixture.request).toHaveBeenCalledWith("/api/payments/orders", expect.objectContaining({ method: "POST", body: JSON.stringify({ checkoutId }) }));
    expect(fetcher.mock.calls.some(([input]) => String(input) === "/api/auth/me")).toBe(true);
  });
});
