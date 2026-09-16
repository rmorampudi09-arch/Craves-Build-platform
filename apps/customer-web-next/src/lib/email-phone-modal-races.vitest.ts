// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthModal } from "../components/auth/AuthModal";
import { getSession, setSessionIdentity } from "../services/auth/cravesAuth";
const mocks = vi.hoisted(() => ({ send: vi.fn(), render: vi.fn(), clear: vi.fn() }));
vi.mock("firebase/auth", () => ({ RecaptchaVerifier: class { render = mocks.render; clear = mocks.clear; }, signInWithPhoneNumber: mocks.send }));
vi.mock("./firebase-client", () => ({ getFirebaseBrowserClient: () => ({ auth: {} }) }));
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const identity = { id, phoneNumber: "+10000000000", email: null, emailVerified: false, displayName: "Fixture", status: "ACTIVE", roles: ["CUSTOMER"] };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { setSessionIdentity(identity); mocks.send.mockReset(); mocks.render.mockReset().mockResolvedValue(0); mocks.clear.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup() {
  const props = { open: true, mode: "login" as const, onClose: vi.fn(), onSwitchMode: vi.fn(), onAuthenticated: vi.fn() };
  const view = render(createElement(AuthModal, props));
  fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "0000000000" } });
  fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
  return { props, view };
}
it("does not send a phone code when the modal closes during reCAPTCHA rendering", async () => {
  const widget = deferred<number>(); mocks.render.mockReturnValue(widget.promise);
  const { props, view } = setup(); await waitFor(() => expect(mocks.render).toHaveBeenCalledOnce());
  view.rerender(createElement(AuthModal, { ...props, open: false }));
  await act(async () => widget.resolve(0));
  expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.clear).toHaveBeenCalledOnce();
  view.rerender(createElement(AuthModal, props)); expect(screen.queryByLabelText("Six-digit verification code")).toBeNull();
});
it("does not restore a sent phone challenge after closing and reopening for another number", async () => {
  const sent = deferred<unknown>(); mocks.send.mockReturnValue(sent.promise);
  const { props, view } = setup(); await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
  view.rerender(createElement(AuthModal, { ...props, open: false })); view.rerender(createElement(AuthModal, props));
  fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "1111111111" } });
  await act(async () => sent.resolve({ confirm: vi.fn() }));
  expect(screen.queryByLabelText("Six-digit verification code")).toBeNull();
  expect((screen.getByLabelText(/Mobile number/) as HTMLInputElement).value).toBe("1111111111");
});
it("ignores a phone-send result after a different owner signs in", async () => {
  const sent = deferred<unknown>(); mocks.send.mockReturnValue(sent.promise);
  const { props } = setup(); await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
  act(() => setSessionIdentity({ ...identity, id: other }));
  await act(async () => sent.resolve({ confirm: vi.fn() }));
  expect(screen.queryByLabelText("Six-digit verification code")).toBeNull(); expect(props.onAuthenticated).not.toHaveBeenCalled();
});
it("does not exchange or complete a confirmed phone code after parent-driven close", async () => {
  const confirmed = deferred<unknown>(); const token = vi.fn();
  mocks.send.mockResolvedValue({ confirm: () => confirmed.promise });
  const fetched = vi.fn(); vi.stubGlobal("fetch", fetched);
  const { props, view } = setup();
  fireEvent.change(await screen.findByLabelText("Six-digit verification code"), { target: { value: "000123" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in as Customer" }));
  view.rerender(createElement(AuthModal, { ...props, open: false }));
  await act(async () => confirmed.resolve({ user: { getIdToken: token } }));
  expect(token).not.toHaveBeenCalled(); expect(fetched).not.toHaveBeenCalled(); expect(props.onAuthenticated).not.toHaveBeenCalled();
});
it("does not install an old Auth exchange response after another owner signs in", async () => {
  const exchanged = deferred<Response>(); mocks.send.mockResolvedValue({ confirm: async () => ({ user: { getIdToken: async () => "fixture-only-token" } }) });
  const fetched = vi.fn().mockReturnValue(exchanged.promise); vi.stubGlobal("fetch", fetched);
  const { props } = setup();
  fireEvent.change(await screen.findByLabelText("Six-digit verification code"), { target: { value: "000123" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in as Customer" }));
  await waitFor(() => expect(fetched).toHaveBeenCalledOnce());
  act(() => setSessionIdentity({ ...identity, id: other }));
  await act(async () => exchanged.resolve(Response.json({ identity })));
  expect(getSession()?.id).toBe(other); expect(props.onAuthenticated).not.toHaveBeenCalled();
});
