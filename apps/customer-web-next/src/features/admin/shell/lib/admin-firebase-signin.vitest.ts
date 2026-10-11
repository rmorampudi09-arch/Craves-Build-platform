// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PhoneAuthForm } from "../../../sign-in/components/phone-auth-form";

const mocks = vi.hoisted(() => ({ firebaseSend: vi.fn(), msg91: vi.fn() }));
vi.mock("firebase/auth", () => ({
  RecaptchaVerifier: class { render = vi.fn().mockResolvedValue(0); clear = vi.fn(); },
  signInWithPhoneNumber: mocks.firebaseSend,
}));
vi.mock("@/features/auth/lib/firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: {} }) }));
vi.mock("@/features/sign-in/lib/msg91-browser", () => ({ beginMsg91PhoneSignIn: mocks.msg91, parkMsg91Captcha: vi.fn() }));

afterEach(() => { cleanup(); mocks.firebaseSend.mockReset(); mocks.msg91.mockReset(); });

function sendCode(centralOtp?: boolean) {
  render(createElement(PhoneAuthForm, { returnTo: "/admin", centralOtp }));
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+919876543210" } });
  fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
}

it("admin portal without central OTP signs in with Firebase phone auth", async () => {
  mocks.firebaseSend.mockResolvedValue({ confirm: vi.fn() });
  sendCode(false);
  await waitFor(() => expect(mocks.firebaseSend).toHaveBeenCalledOnce());
  expect(mocks.msg91).not.toHaveBeenCalled();
});

it("hosts with the central MSG91 OTP keep using it", async () => {
  mocks.msg91.mockResolvedValue({ confirm: vi.fn() });
  sendCode();
  await waitFor(() => expect(mocks.msg91).toHaveBeenCalledOnce());
  expect(mocks.firebaseSend).not.toHaveBeenCalled();
});
