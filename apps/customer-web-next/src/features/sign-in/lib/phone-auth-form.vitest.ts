// @vitest-environment jsdom
// The shared phone sign-in form (/sign-in, /chef/sign-in); no OTP service is called.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PhoneAuthForm } from "../components/phone-auth-form";
import { LanguageProvider } from "@/shared/i18n/language-context";
import type { Language } from "@/shared/i18n/language";

// createElement passes children as its third argument; the cast only makes that prop optional.
const Provider = LanguageProvider as (props: { initial: Language; chosen: boolean; children?: ReactNode }) => ReactNode;

const mocks = vi.hoisted(() => ({ msg91: vi.fn() }));
// Only the chef language provider uses the router (to redraw server text after a change).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("firebase/auth", () => ({ RecaptchaVerifier: class { render = vi.fn(); clear = vi.fn(); }, signInWithPhoneNumber: vi.fn() }));
vi.mock("@/features/auth/lib/firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: {} }) }));
vi.mock("@/features/sign-in/lib/msg91-browser", () => ({ beginMsg91PhoneSignIn: mocks.msg91, parkMsg91Captcha: vi.fn() }));

afterEach(() => {
  cleanup();
  mocks.msg91.mockReset();
  vi.unstubAllGlobals();
});

const phoneField = () => screen.getByLabelText("Mobile number") as HTMLInputElement;
const type = (input: HTMLInputElement, value: string, caret = value.length) =>
  fireEvent.change(input, { target: { value, selectionStart: caret, selectionEnd: caret } });

it("keeps +91 fixed, shows the 10 digits grouped and sends the number as +91…", async () => {
  mocks.msg91.mockResolvedValue({ confirm: vi.fn() });
  render(createElement(PhoneAuthForm, { returnTo: "/chef" }));
  const input = phoneField();
  expect([input.name, input.getAttribute("inputmode"), input.getAttribute("autocomplete")]).toEqual(["phone", "numeric", "tel-national"]);
  type(input, "987654");
  expect(input.value).toBe("98765 4");
  for (const pasted of ["+91 98765 43210", "919876543210", "09876543210", "98765-43210", "(98765) 43210"]) {
    type(input, "");
    type(input, pasted);
    expect(input.value, pasted).toBe("98765 43210");
  }
  fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
  await waitFor(() => expect(mocks.msg91).toHaveBeenCalledExactlyOnceWith("+919876543210", "craves-recaptcha"));
  // The OTP step says where the code went; Change replaces the old full-width button.
  expect((await screen.findByText(/^Sent to/)).textContent).toBe("Sent to +91 98765 43210");
  expect(screen.getByLabelText("Six-digit OTP").getAttribute("aria-describedby")).toBe("otp-sent-to");
  expect(screen.queryByRole("button", { name: "Use another number" })).toBeNull();
  expect(screen.getByRole("button", { name: "Resend OTP in 30s" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Change mobile number" }));
  expect(phoneField().value).toBe("98765 43210");
});

it("keeps the caret after the same digit while the space moves", () => {
  render(createElement(PhoneAuthForm, { returnTo: "/chef" }));
  const input = phoneField();
  type(input, "987654321");
  // A digit typed early in the number stays where it was typed instead of jumping to the end.
  type(input, "980765 4321", 3);
  expect([input.value, input.selectionStart]).toEqual(["98076 54321", 3]);
  // Backspace on the digit after the space.
  type(input, "98076 4321", 6);
  expect([input.value, input.selectionStart]).toEqual(["98076 4321", 5]);
});

it("explains an invalid number under the field and keeps Send OTP enabled", async () => {
  render(createElement(PhoneAuthForm, { returnTo: "/chef" }));
  const input = phoneField();
  const send = screen.getByRole("button", { name: "Send OTP" });
  fireEvent.click(send);
  expect((await screen.findByRole("alert")).textContent).toBe("Enter a 10-digit mobile number.");
  expect([input.getAttribute("aria-invalid"), input.getAttribute("aria-describedby")]).toEqual(["true", "phone-error"]);
  expect(document.activeElement).toBe(input);
  type(input, "5876543210");
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(send);
  expect((await screen.findByRole("alert")).textContent).toBe("Indian mobile numbers start with 6, 7, 8 or 9.");
  expect(send.hasAttribute("disabled")).toBe(false);
  expect(mocks.msg91).not.toHaveBeenCalled();
});

it("speaks a chef's language, including the reasons from the shared error helpers", async () => {
  render(createElement(Provider, { initial: "te", chosen: true }, createElement(PhoneAuthForm, { returnTo: "/chef" })));
  expect(screen.getByRole("heading", { name: "మీ వంటగదిలోకి సైన్ ఇన్ చేయండి" })).toBeTruthy();
  expect(screen.getByText("OTP పొందడానికి మీ మొబైల్ నంబర్ ఇవ్వండి.")).toBeTruthy();
  const input = screen.getByLabelText("మొబైల్ నంబర్") as HTMLInputElement;
  expect(input.placeholder).toBe("10 అంకెల నంబర్");
  const send = screen.getByRole("button", { name: "OTP పంపండి" });
  fireEvent.click(send);
  expect((await screen.findByRole("alert")).textContent).toBe("10 అంకెల మొబైల్ నంబర్ ఇవ్వండి.");

  type(input, "9876543210");
  mocks.msg91.mockRejectedValueOnce(new Error("OTP_UNAVAILABLE"));
  fireEvent.click(send);
  expect(await screen.findByText("ఫోన్ సైన్ ఇన్ ప్రస్తుతం పని చేయడం లేదు. కొంతసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.")).toBeTruthy();

  mocks.msg91.mockResolvedValueOnce({ confirm: vi.fn() });
  fireEvent.click(send);
  // Telugu puts the number first.
  await waitFor(() => expect(document.getElementById("otp-sent-to")?.textContent).toBe("+91 98765 43210 కు పంపాము"));
  expect(screen.getByLabelText("6 అంకెల OTP")).toBeTruthy();
  expect(screen.getByRole("button", { name: "30 సెకన్ల తర్వాత మళ్లీ పంపండి" })).toBeTruthy();
});

it("shows a signed-in number as +91 98765 43210", () => {
  render(createElement(PhoneAuthForm, { returnTo: "/chef", initialPhone: "+919876543210" }));
  expect(screen.getByText("+91 98765 43210")).toBeTruthy();
});

it("opens the next step as soon as the session exists, while the accepted wave plays", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ identity: { id: "31111111-1111-4111-8111-111111111111" } })));
  mocks.msg91.mockResolvedValue({ confirm: vi.fn().mockResolvedValue({ user: { getIdToken: vi.fn().mockResolvedValue("token") } }) });
  const onSignedIn = vi.fn(() => new Promise<void>(() => {}));
  render(createElement(PhoneAuthForm, { returnTo: "/chef", onSignedIn }));
  type(phoneField(), "9876543210");
  fireEvent.click(screen.getByRole("button", { name: "Send OTP" }));
  fireEvent.change(await screen.findByLabelText("Six-digit OTP"), { target: { value: "123456" } });
  // The old fixed 450 ms pause would miss this window.
  await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce(), { timeout: 300 });
  expect(document.querySelector(".code-slots")?.classList.contains("is-success")).toBe(true);
  expect(screen.getByRole("button", { name: "Opening…" }).getAttribute("aria-busy")).toBe("true");
});
